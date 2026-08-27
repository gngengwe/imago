import { NextRequest, NextResponse } from "next/server";
import { loadManifest } from "@/lib/manifest";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manifest = await loadManifest(id);
  if (!manifest) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(manifest);
}
