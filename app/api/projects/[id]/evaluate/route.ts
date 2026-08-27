import { NextRequest, NextResponse } from "next/server";
import { updateManifest } from "@/lib/manifest";
import { evaluatePhotoSet } from "@/lib/anthropic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const manifest = await updateManifest(id, async (m) => {
      if (m.photos.length === 0) throw new Error("No photos uploaded yet");

      const result = await evaluatePhotoSet(
        m.photos.map((p) => ({ id: p.id, url: p.originalUrl, filename: p.filename })),
        m.narrativeBrief,
      );
      const byId = new Map(result.photos.map((r) => [r.id, r]));

      return {
        ...m,
        status: "evaluated" as const,
        narrativeSummary: result.narrativeSummary,
        recommendedCount: result.recommendedCount,
        photos: m.photos.map((p) => {
          const evaluation = byId.get(p.id);
          if (!evaluation) return p;
          return {
            ...p,
            score: evaluation.score,
            recommended: evaluation.recommended,
            reason: evaluation.reason,
            issues: evaluation.issues,
            duplicateOf: evaluation.duplicateOf ?? undefined,
            selected: evaluation.recommended,
          };
        }),
      };
    });

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
