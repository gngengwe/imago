import { NextRequest, NextResponse } from "next/server";
import { updateManifest } from "@/lib/manifest";
import { checkEdit } from "@/lib/fal";
import { uploadEnhancedImage } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await params;
  const versionId = req.nextUrl.searchParams.get("versionId");
  if (!versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });

  try {
    const manifest = await updateManifest(id, async (m) => {
      const photo = m.photos.find((p) => p.id === imageId);
      if (!photo) throw new Error("Photo not found");
      const version = photo.enhancements.find((v) => v.id === versionId);
      if (!version) throw new Error("Version not found");
      if (version.status !== "pending") return m;

      const result = await checkEdit(version.historyId);
      if (result.status === "pending") return m;

      let resultUrl: string | undefined;
      if (result.status === "completed" && result.resultUrl) {
        const imageRes = await fetch(result.resultUrl);
        const buf = await imageRes.arrayBuffer();
        resultUrl = await uploadEnhancedImage(id, imageId, versionId, buf);
      }

      return {
        ...m,
        photos: m.photos.map((p) =>
          p.id !== imageId
            ? p
            : {
                ...p,
                enhancements: p.enhancements.map((v) =>
                  v.id !== versionId ? v : { ...v, status: result.status, resultUrl, error: result.error },
                ),
              },
        ),
      };
    });

    const photo = manifest.photos.find((p) => p.id === imageId);
    const version = photo?.enhancements.find((v) => v.id === versionId);
    return NextResponse.json({ version: version ?? null });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
