import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { loadManifest } from "@/lib/manifest";
import type { EnhancementVersion, PhotoRecord } from "@/lib/types";

interface FinalEntry {
  photo: PhotoRecord;
  version: EnhancementVersion;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manifest = await loadManifest(id);
  if (!manifest) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const finals: FinalEntry[] = [];
  for (const photo of manifest.photos) {
    const version = photo.enhancements.find((v) => v.id === photo.finalVersionId);
    if (version?.resultUrl) finals.push({ photo, version });
  }

  if (finals.length === 0) {
    return NextResponse.json({ error: "No approved finals to export yet" }, { status: 400 });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });

  for (const { photo, version } of finals) {
    const res = await fetch(version.resultUrl!);
    const buf = Buffer.from(await res.arrayBuffer());
    const baseName = photo.filename.replace(/\.[^./\\]+$/, "");
    archive.append(buf, { name: `${baseName}-final.png` });
  }

  await archive.finalize();
  const zipBuffer = await done;

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="imago-${id}-finals.zip"`,
    },
  });
}
