import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/team";
import { deleteImage, isCloudinaryConfigured, uploadImage } from "@/lib/cloudinary";
import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { message: "Image uploads are not configured on the server." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ message: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { message: "Unsupported file type. Use PNG, JPG, WEBP, GIF, or SVG." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { message: "Image is too large (max 3 MB)." },
      { status: 400 },
    );
  }

  const oldPublicId = (() => {
    const v = form.get("oldPublicId");
    return typeof v === "string" && v.trim() ? v.trim() : "";
  })();

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, publicId } = await uploadImage(
      buffer,
      `sahayak/avatars/${user.id}`,
      { avatar: true },
    );
    // Best-effort cleanup of the previous avatar after a successful upload.
    if (oldPublicId && oldPublicId !== publicId) {
      await deleteImage(oldPublicId);
    }
    return NextResponse.json({ url, publicId });
  } catch (e) {
    console.error("Avatar upload failed:", e);
    return NextResponse.json({ message: "Upload failed. Please try again." }, { status: 500 });
  }
}
