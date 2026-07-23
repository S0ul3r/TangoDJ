"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSpotify } from "@/context/SpotifyContext";
import type {
  Genre,
  MilongaEvent,
  Tanda,
  Track,
} from "@/types/domain";
import {
  loadDirectoryHandle,
  pickFlatAudioFolder,
  pickLibraryFolder,
  persistDirectoryHandle,
  resolveTrackLocalFile,
  scanFlatFolder,
  scanLibraryFolder,
  supportsFileSystemAccess,
} from "@/lib/localFiles";
import { loadLibraryCache, saveLibraryCache } from "@/lib/cache";
import { dedupeTracksAgainstLibrary } from "@/lib/tracks";

interface LibraryContextType {
  tracks: Track[];
  tandas: Tanda[];
  events: MilongaEvent[];
  loading: boolean;
  syncError: string | null;
  cacheSavedAt: string | null;
  folderLinked: boolean;
  supportsLocal: boolean;
  refresh: () => Promise<void>;
  upsertTracks: (tracks: Track[]) => Promise<void>;
  deleteTracks: (ids: string[]) => Promise<void>;
  upsertTanda: (tanda: Tanda) => Promise<void>;
  deleteTanda: (id: string) => Promise<void>;
  upsertEvent: (event: MilongaEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  linkLocalFolder: () => Promise<number>;
  importLocalFolderToGenre: (genre: Genre) => Promise<number>;
  getLocalFile: (track: Track) => Promise<File | Blob | null>;
  tracksByGenre: (genre: Genre) => Track[];
}

const LibraryContext = createContext<LibraryContextType | null>(null);

type CacheShape = {
  tracks: Track[];
  tandas: Tanda[];
  events: MilongaEvent[];
};

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { getValidToken, isAuthenticated } = useSpotify();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tandas, setTandas] = useState<Tanda[]>([]);
  const [events, setEvents] = useState<MilongaEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [folderHandle, setFolderHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [supportsLocal, setSupportsLocal] = useState(false);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || res.statusText || "Request failed");
      }
      return data;
    },
    [getValidToken]
  );

  const persistLocal = useCallback((next: CacheShape) => {
    setTracks(next.tracks);
    setTandas(next.tandas);
    setEvents(next.events);
    saveLibraryCache(next);
    setCacheSavedAt(new Date().toISOString());
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setSyncError(null);
    try {
      const data = await authFetch("/api/sync");
      const next = {
        tracks: data.tracks as Track[],
        tandas: data.tandas as Tanda[],
        events: data.events as MilongaEvent[],
      };
      persistLocal(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      setSyncError(msg);
      const cached = loadLibraryCache();
      if (cached) {
        setTracks(cached.tracks);
        setTandas(cached.tandas);
        setEvents(cached.events);
        setCacheSavedAt(cached.savedAt);
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch, isAuthenticated, persistLocal]);

  useEffect(() => {
    const cached = loadLibraryCache();
    if (cached) {
      setTracks(cached.tracks);
      setTandas(cached.tandas);
      setEvents(cached.events);
      setCacheSavedAt(cached.savedAt);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void refresh();
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    setSupportsLocal(supportsFileSystemAccess());
  }, []);

  useEffect(() => {
    if (!supportsLocal) return;
    void loadDirectoryHandle().then((h) => {
      if (h) setFolderHandle(h);
    });
  }, [supportsLocal]);

  const upsertTracks = useCallback(
    async (incoming: Track[]) => {
      const merged = new Map(tracks.map((t) => [t.id, t]));
      for (const t of incoming) merged.set(t.id, t);
      const nextTracks = Array.from(merged.values());
      persistLocal({ tracks: nextTracks, tandas, events });
      try {
        await authFetch("/api/tracks", {
          method: "POST",
          body: JSON.stringify({ tracks: incoming }),
        });
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Failed to sync tracks");
      }
    },
    [authFetch, events, persistLocal, tandas, tracks]
  );

  const deleteTracks = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids);
      const nextTracks = tracks.filter((t) => !idSet.has(t.id));
      persistLocal({ tracks: nextTracks, tandas, events });
      try {
        await authFetch("/api/tracks", {
          method: "DELETE",
          body: JSON.stringify({ ids }),
        });
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Failed to delete tracks");
      }
    },
    [authFetch, events, persistLocal, tandas, tracks]
  );

  const upsertTanda = useCallback(
    async (tanda: Tanda) => {
      const next = [...tandas.filter((t) => t.id !== tanda.id), tanda];
      persistLocal({ tracks, tandas: next, events });
      try {
        await authFetch("/api/tandas", {
          method: "POST",
          body: JSON.stringify({ tanda }),
        });
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Failed to sync tanda");
      }
    },
    [authFetch, events, persistLocal, tandas, tracks]
  );

  const deleteTanda = useCallback(
    async (id: string) => {
      const next = tandas.filter((t) => t.id !== id);
      persistLocal({ tracks, tandas: next, events });
      try {
        await authFetch("/api/tandas", {
          method: "DELETE",
          body: JSON.stringify({ id }),
        });
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Failed to delete tanda");
      }
    },
    [authFetch, events, persistLocal, tandas, tracks]
  );

  const upsertEvent = useCallback(
    async (event: MilongaEvent) => {
      const next = [...events.filter((e) => e.id !== event.id), event];
      persistLocal({ tracks, tandas, events: next });
      try {
        await authFetch("/api/events", {
          method: "POST",
          body: JSON.stringify({ event }),
        });
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Failed to sync event");
      }
    },
    [authFetch, events, persistLocal, tandas, tracks]
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const next = events.filter((e) => e.id !== id);
      persistLocal({ tracks, tandas, events: next });
      try {
        await authFetch("/api/events", {
          method: "DELETE",
          body: JSON.stringify({ id }),
        });
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Failed to delete event");
      }
    },
    [authFetch, events, persistLocal, tandas, tracks]
  );

  const linkLocalFolder = useCallback(async () => {
    const handle = await pickLibraryFolder();
    setFolderHandle(handle);
    const scanned = await scanLibraryFolder(handle);
    const now = new Date().toISOString();
    const newTracks = dedupeTracksAgainstLibrary(
      scanned.map((s) => ({
        id: crypto.randomUUID(),
        source: "local" as const,
        genre: s.genre,
        name: s.name,
        artists: s.artists,
        orchestra: null,
        year: null,
        singer: null,
        durationMs: null,
        spotifyUri: null,
        spotifyId: null,
        albumArtUrl: null,
        localRelPath: s.localRelPath,
        createdAt: now,
        updatedAt: now,
      })),
      tracks
    );
    if (newTracks.length) await upsertTracks(newTracks);
    return newTracks.length;
  }, [tracks, upsertTracks]);

  const importLocalFolderToGenre = useCallback(
    async (genre: Genre) => {
      const handle = await pickFlatAudioFolder();
      const rootId = crypto.randomUUID();
      await persistDirectoryHandle(handle, `root:${rootId}`);
      const scanned = await scanFlatFolder(handle, genre, rootId);
      const now = new Date().toISOString();
      const newTracks = dedupeTracksAgainstLibrary(
        scanned.map((s) => ({
          id: crypto.randomUUID(),
          source: "local" as const,
          genre: s.genre,
          name: s.name,
          artists: s.artists,
          orchestra: null,
          year: null,
          singer: null,
          durationMs: null,
          spotifyUri: null,
          spotifyId: null,
          albumArtUrl: null,
          localRelPath: s.localRelPath,
          createdAt: now,
          updatedAt: now,
        })),
        tracks
      );
      if (newTracks.length) await upsertTracks(newTracks);
      return newTracks.length;
    },
    [tracks, upsertTracks]
  );

  const getLocalFile = useCallback(
    async (track: Track) => {
      if (track.source !== "local" || !track.localRelPath) return null;
      let handle = folderHandle;
      if (!handle) {
        handle = await loadDirectoryHandle();
        if (handle) setFolderHandle(handle);
      }
      return resolveTrackLocalFile(track.id, track.localRelPath, handle);
    },
    [folderHandle]
  );

  const tracksByGenre = useCallback(
    (genre: Genre) => tracks.filter((t) => t.genre === genre),
    [tracks]
  );

  const value = useMemo(
    () => ({
      tracks,
      tandas,
      events,
      loading,
      syncError,
      cacheSavedAt,
      folderLinked: !!folderHandle,
      supportsLocal,
      refresh,
      upsertTracks,
      deleteTracks,
      upsertTanda,
      deleteTanda,
      upsertEvent,
      deleteEvent,
      linkLocalFolder,
      importLocalFolderToGenre,
      getLocalFile,
      tracksByGenre,
    }),
    [
      tracks,
      tandas,
      events,
      loading,
      syncError,
      cacheSavedAt,
      folderHandle,
      supportsLocal,
      refresh,
      upsertTracks,
      deleteTracks,
      upsertTanda,
      deleteTanda,
      upsertEvent,
      deleteEvent,
      linkLocalFolder,
      importLocalFolderToGenre,
      getLocalFile,
      tracksByGenre,
    ]
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
