import { describe, expect, it } from "vitest";
import {
  evaluateLocalProgress,
  evaluateSpotifyPoll,
} from "@/lib/playback/spotifyEndDetection";
import type { PlayerState } from "@/lib/playback/spotifyConnect";

function baseInput(
  overrides: Partial<Parameters<typeof evaluateSpotifyPoll>[0]> = {}
) {
  return {
    state: null as PlayerState | null,
    now: 10_000,
    progressMs: 0,
    durationMs: 180_000,
    peakProgressMs: 0,
    confirmedPlaying: false,
    nearEndSeen: false,
    prematureEndSince: null as number | null,
    stuckRetryDone: false,
    playIssuedAt: 0,
    expectedSpotifyUri: "spotify:track:abc",
    liveAlbumArtUrl: null as string | null,
    baseVolume: 80,
    fading: false,
    holdSilent: false,
    isCortina: false,
    cortinaSeconds: 45,
    hasEndTimer: false,
    ...overrides,
  };
}

function playingState(
  overrides: Partial<PlayerState> & {
    progress_ms?: number;
    duration_ms?: number;
  } = {}
): PlayerState {
  const progress = overrides.progress_ms ?? 30_000;
  const duration = overrides.duration_ms ?? 180_000;
  return {
    is_playing: true,
    progress_ms: progress,
    item: {
      id: "abc",
      uri: "spotify:track:abc",
      name: "Song",
      duration_ms: duration,
      artists: [{ name: "A" }],
      album: { images: [{ url: "https://img/x.jpg" }] },
    },
    device: {
      id: "d1",
      name: "PC",
      type: "Computer",
      is_active: true,
      is_private_session: false,
      is_restricted: false,
      volume_percent: 80,
    },
    ...overrides,
  };
}

describe("evaluateSpotifyPoll", () => {
  it("advances when near-end and session disappears", () => {
    const result = evaluateSpotifyPoll(
      baseInput({
        state: null,
        nearEndSeen: true,
        confirmedPlaying: true,
        peakProgressMs: 170_000,
      })
    );
    expect(result.action.kind).toBe("advance");
    expect(result.clearEndTimer).toBe(true);
  });

  it("retries stuck play once", () => {
    const result = evaluateSpotifyPoll(
      baseInput({
        state: playingState({
          is_playing: false,
          progress_ms: 0,
        }),
        playIssuedAt: 1000,
        now: 5000,
        confirmedPlaying: false,
        stuckRetryDone: false,
      })
    );
    expect(result.action.kind).toBe("retry_play");
    expect(result.snapshot.stuckRetryDone).toBe(true);
  });

  it("schedules precise end near the finish", () => {
    const result = evaluateSpotifyPoll(
      baseInput({
        state: playingState({ progress_ms: 177_000, duration_ms: 180_000 }),
        confirmedPlaying: true,
        peakProgressMs: 177_000,
      })
    );
    expect(result.action.kind).toBe("continue");
    expect(result.snapshot.nearEndSeen).toBe(true);
    expect(result.scheduleEndMs).toBe(3000);
  });

  it("starts cortina fade near cut", () => {
    const result = evaluateSpotifyPoll(
      baseInput({
        state: playingState({ progress_ms: 40_000, duration_ms: 90_000 }),
        isCortina: true,
        cortinaSeconds: 45,
        confirmedPlaying: true,
      })
    );
    expect(result.action.kind).toBe("cortina_fade");
  });

  it("learns device volume as a structural change", () => {
    const result = evaluateSpotifyPoll(
      baseInput({
        state: playingState({
          progress_ms: 20_000,
          device: {
            id: "d1",
            name: "PC",
            type: "Computer",
            is_active: true,
            is_private_session: false,
            is_restricted: false,
            volume_percent: 55,
          },
        }),
        baseVolume: 80,
        confirmedPlaying: true,
      })
    );
    expect(result.snapshot.learnedVolume).toBe(55);
    expect(result.action).toEqual({ kind: "continue", structural: true });
  });
});

describe("evaluateLocalProgress", () => {
  it("advances at end epsilon", () => {
    expect(
      evaluateLocalProgress({
        progressMs: 179_950,
        durationMs: 180_000,
        isCortina: false,
        cortinaSeconds: 45,
        fading: false,
        hasEndTimer: false,
      }).kind
    ).toBe("advance");
  });

  it("schedules end when near finish", () => {
    const result = evaluateLocalProgress({
      progressMs: 177_000,
      durationMs: 180_000,
      isCortina: false,
      cortinaSeconds: 45,
      fading: false,
      hasEndTimer: false,
    });
    expect(result).toEqual({ kind: "schedule_end", remainingMs: 3000 });
  });
});
