"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import type { ProjectManifest, PhotoRecord, EnhancementVersion } from "@/lib/types";

function latestVersion(photo: PhotoRecord): EnhancementVersion | undefined {
  return photo.enhancements[photo.enhancements.length - 1];
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
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
    const pending = manifest.photos
      .map((p) => ({ photo: p, version: latestVersion(p) }))
      .filter((x): x is { photo: PhotoRecord; version: EnhancementVersion } =>
        Boolean(x.version && x.version.status === "pending"),
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

  if (!manifest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-paper-dim">Loading…</main>;
  }

  const enhancedPhotos = manifest.photos.filter((p) => p.enhancements.length > 0);
  const approvedCount = manifest.photos.filter((p) => p.finalVersionId).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Review &amp; revise</h1>
      <p className="mb-6 text-paper-dim">
        Compare each enhanced photo to the original. Ask for a revision, or approve it as final.
      </p>
      {error && <p className="mb-4 text-bad">{error}</p>}

      <div className="space-y-6">
        {enhancedPhotos.map((photo) => {
          const version = latestVersion(photo);
          const isFinal = photo.finalVersionId === version?.id;
          return (
            <div key={photo.id} className="card p-4">
              <div className="mb-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 text-xs text-paper-dim">Original</p>
                  <img src={photo.originalUrl} alt="" className="w-full rounded" />
                </div>
                <div>
                  <p className="mb-1 text-xs text-paper-dim">
                    Enhanced {version?.status === "pending" && "(generating…)"}
                  </p>
                  {version?.resultUrl ? (
                    <img src={version.resultUrl} alt="" className="w-full rounded" />
                  ) : (
                    <div className="bg-ink-mid flex aspect-square w-full items-center justify-center rounded text-sm text-paper-dim">
                      {version?.status === "failed" ? version.error || "Failed" : "Working…"}
                    </div>
                  )}
                </div>
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
                  disabled={busyId === photo.id || version?.status === "pending"}
                >
                  Revise
                </button>
                <button
                  className="btn-primary"
                  onClick={() => version && approve(photo.id, version.id)}
                  disabled={busyId === photo.id || !version?.resultUrl || isFinal}
                >
                  {isFinal ? "Approved" : "Approve as final"}
                </button>
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
