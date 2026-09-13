import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { loadManifest, updateManifest } from "@/lib/manifest";

export const maxDuration = 60;

// Lets a project stop right after culling: export the kept originals as-is,
// with no enhancement pass and no fal.ai spend. Uses the persisted `selected`
// set (the same one the evaluation page's checkboxes write via PATCH /selection),
// not just the recommended subset, so the user's own overrides are respected.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manifest = await loadManifest(id);
  if (!manifest) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const kept = manifest.photos.filter((p) => p.selected);
  if (kept.length === 0) {
    return NextResponse.json({ error: "No photos selected to export" }, { status: 400 });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });

  for (const photo of kept) {
    const res = await fetch(photo.originalUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    archive.append(buf, { name: photo.filename });
  }

  await archive.finalize();
  const zipBuffer = await done;

  await updateManifest(id, (m) => ({ ...m, exportedAt: new Date().toISOString() }));

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="imago-${id}-selected.zip"`,
    },
  });
}
