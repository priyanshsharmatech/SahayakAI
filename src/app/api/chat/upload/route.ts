import { isCloudinaryConfigured, uploadImage } from "@/lib/cloudinary";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import { captureError } from "@/lib/observability";
import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Image uploads need the Node runtime (Buffer + Cloudinary stream upload).
export const runtime = "nodejs";

function withCors(response: NextResponse, allowOrigin = "*") {
  for (const [key, value] of Object.entries(
    corsHeaders(allowOrigin, "POST, OPTIONS"),
  )) {
    response.headers.set(key, value);
  }
  return response;
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * PUBLIC visitor upload endpoint (no session — this is an end-user on a
 * customer's website). Accepts a single image via multipart form-data and
 * returns its hosted URL so it can be attached to a chat message.
 *
 * Form fields: `file` (required), `botId` / `ownerId` (optional).
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`upload:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return withCors(
      NextResponse.json(
        { message: "Too many requests", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      ),
    );
  }

  if (!isCloudinaryConfigured()) {
    return withCors(
      NextResponse.json(
        { message: "File uploads are not available right now." },
        { status: 503 },
      ),
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return withCors(
      NextResponse.json({ message: "Invalid form data" }, { status: 400 }),
    );
  }

  const file = form.get("file");
  const botId = (form.get("botId") as string) || "anon";

  // Resolve per-bot CORS from the bot's allowlist when a real botId is given;
  // fall back to "*" when there's no bot / no allowlist. Best-effort: a lookup
  // failure must never block the upload.
  const origin = req.headers.get("origin");
  let allowOrigin = "*";
  if (botId && mongoose.isValidObjectId(botId)) {
    try {
      await connectDb();
      const bot = await Bot.findById(botId)
        .select("allowedDomains")
        .lean<{ allowedDomains?: string[] }>();
      if (bot) allowOrigin = resolveAllowOrigin(origin, bot.allowedDomains);
    } catch {
      /* best-effort — keep the open "*" fallback */
    }
  }

  if (!file || !(file instanceof Blob)) {
    return withCors(
      NextResponse.json({ message: "No file provided" }, { status: 400 }),
      allowOrigin,
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return withCors(
      NextResponse.json(
        { message: "Only PNG, JPEG, WebP, or GIF images are allowed." },
        { status: 400 },
      ),
      allowOrigin,
    );
  }

  if (file.size > MAX_BYTES) {
    return withCors(
      NextResponse.json(
        { message: "Image is too large. Maximum size is 5MB." },
        { status: 400 },
      ),
      allowOrigin,
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadImage(buffer, `sahayak/visitor/${botId}`);
    return withCors(NextResponse.json({ url }), allowOrigin);
  } catch (error) {
    captureError(error, { route: "chat/upload" });
    return withCors(
      NextResponse.json({ message: "Upload failed. Please try again." }, { status: 500 }),
      allowOrigin,
    );
  }
}

export const OPTIONS = async () =>
  new NextResponse(null, {
    status: 204,
    headers: corsHeaders("*", "POST, OPTIONS"),
  });
