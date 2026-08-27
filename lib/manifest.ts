import { put, list } from "@vercel/blob";
import type { ProjectManifest } from "./types";

function manifestPath(id: string) {
  return `projects/${id}/manifest.json`;
}

export async function saveManifest(manifest: ProjectManifest): Promise<void> {
  await put(manifestPath(manifest.id), JSON.stringify(manifest, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function loadManifest(id: string): Promise<ProjectManifest | null> {
  const path = manifestPath(id);
  const { blobs } = await list({ prefix: path, limit: 1 });
  const blob = blobs.find((b) => b.pathname === path);
  if (!blob) return null;
  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as ProjectManifest;
}

/**
 * Single-user tool: read-modify-write, no locking. Good enough at this scale
 * (see plan) — a real DB would be needed if this ever gets concurrent writers.
 */
export async function updateManifest(
  id: string,
  updater: (manifest: ProjectManifest) => ProjectManifest | Promise<ProjectManifest>,
): Promise<ProjectManifest> {
  const current = await loadManifest(id);
  if (!current) throw new Error(`Project ${id} not found`);
  const updated = await updater(current);
  await saveManifest(updated);
  return updated;
}
