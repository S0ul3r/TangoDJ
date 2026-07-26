import { describe, expect, it } from "vitest";
import {
  estimateRemainingMs,
  flattenTracksForItem,
  resolveUpcoming,
} from "@/lib/playback/queueHelpers";
import type { EventQueueItem, Tanda, Track } from "@/types/domain";

function track(
  id: string,
  genre: Track["genre"],
  durationMs = 180_000
): Track {
  return {
    id,
    name: `Track ${id}`,
    artists: "Artist",
    orchestra: "Di Sarli",
    genre,
    source: "spotify",
    spotifyUri: `spotify:track:${id}`,
    spotifyId: id,
    durationMs,
    albumArtUrl: `https://img/${id}.jpg`,
    localRelPath: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

describe("queue cursor helpers", () => {
  const tracksById = new Map([
    ["a", track("a", "tango", 120_000)],
    ["b", track("b", "tango", 130_000)],
    ["c", track("c", "cortina", 90_000)],
    ["d", track("d", "vals", 140_000)],
  ]);
  const tandasById = new Map<string, Tanda>([
    [
      "t1",
      {
        id: "t1",
        name: "Di Sarli 1",
        genre: "tango",
        trackIds: ["a", "b"],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
    [
      "t2",
      {
        id: "t2",
        name: "Vals set",
        genre: "vals",
        trackIds: ["d"],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
  ]);
  const items: EventQueueItem[] = [
    { id: "1", type: "tanda", tandaId: "t1" },
    { id: "2", type: "cortina", trackId: "c" },
    { id: "3", type: "tanda", tandaId: "t2" },
  ];

  it("flattens tanda tracks in order", () => {
    const tracks = flattenTracksForItem(items[0], tandasById, tracksById);
    expect(tracks.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("resolves next song within a tanda", () => {
    const upcoming = resolveUpcoming(
      items[0],
      0,
      0,
      items,
      tandasById,
      tracksById
    );
    expect(upcoming?.kind).toBe("song");
    expect(upcoming?.title).toBe("Track b");
    expect(upcoming?.durationMs).toBe(130_000);
    expect(upcoming?.albumArtUrl).toContain("b.jpg");
  });

  it("resolves cortina after last tanda track", () => {
    const upcoming = resolveUpcoming(
      items[0],
      1,
      0,
      items,
      tandasById,
      tracksById,
      45
    );
    expect(upcoming?.kind).toBe("cortina");
    expect(upcoming?.title).toBe("Track c");
    expect(upcoming?.durationMs).toBe(45_000);
  });

  it("resolves next tanda after cortina", () => {
    const upcoming = resolveUpcoming(
      items[1],
      0,
      1,
      items,
      tandasById,
      tracksById
    );
    expect(upcoming?.kind).toBe("tanda");
    expect(upcoming?.title).toBe("Vals set");
    expect(upcoming?.track?.id).toBe("d");
  });

  it("estimates remaining queue time from mid-tanda", () => {
    // Mid song a (60s left of 120), then b (130), cortina capped 45, tanda d (140)
    const ms = estimateRemainingMs(
      items,
      0,
      0,
      tandasById,
      tracksById,
      45,
      60_000,
      120_000
    );
    expect(ms).toBe(60_000 + 130_000 + 45_000 + 140_000);
  });
});
