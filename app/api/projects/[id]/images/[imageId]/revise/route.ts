import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { updateManifest } from "@/lib/manifest";
import { submitEdit, DEFAULT_MODEL } from "@/lib/fal";
import { buildEnhancementPrompt } from "@/lib/prompts";
import { cropAndUploadImage } from "@/lib/storage";
import type { EnhancementVersion } from "@/lib/types";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await params;
  try {
    const { feedback } = await req.json();
    if (typeof feedback !== "string" || !feedback.trim()) {
      return NextResponse.json({ error: "feedback is required" }, { status: 400 });
    }

    const manifest = await updateManifest(id, async (m) => {
      const photo = m.photos.find((p) => p.id === imageId);
      if (!photo) throw new Error("Photo not found");

      // Reuse the style/model from the photo's last enhancement so a revision
      // doesn't silently fall back to defaults and drop what was chosen earlier.
      const last = photo.enhancements[photo.enhancements.length - 1];
      const styleId = last?.styleId ?? "editorial";
      const model = last?.model ?? DEFAULT_MODEL;

      const sourceUrl =
        photo.useCrop && photo.suggestedCrop
          ? await cropAndUploadImage(id, photo.id, photo.originalUrl, photo.suggestedCrop)
          : photo.originalUrl;

      const prompt = buildEnhancementPrompt(m.narrativeSummary ?? m.narrativeBrief, styleId, feedback);
      const requestId = await submitEdit(prompt, [sourceUrl], model);
      const version: EnhancementVersion = {
        id: nanoid(10),
        historyId: requestId,
        model,
        styleId,
        prompt,
        feedback,
        status: "pending",
        createdAt: new Date().toISOString(),
        batchId: nanoid(8),
      };

      return {
        ...m,
        photos: m.photos.map((p) =>
          p.id !== imageId ? p : { ...p, enhancements: [...p.enhancements, version] },
        ),
      };
    });

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
