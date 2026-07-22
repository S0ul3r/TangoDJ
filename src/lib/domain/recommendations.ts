/**
 * Genre-strict tanda recommendations.
 *
 * Spotify's official /recommendations endpoint is often restricted for
 * development-mode apps, so we:
 * 1) Rank unused library tracks of the SAME genre (orchestra / artist affinity)
 * 2) Optionally search Spotify with genre keywords + seed artists
 */

import type { Genre, SpotifySearchTrack, Track } from "@/types/domain";
import { searchTracks } from "@/lib/spotify";

const GENRE_SEARCH_QUERY: Record<Genre, string> = {
  tango: "tango argentino",
  vals: "vals tango",
  milonga: "milonga tango",
  cortina: "cortina tango",
};

export interface RecommendationResult {
  fromLibrary: Track[];
  fromSpotify: SpotifySearchTrack[];
}

function artistTokens(track: Pick<Track, "artists" | "orchestra">): string[] {
  const raw = [track.artists, track.orchestra ?? ""]
    .join(",")
    .split(/[,&]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1);
  return Array.from(new Set(raw));
}

function scoreLibraryCandidate(
  candidate: Track,
  seeds: Track[]
): number {
  let score = 0;
  const seedArtists = new Set(seeds.flatMap(artistTokens));
  const seedOrchestras = new Set(
    seeds
      .map((s) => (s.orchestra ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
  const candArtists = artistTokens(candidate);

  for (const a of candArtists) {
    if (seedArtists.has(a)) score += 5;
  }
  const orch = (candidate.orchestra ?? "").trim().toLowerCase();
  if (orch && seedOrchestras.has(orch)) score += 8;

  // Slight preference for Spotify-ready tracks during milonga nights
  if (candidate.source === "spotify") score += 1;

  return score;
}

/**
 * Suggest next tracks for a tanda draft.
 * ONLY returns / searches within `genre` — never mixes vals/milonga/tango.
 */
export async function recommendForTanda(options: {
  genre: Genre;
  seedTracks: Track[];
  library: Track[];
  excludeIds?: Set<string>;
  accessToken?: string | null;
  limit?: number;
}): Promise<RecommendationResult> {
  const {
    genre,
    seedTracks,
    library,
    excludeIds = new Set(),
    accessToken,
    limit = 12,
  } = options;

  const usedSpotifyIds = new Set(
    [...seedTracks, ...library.filter((t) => excludeIds.has(t.id))]
      .map((t) => t.spotifyId)
      .filter((id): id is string => !!id)
  );
  seedTracks.forEach((t) => excludeIds.add(t.id));

  const fromLibrary = library
    .filter(
      (t) =>
        t.genre === genre &&
        !excludeIds.has(t.id) &&
        !(t.spotifyId && usedSpotifyIds.has(t.spotifyId))
    )
    .map((t) => ({ track: t, score: scoreLibraryCandidate(t, seedTracks) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.track);

  let fromSpotify: SpotifySearchTrack[] = [];
  if (accessToken) {
    const seedArtist =
      seedTracks
        .flatMap((t) => t.artists.split(",").map((s) => s.trim()))
        .find(Boolean) ?? "";
    const q = [seedArtist, GENRE_SEARCH_QUERY[genre]]
      .filter(Boolean)
      .join(" ");
    try {
      const results = await searchTracks(accessToken, q, 20);
      fromSpotify = results.filter((r) => !usedSpotifyIds.has(r.id)).slice(0, limit);
    } catch {
      fromSpotify = [];
    }
  }

  return { fromLibrary, fromSpotify };
}
