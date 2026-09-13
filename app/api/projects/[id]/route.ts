import { NextRequest, NextResponse } from "next/server";
import { loadManifest } from "@/lib/manifest";
import { deleteAllProjectFiles } from "@/lib/storage";

export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manifest = await loadManifest(id);
  if (!manifest) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(manifest);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const deleted = await deleteAllProjectFiles(id);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
