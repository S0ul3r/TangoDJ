import { describe, expect, it } from "vitest";
import {
  suggestNextGenre,
  validateQueue,
} from "@/lib/domain/sequencing";
import type { EventQueueItem, Tanda, Track } from "@/types/domain";

function track(
  id: string,
  genre: Track["genre"],
  overrides: Partial<Track> = {}
): Track {
  return {
    id,
    name: id,
    artists: "Orquesta",
    orchestra: null,
    genre,
    source: "spotify",
    spotifyUri: `spotify:track:${id}`,
    spotifyId: id,
    durationMs: 180_000,
    albumArtUrl: null,
    localRelPath: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function tanda(
  id: string,
  genre: Tanda["genre"],
  trackIds: string[]
): Tanda {
  return {
    id,
    name: id,
    genre,
    trackIds,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

describe("validateQueue", () => {
  it("accepts empty queue", () => {
    expect(validateQueue([], new Map(), new Map()).ok).toBe(true);
  });

  it("requires tanda → cortina pattern", () => {
    const tandas = new Map([["t1", tanda("t1", "tango", ["a"])]]);
    const tracks = new Map([["a", track("a", "tango")]]);
    const items: EventQueueItem[] = [
      { id: "1", type: "tanda", tandaId: "t1" },
    ];
    const result = validateQueue(items, tandas, tracks);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "tanda_needs_cortina")).toBe(
      true
    );
  });

  it("rejects cortina at start and back-to-back cortinas", () => {
    const tracks = new Map([
      ["c1", track("c1", "cortina")],
      ["c2", track("c2", "cortina")],
    ]);
    const items: EventQueueItem[] = [
      { id: "1", type: "cortina", trackId: "c1" },
      { id: "2", type: "cortina", trackId: "c2" },
    ];
    const result = validateQueue(items, new Map(), tracks);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "starts_with_cortina")).toBe(
      true
    );
    expect(result.issues.some((i) => i.code === "cortina_after_cortina")).toBe(
      true
    );
  });

  it("rejects two fast tandas in a row", () => {
    const tandas = new Map([
      ["v1", tanda("v1", "vals", ["a"])],
      ["m1", tanda("m1", "milonga", ["b"])],
    ]);
    const tracks = new Map([
      ["a", track("a", "vals")],
      ["b", track("b", "milonga")],
      ["c1", track("c1", "cortina")],
      ["c2", track("c2", "cortina")],
    ]);
    const items: EventQueueItem[] = [
      { id: "1", type: "tanda", tandaId: "v1" },
      { id: "2", type: "cortina", trackId: "c1" },
      { id: "3", type: "tanda", tandaId: "m1" },
      { id: "4", type: "cortina", trackId: "c2" },
    ];
    const result = validateQueue(items, tandas, tracks);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "fast_after_fast")).toBe(true);
  });

  it("accepts a valid tanda → cortina → tanda night", () => {
    const tandas = new Map([
      ["t1", tanda("t1", "tango", ["a"])],
      ["t2", tanda("t2", "tango", ["b"])],
    ]);
    const tracks = new Map([
      ["a", track("a", "tango")],
      ["b", track("b", "tango")],
      ["c1", track("c1", "cortina")],
      ["c2", track("c2", "cortina")],
    ]);
    const items: EventQueueItem[] = [
      { id: "1", type: "tanda", tandaId: "t1" },
      { id: "2", type: "cortina", trackId: "c1" },
      { id: "3", type: "tanda", tandaId: "t2" },
      { id: "4", type: "cortina", trackId: "c2" },
    ];
    const result = validateQueue(items, tandas, tracks);
    expect(result.ok).toBe(true);
  });
});

describe("suggestNextGenre", () => {
  it("starts with tango", () => {
    expect(suggestNextGenre([])).toBe("tango");
  });

  it("follows fast with tango", () => {
    expect(suggestNextGenre(["vals"])).toBe("tango");
  });

  it("suggests fast after two tangos", () => {
    expect(suggestNextGenre(["tango", "tango"])).toBe("vals");
  });
});
