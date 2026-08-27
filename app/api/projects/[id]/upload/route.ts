import { NextRequest, NextResponse } from "next/server";
import { updateManifest } from "@/lib/manifest";
import { uploadOriginalPhoto } from "@/lib/storage";
import type { PhotoRecord } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploaded: PhotoRecord[] = await Promise.all(
      files.map(async (file) => {
        const { id: photoId, url } = await uploadOriginalPhoto(id, file.name, file);
        return {
          id: photoId,
          filename: file.name,
          originalUrl: url,
          selected: false,
          enhancements: [],
        };
      }),
    );

    const manifest = await updateManifest(id, (m) => ({
      ...m,
      status: "uploaded",
      photos: [...m.photos, ...uploaded],
    }));

    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
