/**
 * Track factory helpers — keep Track construction in one place.
 */

import type { Genre, SpotifySearchTrack, Track } from "@/types/domain";

export function createSpotifyTrack(
  item: Pick<
    SpotifySearchTrack,
    "id" | "uri" | "name" | "artists" | "album" | "duration_ms"
  >,
  genre: Genre,
  now = new Date().toISOString()
): Track {
  return {
    id: crypto.randomUUID(),
    source: "spotify",
    genre,
    name: item.name,
    artists: item.artists.map((a) => a.name).join(", "),
    orchestra: null,
    year: null,
    singer: null,
    durationMs: item.duration_ms,
    spotifyUri: item.uri,
    spotifyId: item.id,
    albumArtUrl: item.album?.images?.[0]?.url ?? null,
    localRelPath: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deduplicate by Spotify id (preferred) or name+artists. */
export function dedupeTracksAgainstLibrary(
  incoming: Track[],
  existing: Track[]
): Track[] {
  const spotifyIds = new Set(
    existing.map((t) => t.spotifyId).filter((id): id is string => !!id)
  );
  const localKeys = new Set(
    existing
      .filter((t) => t.source === "local" && t.localRelPath)
      .map((t) => t.localRelPath!)
  );
  const nameKeys = new Set(
    existing.map((t) => `${t.name.toLowerCase()}|${t.artists.toLowerCase()}`)
  );

  return incoming.filter((t) => {
    if (t.spotifyId && spotifyIds.has(t.spotifyId)) return false;
    if (t.localRelPath && localKeys.has(t.localRelPath)) return false;
    const key = `${t.name.toLowerCase()}|${t.artists.toLowerCase()}`;
    if (nameKeys.has(key)) return false;
    return true;
  });
}

/** Normalize a track name for fuzzy local↔Spotify matching. */
export function normalizeTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a local file that matches a Spotify track (same genre),
 * or another local track of the same genre as last resort.
 */
export function findLocalFallback(
  failed: Track,
  library: Track[],
  excludeIds: Set<string> = new Set()
): Track | null {
  const sameGenreLocals = library.filter(
    (t) =>
      t.source === "local" &&
      t.genre === failed.genre &&
      t.localRelPath &&
      !excludeIds.has(t.id) &&
      t.id !== failed.id
  );
  if (sameGenreLocals.length === 0) return null;

  const target = normalizeTitle(failed.name);
  const byName = sameGenreLocals.find((t) => {
    const n = normalizeTitle(t.name);
    return n === target || n.includes(target) || target.includes(n);
  });
  if (byName) return byName;

  const artistBits = failed.artists
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const byArtist = sameGenreLocals.find((t) =>
    artistBits.some(
      (a) =>
        t.artists.toLowerCase().includes(a) ||
        (t.orchestra ?? "").toLowerCase().includes(a)
    )
  );
  if (byArtist) return byArtist;

  return sameGenreLocals[Math.floor(Math.random() * sameGenreLocals.length)];
}
