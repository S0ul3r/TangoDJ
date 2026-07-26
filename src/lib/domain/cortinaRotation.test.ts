import { describe, expect, it } from "vitest";
import { pickUnusedCortina } from "@/lib/domain/sequencing";
import type { EventQueueItem, Track } from "@/types/domain";

function cortina(id: string): Track {
  return {
    id,
    name: id,
    artists: "",
    orchestra: null,
    genre: "cortina",
    source: "spotify",
    spotifyUri: `spotify:track:${id}`,
    spotifyId: id,
    durationMs: 60_000,
    albumArtUrl: null,
    localRelPath: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

describe("pickUnusedCortina rotation", () => {
  const pool = [cortina("c1"), cortina("c2"), cortina("c3")];

  it("prefers unused cortinas", () => {
    const items: EventQueueItem[] = [
      { id: "1", type: "cortina", trackId: "c1" },
    ];
    const pick = pickUnusedCortina(pool, items);
    expect(pick?.id).not.toBe("c1");
    expect(["c2", "c3"]).toContain(pick?.id);
  });

  it("reuses least-used when all appear in queue", () => {
    const items: EventQueueItem[] = [
      { id: "1", type: "cortina", trackId: "c1" },
      { id: "2", type: "cortina", trackId: "c2" },
      { id: "3", type: "cortina", trackId: "c3" },
      { id: "4", type: "cortina", trackId: "c2" },
    ];
    const pick = pickUnusedCortina(pool, items);
    expect(pick?.id).toBe("c1");
  });
});
