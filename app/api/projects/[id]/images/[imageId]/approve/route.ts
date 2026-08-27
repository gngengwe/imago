import { NextRequest, NextResponse } from "next/server";
import { updateManifest } from "@/lib/manifest";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await params;
  try {
    const { versionId } = await req.json();
    if (typeof versionId !== "string") {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    const manifest = await updateManifest(id, (m) => ({
      ...m,
      status: "reviewing" as const,
      photos: m.photos.map((p) => (p.id !== imageId ? p : { ...p, finalVersionId: versionId })),
    }));

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
