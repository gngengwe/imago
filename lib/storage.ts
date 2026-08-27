import { put } from "@vercel/blob";
import { nanoid } from "nanoid";

export async function uploadOriginalPhoto(
  projectId: string,
  filename: string,
  file: File,
): Promise<{ id: string; url: string }> {
  const id = nanoid(10);
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  const pathname = `projects/${projectId}/originals/${id}${ext}`;
  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type || undefined,
  });
  return { id, url: blob.url };
}

export async function uploadEnhancedImage(
  projectId: string,
  photoId: string,
  versionId: string,
  data: ArrayBuffer,
  contentType = "image/png",
): Promise<string> {
  const pathname = `projects/${projectId}/enhanced/${photoId}/${versionId}.png`;
  const blob = await put(pathname, data, { access: "public", contentType });
  return blob.url;
}
