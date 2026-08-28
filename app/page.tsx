"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

export default function HomePage() {
  const router = useRouter();
  const [narrativeBrief, setNarrativeBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold">Imago</h1>
      <p className="mb-8 text-paper-dim">
        Upload a set of photos. Imago finds the strongest subset for a coherent narrative, then
        professionally enhances them, with room to revise before you export the finals.
      </p>

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm text-paper-dim">
            Narrative brief <span className="opacity-60">(optional — leave blank to let Imago infer one)</span>
          </label>
          <textarea
            className="input min-h-24 resize-y"
            placeholder="e.g. a weekend hiking trip with friends"
            value={narrativeBrief}
            onChange={(e) => setNarrativeBrief(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-paper-dim">Photos</label>
          <input
            type="file"
            accept="image/*"
            multiple
            className="input"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <p className="mt-1 text-sm text-paper-dim">{files.length} photo(s) selected</p>
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
    </main>
  );
}
