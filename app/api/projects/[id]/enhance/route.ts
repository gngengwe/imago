import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { updateManifest } from "@/lib/manifest";
import { submitEdit } from "@/lib/fal";
import { buildEnhancementPrompt } from "@/lib/prompts";
import type { EnhancementVersion } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const requestedIds: string[] | undefined = Array.isArray(body.photoIds) ? body.photoIds : undefined;

    const manifest = await updateManifest(id, async (m) => {
      const targets = m.photos.filter((p) => (requestedIds ? requestedIds.includes(p.id) : p.selected));
      if (targets.length === 0) throw new Error("No photos selected to enhance");

      const prompt = buildEnhancementPrompt(m.narrativeSummary ?? m.narrativeBrief);

      const submitted = await Promise.all(
        targets.map(async (p) => {
          const requestId = await submitEdit(prompt, [p.originalUrl]);
          const version: EnhancementVersion = {
            id: nanoid(10),
            historyId: requestId,
            prompt,
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          return { photoId: p.id, version };
        }),
      );
      const versionByPhotoId = new Map(submitted.map((s) => [s.photoId, s.version]));

      return {
        ...m,
        status: "enhancing" as const,
        photos: m.photos.map((p) => {
          const version = versionByPhotoId.get(p.id);
          return version ? { ...p, enhancements: [...p.enhancements, version] } : p;
        }),
      };
    });

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
