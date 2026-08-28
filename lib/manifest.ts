import { put, list } from "@vercel/blob";
import { nanoid } from "nanoid";
import type { ProjectManifest } from "./types";

type ManifestBlob = Awaited<ReturnType<typeof list>>["blobs"][number];

function manifestPrefix(id: string) {
  return `projects/${id}/manifest/`;
}

// Vercel Blob's public URLs are CDN-cached by pathname regardless of query string,
// so overwriting one fixed path (even with cache-busting) can serve stale content
// right after a write. Instead, each save is a brand-new, never-before-requested
// URL — which can never be a stale cache hit — and reads pick the newest by list().
//
// Deliberately no cleanup of old versions here: under concurrent writes (multiple
// enhance/status calls racing updateManifest at once, which this app does routinely)
// a list()-based "keep newest N, delete the rest" step can act on an incomplete
// snapshot and delete versions that are still current. The JSON files are a few KB
// each, so leaving old versions around is cheap; deleting them wrongly is not.
export async function saveManifest(manifest: ProjectManifest): Promise<void> {
  const pathname = `${manifestPrefix(manifest.id)}${Date.now()}-${nanoid(6)}.json`;
  await put(pathname, JSON.stringify(manifest), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

async function listLatest(id: string): Promise<ManifestBlob | null> {
  // list() can lag slightly behind a just-completed write under heavy concurrent
  // traffic; retry briefly rather than declaring the project missing.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { blobs } = await list({ prefix: manifestPrefix(id) });
    if (blobs.length > 0) {
      return blobs.reduce((a, b) => (b.uploadedAt > a.uploadedAt ? b : a));
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function fetchManifest(blob: ManifestBlob): Promise<ProjectManifest | null> {
  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as ProjectManifest;
}

export async function loadManifest(id: string): Promise<ProjectManifest | null> {
  const latest = await listLatest(id);
  if (!latest) return null;
  return fetchManifest(latest);
}

/**
 * Single-user tool: no real distributed lock — but bulk-approve and the
 * multi-model compare feature both fire several concurrent updateManifest
 * calls at the same project, so a plain unprotected read-modify-write can
 * silently lose one side's update. This narrows (doesn't eliminate) that
 * race: after computing the update, re-check whether a newer version landed
 * while we were working, and if so, redo the update against that newer
 * state instead of blindly overwriting it.
 */
export async function updateManifest(
  id: string,
  updater: (manifest: ProjectManifest) => ProjectManifest | Promise<ProjectManifest>,
): Promise<ProjectManifest> {
  let base = await listLatest(id);
  if (!base) throw new Error(`Project ${id} not found`);

  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await fetchManifest(base);
    if (!current) throw new Error(`Project ${id} not found`);

    const updated = await updater(current);

    const after = await listLatest(id);
    if (after && after.uploadedAt.getTime() !== base.uploadedAt.getTime() && attempt < 4) {
      // Someone else wrote in between; redo the update against their newer state.
      base = after;
      continue;
    }

    await saveManifest(updated);
    return updated;
  }

  throw new Error(`Project ${id} had too many concurrent writes; try again`);
}
