"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import type { EnhancementStyleId, ProjectManifest } from "@/lib/types";
import { ENHANCEMENT_STYLES } from "@/lib/prompts";
import { COST_PER_IMAGE_USD } from "@/lib/fal";
import {
  getProjectDirHandle,
  ensureReadWritePermission,
  archivePhotosLocally,
  type ArchiveResult,
} from "@/lib/local-folder";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cropChoices, setCropChoices] = useState<Record<string, boolean>>({});
  const [styleId, setStyleId] = useState<EnhancementStyleId>("editorial");
  const [compareModels, setCompareModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveResults, setArchiveResults] = useState<ArchiveResult[] | null>(null);
  const [permissionNeeded, setPermissionNeeded] = useState(false);

  async function load() {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setError((await res.json()).error || "Failed to load project");
      return;
    }
    const data: ProjectManifest = await res.json();
    setManifest(data);
    setSelected(new Set(data.photos.filter((p) => p.selected).map((p) => p.id)));
    setCropChoices(Object.fromEntries(data.photos.map((p) => [p.id, p.useCrop])));
    return data;
  }

  async function runEvaluation() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/evaluate`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Evaluation failed");
      const data: ProjectManifest = await res.json();
      setManifest(data);
      setSelected(new Set(data.photos.filter((p) => p.selected).map((p) => p.id)));
      setCropChoices(Object.fromEntries(data.photos.map((p) => [p.id, p.useCrop])));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().then((data) => {
      if (data && data.status === "uploaded") runEvaluation();
    });
    getProjectDirHandle(id).then(setDirHandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggle(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function selectAllRecommended() {
    if (!manifest) return;
    setSelected(new Set(manifest.photos.filter((p) => p.recommended).map((p) => p.id)));
  }
  function selectAll() {
    if (!manifest) return;
    setSelected(new Set(manifest.photos.map((p) => p.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function enhanceSelected() {
    if (selected.size === 0) {
      setError("Select at least one photo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const selRes = await fetch(`/api/projects/${id}/selection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selected) }),
      });
      if (!selRes.ok) throw new Error((await selRes.json()).error || "Failed to save selection");

      const cropOverrides = Object.fromEntries(Array.from(selected).map((pid) => [pid, cropChoices[pid] ?? false]));

      const enhRes = await fetch(`/api/projects/${id}/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleId, compareModels, cropOverrides }),
      });
      if (!enhRes.ok) throw new Error((await enhRes.json()).error || "Failed to start enhancement");

      router.push(`/projects/${id}/review`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function exportSelectedOriginals() {
    if (selected.size === 0) {
      setError("Select at least one photo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const selRes = await fetch(`/api/projects/${id}/selection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selected) }),
      });
      if (!selRes.ok) throw new Error((await selRes.json()).error || "Failed to save selection");
      window.location.href = `/api/projects/${id}/export-originals`;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveCulled() {
    if (!manifest || !dirHandle) return;
    const culled = manifest.photos.filter((p) => !selected.has(p.id));
    if (culled.length === 0) {
      setError("Nothing to archive — every photo is currently selected.");
      return;
    }
    const ok = window.confirm(
      `Move ${culled.length} unselected photo(s) into an "Imago Archived" subfolder of ` +
        `your local folder? The originals will be removed from the top level. This can be ` +
        `undone manually by moving them back.`,
    );
    if (!ok) return;

    setArchiveBusy(true);
    setError(null);
    setArchiveResults(null);
    setPermissionNeeded(false);
    try {
      const granted = await ensureReadWritePermission(dirHandle);
      if (!granted) {
        setPermissionNeeded(true);
        return;
      }
      const results = await archivePhotosLocally(dirHandle, culled.map((p) => p.filename));
      setArchiveResults(results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setArchiveBusy(false);
    }
  }

  if (error && !manifest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-bad">{error}</main>;
  }
  if (!manifest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-paper-dim">Loading…</main>;
  }

  const evaluating = manifest.status === "uploaded" || busy;
  const costMultiplier = compareModels ? 2 : 1;
  const estimatedCost = selected.size * costMultiplier * COST_PER_IMAGE_USD;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Evaluation</h1>
      {manifest.narrativeSummary && (
        <p className="mb-4 text-paper-dim">{manifest.narrativeSummary}</p>
      )}
      {manifest.status === "evaluated" && manifest.recommendedCount != null && (
        <p className="font-display mb-6 text-xl text-paper">
          You uploaded <span className="text-accent">{manifest.photos.length}</span> photos — Imago
          recommends keeping <span className="text-accent">{manifest.recommendedCount}</span>.
        </p>
      )}
      {evaluating && manifest.status !== "evaluated" && (
        <p className="mb-6 text-paper-dim">Evaluating photos against the narrative…</p>
      )}
      {error && <p className="mb-4 text-bad">{error}</p>}

      {manifest.status === "evaluated" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <button className="btn-secondary" onClick={selectAllRecommended}>Select recommended</button>
          <button className="btn-secondary" onClick={selectAll}>Select all</button>
          <button className="btn-secondary" onClick={clearSelection}>Clear</button>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {manifest.photos.map((photo) => (
          <div key={photo.id} className="card overflow-hidden p-2">
            <label className="cursor-pointer">
              <img
                src={photo.originalUrl}
                alt={photo.filename}
                className="mb-2 aspect-square w-full rounded object-cover"
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{photo.filename}</p>
                  {typeof photo.score === "number" && (
                    <p className="text-xs text-paper-dim">score {photo.score}</p>
                  )}
                  {photo.duplicateOf && (
                    <p className="text-xs text-bad">near-duplicate</p>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={selected.has(photo.id)}
                  onChange={() => toggle(photo.id)}
                />
              </div>
            </label>
            {photo.reason && <p className="mt-1 text-xs text-paper-dim">{photo.reason}</p>}
            {photo.suggestedCrop && (
              <label className="mt-2 flex items-center gap-2 text-xs text-paper-dim">
                <input
                  type="checkbox"
                  checked={cropChoices[photo.id] ?? false}
                  onChange={(e) =>
                    setCropChoices((prev) => ({ ...prev, [photo.id]: e.target.checked }))
                  }
                />
                Reframe suggested
              </label>
            )}
          </div>
        ))}
      </div>

      <div className="card mb-6 flex flex-wrap items-center gap-4 p-4">
        <div>
          <p className="mb-1 text-xs text-paper-dim">Enhancement style</p>
          <div className="flex gap-1">
            {(Object.keys(ENHANCEMENT_STYLES) as EnhancementStyleId[]).map((sid) => (
              <button
                key={sid}
                type="button"
                onClick={() => setStyleId(sid)}
                className={sid === styleId ? "btn-primary" : "btn-secondary"}
              >
                {ENHANCEMENT_STYLES[sid].label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={compareModels}
            onChange={(e) => setCompareModels(e.target.checked)}
          />
          Compare 2 models per photo
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={enhanceSelected} disabled={busy || manifest.status !== "evaluated"}>
          {busy ? "Working…" : `Enhance Selected (${selected.size})`}
        </button>
        <span className="text-sm text-paper-dim">≈${estimatedCost.toFixed(2)}</span>
        <button
          className="btn-secondary"
          onClick={exportSelectedOriginals}
          disabled={busy || manifest.status !== "evaluated"}
        >
          Skip enhancement — export as-is ({selected.size})
        </button>
      </div>
      <p className="mt-2 text-xs text-paper-dim">
        Just want the culled set? Export the originals with no enhancement and no cost.
      </p>

      {dirHandle && manifest.status === "evaluated" && (
        <div className="card mt-6 p-4">
          <p className="eyebrow mb-1">Local folder</p>
          <p className="mb-3 text-sm text-paper-dim">
            This project was uploaded from a folder on this computer. You can archive the
            photos you didn&rsquo;t select — they&rsquo;ll move into an{" "}
            <span className="text-paper">Imago Archived</span> subfolder there, not be deleted
            outright.
          </p>

          {permissionNeeded && (
            <p className="mb-3 text-sm text-bad">
              This browser needs permission again to write to that folder — click below to
              re-grant it.
            </p>
          )}

          <button className="btn-secondary" onClick={archiveCulled} disabled={archiveBusy}>
            {archiveBusy
              ? "Archiving…"
              : `Archive culled photos to this folder (${manifest.photos.length - selected.size})`}
          </button>

          {archiveResults && (
            <div className="mt-3 text-sm">
              <p className="text-paper-dim">
                {archiveResults.filter((r) => r.ok).length} of {archiveResults.length} archived.
              </p>
              {archiveResults.some((r) => !r.ok) && (
                <ul className="mt-1 list-disc pl-5 text-bad">
                  {archiveResults
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.filename}>
                        {r.filename}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
