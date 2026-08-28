"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import type { ProjectManifest, PhotoRecord, EnhancementVersion } from "@/lib/types";
import { COST_PER_IMAGE_USD } from "@/lib/fal";

function currentBatch(photo: PhotoRecord): EnhancementVersion[] {
  const last = photo.enhancements[photo.enhancements.length - 1];
  if (!last) return [];
  return photo.enhancements.filter((v) => v.batchId === last.batchId);
}

const MODEL_LABELS: Record<string, string> = {
  "fal-ai/nano-banana-pro/edit": "Nano Banana Pro",
  "fal-ai/gpt-image-1/edit-image": "GPT Image 1",
};

function CompareSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded bg-ink-mid">
      <img src={beforeUrl} alt="Original" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 h-full w-full overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={afterUrl} alt="Enhanced" className="h-full w-full object-cover" draggable={false} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${pos}%` }} />
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        aria-label="Compare original and enhanced"
      />
    </div>
  );
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  async function load() {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: ProjectManifest = await res.json();
    setManifest(data);
    return data;
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!manifest) return;
    const pending = manifest.photos.flatMap((photo) =>
      currentBatch(photo)
        .filter((v) => v.status === "pending")
        .map((version) => ({ photo, version })),
    );

    if (pending.length === 0 || pollingRef.current) return;
    pollingRef.current = true;

    const timer = setTimeout(async () => {
      await Promise.all(
        pending.map(({ photo, version }) =>
          fetch(`/api/projects/${id}/images/${photo.id}/status?versionId=${version.id}`),
        ),
      );
      pollingRef.current = false;
      load();
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, id]);

  async function revise(photoId: string) {
    const text = feedback[photoId]?.trim();
    if (!text) return;
    setBusyId(photoId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/images/${photoId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: text }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Revision failed");
      setFeedback((f) => ({ ...f, [photoId]: "" }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function approve(photoId: string, versionId: string) {
    setBusyId(photoId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/images/${photoId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Approve failed");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function approveAllCompleted() {
    if (!manifest) return;
    setBulkBusy(true);
    setError(null);
    try {
      const targets = manifest.photos
        .map((p) => ({ photo: p, batch: currentBatch(p) }))
        .filter(({ photo, batch }) => !batch.some((v) => v.id === photo.finalVersionId))
        .map(({ photo, batch }) => ({ photo, version: batch.find((v) => v.status === "completed") }))
        .filter((x): x is { photo: PhotoRecord; version: EnhancementVersion } => Boolean(x.version));

      await Promise.all(
        targets.map(({ photo, version }) =>
          fetch(`/api/projects/${id}/images/${photo.id}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ versionId: version.id }),
          }),
        ),
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  if (!manifest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-paper-dim">Loading…</main>;
  }

  const enhancedPhotos = manifest.photos.filter((p) => p.enhancements.length > 0);
  const approvedCount = manifest.photos.filter((p) => p.finalVersionId).length;
  const hasUnapprovedCompleted = enhancedPhotos.some((p) => {
    const batch = currentBatch(p);
    return !batch.some((v) => v.id === p.finalVersionId) && batch.some((v) => v.status === "completed");
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Review &amp; revise</h1>
      <p className="mb-6 text-paper-dim">
        Compare each enhanced photo to the original. Ask for a revision, or approve it as final.
      </p>
      {error && <p className="mb-4 text-bad">{error}</p>}

      {hasUnapprovedCompleted && (
        <div className="mb-6">
          <button className="btn-secondary" onClick={approveAllCompleted} disabled={bulkBusy}>
            {bulkBusy ? "Approving…" : "Approve all completed"}
          </button>
        </div>
      )}

      <div className="space-y-6">
        {enhancedPhotos.map((photo) => {
          const batch = currentBatch(photo);
          const isComparing = batch.length > 1;

          return (
            <div key={photo.id} className="card p-4">
              <div className={isComparing ? "mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2" : "mb-3"}>
                {batch.map((version) => {
                  const isFinal = photo.finalVersionId === version.id;
                  return (
                    <div key={version.id}>
                      {isComparing && (
                        <p className="mb-1 text-xs text-paper-dim">
                          {MODEL_LABELS[version.model] ?? version.model}
                        </p>
                      )}
                      {version.resultUrl ? (
                        <CompareSlider beforeUrl={photo.originalUrl} afterUrl={version.resultUrl} />
                      ) : (
                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded bg-ink-mid text-sm text-paper-dim">
                          {version.status === "failed" ? version.error || "Failed" : "Working…"}
                        </div>
                      )}
                      <button
                        className="btn-primary mt-2 w-full"
                        onClick={() => approve(photo.id, version.id)}
                        disabled={busyId === photo.id || !version.resultUrl || isFinal}
                      >
                        {isFinal ? "Approved" : isComparing ? "Use this one" : "Approve as final"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder="Revision feedback, e.g. warmer tones, remove the sign in background"
                  value={feedback[photo.id] ?? ""}
                  onChange={(e) => setFeedback((f) => ({ ...f, [photo.id]: e.target.value }))}
                />
                <button
                  className="btn-secondary"
                  onClick={() => revise(photo.id)}
                  disabled={busyId === photo.id || batch.some((v) => v.status === "pending")}
                >
                  Revise
                </button>
                <span className="text-xs text-paper-dim">≈${COST_PER_IMAGE_USD.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <a
          href={`/api/projects/${id}/export`}
          className={`btn-primary ${approvedCount === 0 ? "pointer-events-none opacity-40" : ""}`}
        >
          Export finals ({approvedCount})
        </a>
      </div>
    </main>
  );
}
