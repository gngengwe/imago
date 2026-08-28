import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { updateManifest } from "@/lib/manifest";
import { submitEdit, DEFAULT_MODEL, ALT_MODEL } from "@/lib/fal";
import { buildEnhancementPrompt } from "@/lib/prompts";
import { cropAndUploadImage } from "@/lib/storage";
import type { EnhancementStyleId, EnhancementVersion } from "@/lib/types";

export const maxDuration = 60;

function isStyleId(v: unknown): v is EnhancementStyleId {
  return v === "natural" || v === "editorial" || v === "dramatic";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const requestedIds: string[] | undefined = Array.isArray(body.photoIds) ? body.photoIds : undefined;
    const styleId: EnhancementStyleId = isStyleId(body.styleId) ? body.styleId : "editorial";
    const compareModels = body.compareModels === true;
    const models = compareModels ? [DEFAULT_MODEL, ALT_MODEL] : [DEFAULT_MODEL];
    const cropOverrides: Record<string, boolean> =
      body.cropOverrides && typeof body.cropOverrides === "object" ? body.cropOverrides : {};

    const manifest = await updateManifest(id, async (m) => {
      const targets = m.photos
        .filter((p) => (requestedIds ? requestedIds.includes(p.id) : p.selected))
        .map((p) => (p.id in cropOverrides ? { ...p, useCrop: cropOverrides[p.id] } : p));
      if (targets.length === 0) throw new Error("No photos selected to enhance");

      const prompt = buildEnhancementPrompt(m.narrativeSummary ?? m.narrativeBrief, styleId);

      const submitted = await Promise.all(
        targets.map(async (p) => {
          const sourceUrl =
            p.useCrop && p.suggestedCrop
              ? await cropAndUploadImage(id, p.id, p.originalUrl, p.suggestedCrop)
              : p.originalUrl;

          const batchId = nanoid(8);
          const versions = await Promise.all(
            models.map(async (model): Promise<EnhancementVersion> => {
              const requestId = await submitEdit(prompt, [sourceUrl], model);
              return {
                id: nanoid(10),
                historyId: requestId,
                model,
                styleId,
                prompt,
                status: "pending",
                createdAt: new Date().toISOString(),
                batchId,
              };
            }),
          );
          return { photoId: p.id, versions };
        }),
      );
      const versionsByPhotoId = new Map(submitted.map((s) => [s.photoId, s.versions]));

      return {
        ...m,
        status: "enhancing" as const,
        photos: m.photos.map((p) => {
          const versions = versionsByPhotoId.get(p.id);
          const useCrop = p.id in cropOverrides ? cropOverrides[p.id] : p.useCrop;
          return versions ? { ...p, useCrop, enhancements: [...p.enhancements, ...versions] } : p;
        }),
      };
    });

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
