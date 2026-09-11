// File System Access API — Chromium-only, and TypeScript's bundled DOM lib
// doesn't yet include the permission methods (queryPermission/requestPermission)
// or FileSystemDirectoryHandle.remove(), so a few casts below are unavoidable.

interface PermissionableHandle {
  queryPermission(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

// TypeScript's bundled DOM lib doesn't yet include the async-iterable
// directory-listing methods from the File System Access API spec.
interface IterableDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

declare global {
  interface Window {
    showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
  }
}

const DB_NAME = "imago-local-folders";
const STORE_NAME = "projectHandles";
const IMAGE_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|gif|tiff?|bmp)$/i;

export function isLocalFolderSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProjectDirHandle(
  projectId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getProjectDirHandle(projectId: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDb();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(projectId);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

export async function deleteProjectDirHandle(projectId: string): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export interface LocalImageFile {
  name: string;
  file: File;
}

export async function listImageFiles(dirHandle: FileSystemDirectoryHandle): Promise<LocalImageFile[]> {
  const out: LocalImageFile[] = [];
  const iterable = dirHandle as unknown as IterableDirectoryHandle;
  for await (const [name, handle] of iterable.entries()) {
    if (handle.kind !== "file" || !IMAGE_EXTENSIONS.test(name)) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    out.push({ name, file });
  }
  return out;
}

export async function ensureReadWritePermission(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const handle = dirHandle as unknown as PermissionableHandle;
  const current = await handle.queryPermission({ mode: "readwrite" });
  if (current === "granted") return true;
  // Must be called from a user-gesture handler (a click), which every caller of
  // this function is, since it only runs in response to an explicit button click.
  const requested = await handle.requestPermission({ mode: "readwrite" });
  return requested === "granted";
}

export interface ArchiveResult {
  filename: string;
  ok: boolean;
  error?: string;
}

// Copies each named file into an "Imago Archived" subfolder of dirHandle, then
// removes the original. There's no native "move" in this API, so this is a
// copy-then-delete; a failure between the two steps leaves the original in
// place (never removed without a confirmed successful copy first).
export async function archivePhotosLocally(
  dirHandle: FileSystemDirectoryHandle,
  filenames: string[],
): Promise<ArchiveResult[]> {
  const results: ArchiveResult[] = [];
  const archiveDir = await dirHandle.getDirectoryHandle("Imago Archived", { create: true });

  for (const filename of filenames) {
    try {
      const sourceHandle = await dirHandle.getFileHandle(filename);
      const file = await sourceHandle.getFile();

      const destHandle = await archiveDir.getFileHandle(filename, { create: true });
      const writable = await destHandle.createWritable();
      await writable.write(file);
      await writable.close();

      await dirHandle.removeEntry(filename);
      results.push({ filename, ok: true });
    } catch (err) {
      results.push({ filename, ok: false, error: (err as Error).message });
    }
  }

  return results;
}
