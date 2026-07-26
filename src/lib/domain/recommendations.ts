/**
 * Genre-strict tanda recommendations.
 *
 * Ranks by orchestra affinity, artist overlap, and year proximity.
 * Spotify search prefers seed orchestra/artist + genre keywords.
 */

import type { Genre, SpotifySearchTrack, Track } from "@/types/domain";
import { searchTracks } from "@/lib/spotify";
import { yearFromReleaseDate } from "@/lib/tracks";

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

function seedYearCenter(seeds: Track[]): number | null {
  const years = seeds
    .map((s) => s.year)
    .filter((y): y is number => typeof y === "number" && Number.isFinite(y));
  if (years.length === 0) return null;
  years.sort((a, b) => a - b);
  return years[Math.floor(years.length / 2)] ?? null;
}

function yearProximityBonus(
  candidateYear: number | null | undefined,
  center: number | null
): number {
  if (center == null || candidateYear == null) return 0;
  const delta = Math.abs(candidateYear - center);
  if (delta === 0) return 6;
  if (delta <= 3) return 4;
  if (delta <= 7) return 2;
  if (delta <= 12) return 1;
  return 0;
}

export function scoreLibraryCandidate(
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
  const yearCenter = seedYearCenter(seeds);

  for (const a of candArtists) {
    if (seedArtists.has(a)) score += 5;
  }
  const orch = (candidate.orchestra ?? "").trim().toLowerCase();
  if (orch && seedOrchestras.has(orch)) score += 10;

  score += yearProximityBonus(candidate.year, yearCenter);

  if (candidate.source === "spotify") score += 1;

  return score;
}

function scoreSpotifyHit(
  hit: SpotifySearchTrack,
  seeds: Track[]
): number {
  let score = 0;
  const seedArtists = new Set(seeds.flatMap(artistTokens));
  const seedOrchestras = new Set(
    seeds
      .map((s) => (s.orchestra ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
  const yearCenter = seedYearCenter(seeds);
  const hitArtists = hit.artists.map((a) => a.name.toLowerCase());
  const hitYear = yearFromReleaseDate(hit.album?.release_date);

  for (const a of hitArtists) {
    if (seedArtists.has(a)) score += 5;
    for (const orch of seedOrchestras) {
      if (a.includes(orch) || orch.includes(a)) score += 8;
    }
  }
  score += yearProximityBonus(hitYear, yearCenter);
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
    const seedOrchestra =
      seedTracks.map((t) => t.orchestra?.trim()).find(Boolean) ?? "";
    const seedArtist =
      seedTracks
        .flatMap((t) => t.artists.split(",").map((s) => s.trim()))
        .find(Boolean) ?? "";
    const q = [seedOrchestra || seedArtist, GENRE_SEARCH_QUERY[genre]]
      .filter(Boolean)
      .join(" ");
    try {
      const results = await searchTracks(accessToken, q, 10);
      fromSpotify = results
        .filter((r) => !usedSpotifyIds.has(r.id))
        .map((r) => ({ hit: r, score: scoreSpotifyHit(r, seedTracks) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.hit);
    } catch {
      fromSpotify = [];
    }
  }

  return { fromLibrary, fromSpotify };
}
