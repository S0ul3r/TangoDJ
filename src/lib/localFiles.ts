/**
 * File System Access API helpers for local audio.
 *
 * Two import modes:
 * 1) Structured library root (Link local music folder):
 *      MyTango/
 *        Tango/   Vals/   Milonga/   Cortina/
 * 2) Flat import into the active genre (files or one folder of mp3s).
 */

import type { Genre } from "@/types/domain";
import { LOCAL_FOLDER_HANDLE_KEY } from "@/lib/constants";

const GENRE_FOLDER_MAP: Record<string, Genre> = {
  tango: "tango",
  vals: "vals",
  valses: "vals",
  milonga: "milonga",
  milongas: "milonga",
  cortina: "cortina",
  cortinas: "cortina",
};

const AUDIO_RE = /\.(mp3|m4a|wav|flac|ogg)$/i;
const DB_NAME = "tangodj_fs";
const STORE_HANDLES = "handles";
const STORE_FILES = "file_handles";

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function supportsFilePicker(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(
  store: string,
  key: string,
  value: unknown
): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openHandleDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

export async function persistDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  key = LOCAL_FOLDER_HANDLE_KEY
): Promise<void> {
  await idbPut(STORE_HANDLES, key, handle);
}

export async function loadDirectoryHandle(
  key = LOCAL_FOLDER_HANDLE_KEY
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>(STORE_HANDLES, key);
    if (!handle) return null;
    const permission = await queryPermission(handle);
    if (permission === "granted") return handle;
    if (permission === "prompt") {
      const requested = await requestPermission(handle);
      return requested === "granted" ? handle : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function queryPermission(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle
): Promise<PermissionState> {
  // @ts-expect-error permission methods
  return handle.queryPermission({ mode: "read" });
}

async function requestPermission(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle
): Promise<PermissionState> {
  // @ts-expect-error permission methods
  return handle.requestPermission({ mode: "read" });
}

export async function pickLibraryFolder(): Promise<FileSystemDirectoryHandle> {
  // @ts-expect-error File System Access API
  const handle = (await window.showDirectoryPicker({
    mode: "read",
  })) as FileSystemDirectoryHandle;
  await persistDirectoryHandle(handle);
  return handle;
}

export async function pickFlatAudioFolder(): Promise<FileSystemDirectoryHandle> {
  // @ts-expect-error File System Access API
  return (await window.showDirectoryPicker({
    mode: "read",
  })) as FileSystemDirectoryHandle;
}

export async function pickAudioFiles(): Promise<FileSystemFileHandle[]> {
  // @ts-expect-error File System Access API
  const handles = (await window.showOpenFilePicker({
    multiple: true,
    types: [
      {
        description: "Audio",
        accept: {
          "audio/*": [".mp3", ".m4a", ".wav", ".flac", ".ogg"],
        },
      },
    ],
  })) as FileSystemFileHandle[];
  return handles;
}

export async function persistFileHandle(
  trackId: string,
  handle: FileSystemFileHandle
): Promise<void> {
  await idbPut(STORE_FILES, trackId, handle);
}

export async function loadFileHandle(
  trackId: string
): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await idbGet<FileSystemFileHandle>(STORE_FILES, trackId);
    if (!handle) return null;
    const permission = await queryPermission(handle);
    if (permission === "granted") return handle;
    if (permission === "prompt") {
      const requested = await requestPermission(handle);
      return requested === "granted" ? handle : null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ScannedLocalTrack {
  name: string;
  artists: string;
  genre: Genre;
  localRelPath: string;
  fileName: string;
}

function displayNameFromFile(fileName: string): string {
  return fileName.replace(AUDIO_RE, "").replace(/_/g, " ");
}

export async function scanLibraryFolder(
  root: FileSystemDirectoryHandle
): Promise<ScannedLocalTrack[]> {
  const results: ScannedLocalTrack[] = [];

  for await (const [folderName, entry] of iterateEntries(root)) {
    if (entry.kind !== "directory") continue;
    const genre = GENRE_FOLDER_MAP[folderName.toLowerCase()];
    if (!genre) continue;
    const dir = entry as FileSystemDirectoryHandle;
    await walkFolder(dir, genre, folderName, results);
  }

  return results;
}

/** Scan a flat folder (and one level of subfolders) into one genre. */
export async function scanFlatFolder(
  root: FileSystemDirectoryHandle,
  genre: Genre,
  rootId: string
): Promise<ScannedLocalTrack[]> {
  const results: ScannedLocalTrack[] = [];
  await walkFolder(root, genre, `@root:${rootId}`, results);
  return results;
}

async function walkFolder(
  dir: FileSystemDirectoryHandle,
  genre: Genre,
  relBase: string,
  out: ScannedLocalTrack[]
): Promise<void> {
  for await (const [name, entry] of iterateEntries(dir)) {
    const rel = `${relBase}/${name}`;
    if (entry.kind === "directory") {
      await walkFolder(entry as FileSystemDirectoryHandle, genre, rel, out);
    } else if (entry.kind === "file" && AUDIO_RE.test(name)) {
      out.push({
        name: displayNameFromFile(name),
        artists: "",
        genre,
        localRelPath: rel,
        fileName: name,
      });
    }
  }
}

async function* iterateEntries(
  dir: FileSystemDirectoryHandle
): AsyncGenerator<[string, FileSystemHandle]> {
  // @ts-expect-error async iterator
  for await (const entry of dir.values()) {
    yield [entry.name, entry as FileSystemHandle];
  }
}

export function parseLocalPath(localRelPath: string): {
  kind: "structured" | "root" | "file";
  rootId?: string;
  relPath: string;
} {
  if (localRelPath.startsWith("@file:")) {
    return { kind: "file", relPath: localRelPath.slice("@file:".length) };
  }
  if (localRelPath.startsWith("@root:")) {
    const rest = localRelPath.slice("@root:".length);
    const slash = rest.indexOf("/");
    if (slash === -1) return { kind: "root", rootId: rest, relPath: "" };
    return {
      kind: "root",
      rootId: rest.slice(0, slash),
      relPath: rest.slice(slash + 1),
    };
  }
  return { kind: "structured", relPath: localRelPath };
}

/** Resolve a relative path under a directory handle. */
export async function resolveLocalFile(
  root: FileSystemDirectoryHandle,
  relPath: string
): Promise<File | null> {
  const parts = relPath.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  let current: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      current = await current.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }
  try {
    const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

/**
 * Resolve any local track path (structured library, flat root, or single file).
 */
export async function resolveTrackLocalFile(
  trackId: string,
  localRelPath: string,
  mainRoot: FileSystemDirectoryHandle | null
): Promise<File | null> {
  const parsed = parseLocalPath(localRelPath);

  if (parsed.kind === "file") {
    const fh = await loadFileHandle(trackId);
    if (!fh) return null;
    try {
      return await fh.getFile();
    } catch {
      return null;
    }
  }

  if (parsed.kind === "root" && parsed.rootId) {
    const root = await loadDirectoryHandle(`root:${parsed.rootId}`);
    if (!root || !parsed.relPath) return null;
    return resolveLocalFile(root, parsed.relPath);
  }

  if (!mainRoot) return null;
  return resolveLocalFile(mainRoot, parsed.relPath);
}
