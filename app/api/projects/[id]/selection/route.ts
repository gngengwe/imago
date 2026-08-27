import { NextRequest, NextResponse } from "next/server";
import { updateManifest } from "@/lib/manifest";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { photoIds } = await req.json();
    if (!Array.isArray(photoIds)) {
      return NextResponse.json({ error: "photoIds must be an array" }, { status: 400 });
    }
    const selectedSet = new Set<string>(photoIds);

    const manifest = await updateManifest(id, (m) => ({
      ...m,
      photos: m.photos.map((p) => ({ ...p, selected: selectedSet.has(p.id) })),
    }));

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
