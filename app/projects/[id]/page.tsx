"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import type { ProjectManifest } from "@/lib/types";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setError((await res.json()).error || "Failed to load project");
      return;
    }
    const data: ProjectManifest = await res.json();
    setManifest(data);
    setSelected(new Set(data.photos.filter((p) => p.selected).map((p) => p.id)));
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

      const enhRes = await fetch(`/api/projects/${id}/enhance`, { method: "POST" });
      if (!enhRes.ok) throw new Error((await enhRes.json()).error || "Failed to start enhancement");

      router.push(`/projects/${id}/review`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (error && !manifest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-bad">{error}</main>;
  }
  if (!manifest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-paper-dim">Loading…</main>;
  }

  const evaluating = manifest.status === "uploaded" || busy;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Evaluation</h1>
      {manifest.narrativeSummary && (
        <p className="mb-6 text-paper-dim">{manifest.narrativeSummary}</p>
      )}
      {evaluating && manifest.status !== "evaluated" && (
        <p className="mb-6 text-paper-dim">Evaluating photos against the narrative…</p>
      )}
      {error && <p className="mb-4 text-bad">{error}</p>}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {manifest.photos.map((photo) => (
          <label key={photo.id} className="card cursor-pointer overflow-hidden p-2">
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
            {photo.reason && <p className="mt-1 text-xs text-paper-dim">{photo.reason}</p>}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={enhanceSelected} disabled={busy || manifest.status !== "evaluated"}>
          {busy ? "Working…" : `Enhance Selected (${selected.size})`}
        </button>
        <span className="text-sm text-paper-dim">
          {manifest.recommendedCount != null && `Imago recommends about ${manifest.recommendedCount} photos.`}
        </span>
      </div>
    </main>
  );
}
