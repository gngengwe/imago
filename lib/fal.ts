import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const MODEL = "fal-ai/nano-banana-pro/edit";

export interface FalEditStatus {
  status: "pending" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
}

export async function submitEdit(prompt: string, imageUrls: string[]): Promise<string> {
  const { request_id } = await fal.queue.submit(MODEL, {
    input: {
      prompt,
      image_urls: imageUrls,
      num_images: 1,
      resolution: "2K",
      output_format: "png",
    },
  });
  return request_id;
}

export async function checkEdit(requestId: string): Promise<FalEditStatus> {
  try {
    const status = await fal.queue.status(MODEL, { requestId, logs: false });
    if (status.status !== "COMPLETED") {
      return { status: "pending" };
    }

    const result = await fal.queue.result(MODEL, { requestId });
    const data = result.data as { images?: { url: string }[] };
    const url = data.images?.[0]?.url;
    if (!url) return { status: "failed", error: "fal.ai returned no image" };
    return { status: "completed", resultUrl: url };
  } catch (err) {
    return { status: "failed", error: (err as Error).message };
  }
}
