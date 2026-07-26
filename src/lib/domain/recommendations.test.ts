import { describe, expect, it } from "vitest";
import {
  createSpotifyTrack,
  guessOrchestraFromArtists,
  yearFromReleaseDate,
} from "@/lib/tracks";
import { scoreLibraryCandidate } from "@/lib/domain/recommendations";
import type { Track } from "@/types/domain";

function track(partial: Partial<Track> & Pick<Track, "id" | "name">): Track {
  return {
    source: "spotify",
    genre: "tango",
    artists: "Artist",
    orchestra: null,
    year: null,
    singer: null,
    durationMs: 180000,
    spotifyUri: null,
    spotifyId: null,
    albumArtUrl: null,
    localRelPath: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("yearFromReleaseDate", () => {
  it("parses YYYY and YYYY-MM-DD", () => {
    expect(yearFromReleaseDate("1942")).toBe(1942);
    expect(yearFromReleaseDate("1951-03-12")).toBe(1951);
  });

  it("rejects junk", () => {
    expect(yearFromReleaseDate(null)).toBeNull();
    expect(yearFromReleaseDate("")).toBeNull();
    expect(yearFromReleaseDate("nope")).toBeNull();
  });
});

describe("guessOrchestraFromArtists", () => {
  it("prefers ensemble-looking names", () => {
    expect(
      guessOrchestraFromArtists([
        { name: "Roberto Rufino" },
        { name: "Orquesta Tipica Carlos Di Sarli" },
      ])
    ).toBe("Orquesta Tipica Carlos Di Sarli");
  });

  it("falls back to primary artist", () => {
    expect(guessOrchestraFromArtists([{ name: "Francisco Canaro" }])).toBe(
      "Francisco Canaro"
    );
  });
});

describe("createSpotifyTrack enrichment", () => {
  it("fills year and orchestra from Spotify payload", () => {
    const t = createSpotifyTrack(
      {
        id: "abc",
        uri: "spotify:track:abc",
        name: "Bahia Blanca",
        artists: [{ name: "Carlos Di Sarli" }],
        album: {
          name: "Album",
          images: [],
          release_date: "1957-01-01",
        },
        duration_ms: 200000,
      },
      "tango",
      "2020-01-01T00:00:00.000Z"
    );
    expect(t.year).toBe(1957);
    expect(t.orchestra).toBe("Carlos Di Sarli");
  });
});

describe("scoreLibraryCandidate year + orchestra", () => {
  const seeds = [
    track({
      id: "s1",
      name: "Seed",
      orchestra: "Di Sarli",
      year: 1952,
      artists: "Di Sarli",
    }),
  ];

  it("ranks same orchestra + close year higher", () => {
    const close = track({
      id: "a",
      name: "A",
      orchestra: "Di Sarli",
      year: 1953,
      artists: "Other",
    });
    const far = track({
      id: "b",
      name: "B",
      orchestra: "Pugliese",
      year: 1980,
      artists: "Other",
    });
    expect(scoreLibraryCandidate(close, seeds)).toBeGreaterThan(
      scoreLibraryCandidate(far, seeds)
    );
  });
});
