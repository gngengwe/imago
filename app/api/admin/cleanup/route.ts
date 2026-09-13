import { NextResponse } from "next/server";
import { listAllProjectIds, pruneManifestVersions, loadManifest, ORIGINALS_RETENTION_DAYS } from "@/lib/manifest";
import { deleteProjectOriginals } from "@/lib/storage";

// Same safe ceiling used elsewhere in the app — Hobby caps at 60s regardless
// of what's configured, so there's no benefit to asking for more here.
export const maxDuration = 60;

// Scheduled maintenance (see vercel.json for the daily cron — Vercel Cron
// always sends GET), also safe to trigger by hand — gated the same way as
// every other route (password cookie), plus a CRON_SECRET bypass in
// middleware.ts for the cron itself, which can't carry a browser cookie.
export async function GET() {
  try {
    const projectIds = await listAllProjectIds();

    let prunedVersions = 0;
    const expiredProjects: string[] = [];
    const retentionCutoff = Date.now() - ORIGINALS_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const id of projectIds) {
      prunedVersions += await pruneManifestVersions(id);

      const manifest = await loadManifest(id);
      if (manifest?.exportedAt && new Date(manifest.exportedAt).getTime() < retentionCutoff) {
        const deleted = await deleteProjectOriginals(id);
        if (deleted > 0) expiredProjects.push(id);
      }
    }

    return NextResponse.json({ ok: true, projectsScanned: projectIds.length, prunedVersions, expiredProjects });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
