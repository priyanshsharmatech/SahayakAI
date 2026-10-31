import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary client, configured from env vars. Requires:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * Server-side only — never import this into client components.
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

interface UploadOpts {
  /** Square-crop to 256×256 for avatars. Otherwise cap width and keep aspect. */
  avatar?: boolean;
}

/** Uploads an image buffer and returns its secure URL + public_id. */
export async function uploadImage(
  buffer: Buffer,
  folder: string,
  opts: UploadOpts = {},
): Promise<{ url: string; publicId: string }> {
  const transformation = opts.avatar
    ? [
        { width: 256, height: 256, crop: "fill", gravity: "auto" },
        { quality: "auto", fetch_format: "auto" },
      ]
    : [
        { width: 1600, crop: "limit" },
        { quality: "auto", fetch_format: "auto" },
      ];
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", transformation },
      (error, result) => {
        if (error || !result) return reject(error || new Error("Upload failed"));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

/** Best-effort delete of a previously uploaded image. Never throws. */
export async function deleteImage(publicId?: string): Promise<void> {
  if (!publicId || !isCloudinaryConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (e) {
    console.error("Cloudinary delete failed:", e);
  }
}

export default cloudinary;
