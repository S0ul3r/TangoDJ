"use client";

import { useCallback } from "react";
import { useSpotify } from "@/context/SpotifyContext";

/**
 * Authenticated fetch helper — sends the current Spotify access token.
 */
export function useAuthFetch() {
  const { getValidToken } = useSpotify();

  return useCallback(
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
        throw new Error(
          (data as { error?: string }).error ||
            res.statusText ||
            "Request failed"
        );
      }
      return data;
    },
    [getValidToken]
  );
}
