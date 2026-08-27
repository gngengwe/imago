import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { updateManifest } from "@/lib/manifest";
import { submitEdit } from "@/lib/fal";
import { buildEnhancementPrompt } from "@/lib/prompts";
import type { EnhancementVersion } from "@/lib/types";

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

      const prompt = buildEnhancementPrompt(m.narrativeSummary ?? m.narrativeBrief, feedback);
      const requestId = await submitEdit(prompt, [photo.originalUrl]);
      const version: EnhancementVersion = {
        id: nanoid(10),
        historyId: requestId,
        prompt,
        feedback,
        status: "pending",
        createdAt: new Date().toISOString(),
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
