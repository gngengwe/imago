import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

export const DEFAULT_MODEL = "fal-ai/nano-banana-pro/edit";
export const ALT_MODEL = "fal-ai/gpt-image-1/edit-image";

// fal.ai's published price for nano-banana-pro/edit at 1K/2K resolution; used
// for a display-only cost estimate, not pulled from real billing.
export const COST_PER_IMAGE_USD = 0.15;

export interface FalEditStatus {
  status: "pending" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
}

function buildInput(model: string, prompt: string, imageUrls: string[]) {
  if (model === ALT_MODEL) {
    // gpt-image-1/edit-image has a different param shape than nano-banana-pro.
    return { prompt, image_urls: imageUrls, quality: "high", output_format: "png" };
  }
  return { prompt, image_urls: imageUrls, num_images: 1, resolution: "2K", output_format: "png" };
}

export async function submitEdit(
  prompt: string,
  imageUrls: string[],
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const { request_id } = await fal.queue.submit(model, { input: buildInput(model, prompt, imageUrls) });
  return request_id;
}

export async function checkEdit(requestId: string, model: string = DEFAULT_MODEL): Promise<FalEditStatus> {
  try {
    const status = await fal.queue.status(model, { requestId, logs: false });
    if (status.status !== "COMPLETED") {
      return { status: "pending" };
    }

    const result = await fal.queue.result(model, { requestId });
    const data = result.data as { images?: { url: string }[] };
    const url = data.images?.[0]?.url;
    if (!url) return { status: "failed", error: "fal.ai returned no image" };
    return { status: "completed", resultUrl: url };
  } catch (err) {
    return { status: "failed", error: (err as Error).message };
  }
}
