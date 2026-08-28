import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { updateManifest } from "@/lib/manifest";
import type { PhotoRecord } from "@/lib/types";

interface UploadedPhoto {
  filename: string;
  url: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const photos: UploadedPhoto[] = Array.isArray(body.photos) ? body.photos : [];
    if (photos.length === 0) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 });
    }

    const records: PhotoRecord[] = photos.map((p) => ({
      id: nanoid(10),
      filename: p.filename,
      originalUrl: p.url,
      selected: false,
      useCrop: false,
      enhancements: [],
    }));

    const manifest = await updateManifest(id, (m) => ({
      ...m,
      status: "uploaded",
      photos: [...m.photos, ...records],
    }));

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
