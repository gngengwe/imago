import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveManifest } from "@/lib/manifest";
import type { ProjectManifest } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const narrativeBrief = typeof body.narrativeBrief === "string" ? body.narrativeBrief : "";

    const manifest: ProjectManifest = {
      id: nanoid(12),
      createdAt: new Date().toISOString(),
      narrativeBrief,
      status: "created",
      photos: [],
    };

    await saveManifest(manifest);
    return NextResponse.json(manifest);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
