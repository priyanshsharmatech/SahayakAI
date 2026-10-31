import connectDb from "@/lib/db";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Status = "ok" | "down" | "unconfigured";
interface Service {
  name: string;
  status: Status;
  detail: string;
}

/**
 * Platform health: presence/ping checks only (no slow external calls).
 */
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const services: Service[] = [];

    // MongoDB: cheap ping via the mongoose connection.
    try {
      const conn = await connectDb();
      await conn.db?.command({ ping: 1 });
      services.push({ name: "MongoDB", status: "ok", detail: "ping ok" });
    } catch (e) {
      console.error("health: MongoDB ping failed:", e);
      services.push({ name: "MongoDB", status: "down", detail: "ping failed" });
    }

    // Cloudinary: configured?
    services.push({
      name: "Cloudinary",
      status: isCloudinaryConfigured() ? "ok" : "unconfigured",
      detail: isCloudinaryConfigured()
        ? "credentials present"
        : "missing CLOUDINARY_* env vars",
    });

    // SMTP: env vars present?
    const smtpOk = Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
    );
    services.push({
      name: "SMTP",
      status: smtpOk ? "ok" : "unconfigured",
      detail: smtpOk ? "credentials present" : "missing SMTP_* env vars",
    });

    // Gemini: API key present?
    const geminiOk = Boolean(process.env.GEMINI_API_KEY);
    services.push({
      name: "Gemini",
      status: geminiOk ? "ok" : "unconfigured",
      detail: geminiOk ? "GEMINI_API_KEY present" : "missing GEMINI_API_KEY",
    });

    return NextResponse.json({ services });
  } catch (e) {
    console.error("admin/health GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
