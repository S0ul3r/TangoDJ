"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { parsePlaylistId, type SpotifyPlaylistSummary } from "@/lib/spotify";
import type { SpotifySearchTrack } from "@/types/domain";

export function useSpotifyPlaylists() {
  const authFetch = useAuthFetch();
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch("/api/spotify/playlists");
      setPlaylists((data.playlists as SpotifyPlaylistSummary[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load playlists");
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importPlaylistTracks = useCallback(
    async (playlistIdOrUrl: string): Promise<SpotifySearchTrack[]> => {
      const id = parsePlaylistId(playlistIdOrUrl) ?? playlistIdOrUrl.trim();
      if (!id) throw new Error("Invalid playlist link or id.");
      const data = await authFetch(
        `/api/spotify/playlists/${encodeURIComponent(id)}`
      );
      return (data.tracks as SpotifySearchTrack[]) ?? [];
    },
    [authFetch]
  );

  return {
    playlists,
    loading,
    error,
    refresh,
    importPlaylistTracks,
  };
}
