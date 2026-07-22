/**
 * Offline-first library cache (localStorage).
 * Survives without Supabase / network — Spotify Connect still needs
 * the Spotify app (downloaded tracks play offline there).
 */

import type { MilongaEvent, Tanda, Track } from "@/types/domain";

export const LIBRARY_CACHE_KEY = "tangodj_library_cache_v1";
const LEGACY_CACHE_KEY = "tangodj_library_cache";

export type LibraryCache = {
  version: 1;
  savedAt: string;
  tracks: Track[];
  tandas: Tanda[];
  events: MilongaEvent[];
};

export function loadLibraryCache(): LibraryCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(LIBRARY_CACHE_KEY) ??
      localStorage.getItem(LEGACY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LibraryCache> & {
      tracks?: Track[];
      tandas?: Tanda[];
      events?: MilongaEvent[];
    };
    if (!Array.isArray(parsed.tracks)) return null;
    return {
      version: 1,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
      tracks: parsed.tracks ?? [],
      tandas: parsed.tandas ?? [],
      events: parsed.events ?? [],
    };
  } catch {
    return null;
  }
}

export function saveLibraryCache(
  data: Omit<LibraryCache, "version" | "savedAt">
): void {
  if (typeof window === "undefined") return;
  const payload: LibraryCache = {
    version: 1,
    savedAt: new Date().toISOString(),
    tracks: data.tracks,
    tandas: data.tandas,
    events: data.events,
  };
  localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(payload));
  // Keep legacy key in sync for older tabs
  localStorage.setItem(
    LEGACY_CACHE_KEY,
    JSON.stringify({
      tracks: data.tracks,
      tandas: data.tandas,
      events: data.events,
    })
  );
}
