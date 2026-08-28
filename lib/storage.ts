import { put } from "@vercel/blob";
import sharp from "sharp";
import type { PhotoCrop } from "./types";

export async function cropAndUploadImage(
  projectId: string,
  photoId: string,
  originalUrl: string,
  crop: PhotoCrop,
): Promise<string> {
  const res = await fetch(originalUrl);
  if (!res.ok) throw new Error(`Failed to fetch original image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(buf).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("Could not read image dimensions for crop");

  const left = Math.max(0, Math.round(crop.x * width));
  const top = Math.max(0, Math.round(crop.y * height));
  const cropWidth = Math.min(width - left, Math.round(crop.width * width));
  const cropHeight = Math.min(height - top, Math.round(crop.height * height));

  const cropped = await sharp(buf)
    .rotate()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 92 })
    .toBuffer();

  const pathname = `projects/${projectId}/cropped/${photoId}.jpg`;
  const blob = await put(pathname, cropped, { access: "public", contentType: "image/jpeg", allowOverwrite: true });
  return blob.url;
}

export async function uploadEnhancedImage(
  projectId: string,
  photoId: string,
  versionId: string,
  data: ArrayBuffer,
  contentType = "image/png",
): Promise<string> {
  const pathname = `projects/${projectId}/enhanced/${photoId}/${versionId}.png`;
  // Status checks can legitimately retry (e.g. after the upload succeeded but the
  // manifest write that recorded it failed), so this path must be re-uploadable.
  const blob = await put(pathname, data, { access: "public", contentType, allowOverwrite: true });
  return blob.url;
}
