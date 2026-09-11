"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { isLocalFolderSupported, listImageFiles, saveProjectDirHandle } from "@/lib/local-folder";

export default function HomePage() {
  const router = useRouter();
  const [narrativeBrief, setNarrativeBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickLocalFolder() {
    setError(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const images = await listImageFiles(handle);
      if (images.length === 0) {
        setError("That folder has no photos in it.");
        return;
      }
      setDirHandle(handle);
      setFiles(images.map((img) => img.file));
    } catch {
      // User cancelled the picker — not an error worth surfacing.
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one photo.");
      return;
    }
    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: files.length });
    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrativeBrief }),
      });
      if (!createRes.ok) throw new Error((await createRes.json()).error || "Failed to create project");
      const project = await createRes.json();

      let done = 0;
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const blob = await upload(`projects/${project.id}/originals/${file.name}`, file, {
            access: "public",
            handleUploadUrl: `/api/projects/${project.id}/upload-token`,
            contentType: file.type || undefined,
          });
          done += 1;
          setProgress({ done, total: files.length });
          return { filename: file.name, url: blob.url };
        }),
      );

      const registerRes = await fetch(`/api/projects/${project.id}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: uploaded }),
      });
      if (!registerRes.ok) throw new Error((await registerRes.json()).error || "Failed to save uploads");

      if (dirHandle) {
        await saveProjectDirHandle(project.id, dirHandle);
      }

      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <>
      <nav className="border-b border-ink-mid">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="font-display text-xl tracking-tight text-paper">Imago</span>
          <span className="eyebrow hidden sm:inline">Story-first photo finishing</span>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6">
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="grid items-center gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-20">
          <div>
            <div className="rule mb-5" />
            <h1 className="font-display text-4xl leading-[1.08] text-paper sm:text-5xl">
              Turn a photo dump into a story worth keeping.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-paper-dim">
              Imago reads the whole set, selects and sequences the photos that carry the
              narrative, and finishes them to a professional standard — so the moment you
              lived comes out the other side as a story, not a folder.
            </p>
            <p className="mt-3 max-w-md text-base leading-relaxed text-paper-dim">
              Most of what you shot won&rsquo;t make the cut, and Imago tells you which shots
              are worth keeping before it touches a single one — enhancement is optional.
            </p>

            <form onSubmit={onSubmit} className="panel mt-8 space-y-5 p-6 sm:p-7">
              <p className="eyebrow">Start a project</p>

              <div>
                <label className="field-label mb-2 block">
                  Narrative brief <span className="normal-case tracking-normal text-paper-dim/70">(optional)</span>
                </label>
                <textarea
                  className="input min-h-24 resize-y"
                  placeholder="e.g. a weekend hiking trip with friends"
                  value={narrativeBrief}
                  onChange={(e) => setNarrativeBrief(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label mb-2 block">Photos</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="input"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                {files.length > 0 && (
                  <p className="mt-2 text-sm text-paper-dim">
                    {files.length} photo(s) selected
                    {dirHandle && " from your local folder"}
                  </p>
                )}
                {isLocalFolderSupported() && (
                  <button
                    type="button"
                    onClick={pickLocalFolder}
                    className="mt-2 text-sm text-accent underline decoration-accent-dim underline-offset-4 hover:text-paper"
                  >
                    Or choose a folder on this computer — lets you archive culled
                    photos there later
                  </button>
                )}
              </div>

              {error && <p className="text-sm text-bad">{error}</p>}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading
                  ? progress
                    ? `Uploading ${progress.done}/${progress.total}…`
                    : "Uploading…"
                  : "Upload & Evaluate"}
              </button>
            </form>
          </div>

          <div className="hidden lg:block">
            <div className="photo-frame animate-fade-up relative aspect-[1693/929] -rotate-1">
              <Image
                src="/images/imago-hero-contact-sheet.png"
                alt="A contact sheet of raw, unedited photos from a trip — the kind of full photo dump Imago starts from"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ─── Three-step story ─────────────────────────────────────────── */}
        <section className="py-16 lg:py-24">
          <div className="rule-center" />
          <p className="eyebrow mt-4 text-center">How it works</p>
          <h2 className="font-display mt-2 text-center text-2xl text-paper sm:text-3xl">
            From everything you shot to what actually matters
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <div>
              <div className="photo-frame relative flex aspect-[3/2] items-center justify-center bg-ink-light">
                <div className="relative h-16 w-20">
                  <div className="absolute left-0 top-3 h-11 w-16 -rotate-6 rounded-md border border-ink-mid bg-ink" />
                  <div className="absolute left-2 top-1 h-11 w-16 rotate-3 rounded-md border border-ink-mid bg-ink" />
                  <div className="absolute left-1 top-2 h-11 w-16 rounded-md border border-accent-dim bg-ink" />
                </div>
              </div>
              <p className="eyebrow mt-4">01</p>
              <h3 className="font-display mt-1 text-lg text-paper">Bring the whole moment</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-dim">
                Upload the full set, bursts and all. No pre-sorting required — raw photos
                enter Imago exactly as they came off the camera.
              </p>
            </div>

            <div>
              <div className="photo-frame relative aspect-[3/2]">
                <Image
                  src="/images/imago-selection-contact-sheet.png"
                  alt="A contact sheet on a dark background with the strongest shots highlighted in amber, the rest left unmarked"
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="object-cover"
                />
              </div>
              <p className="eyebrow mt-4">02</p>
              <h3 className="font-display mt-1 text-lg text-paper">Keep what carries the story</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-dim">
                Imago scores every photo for narrative fit and quality, clears out
                near-duplicates, and tells you honestly how many of the fifty are actually
                worth keeping — before anything gets enhanced.
              </p>
            </div>

            <div>
              <div className="photo-frame relative aspect-[3/2]">
                <Image
                  src="/images/imago-final-story.png"
                  alt="A finished photo book laid open on a table, showing the enhanced final set sequenced as a story"
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="object-cover"
                />
              </div>
              <p className="eyebrow mt-4">03</p>
              <h3 className="font-display mt-1 text-lg text-paper">Leave with a finished narrative</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-dim">
                Each selected photo is finished to a professional standard, with room to
                revise, before you export the set that&rsquo;s actually worth keeping.
              </p>
            </div>
          </div>

          <p className="mt-12 text-center text-sm text-paper-dim">
            Prefer to stop at step two? Export your culled set as-is — no enhancement,
            no cost.
          </p>
        </section>
      </main>
    </>
  );
}
