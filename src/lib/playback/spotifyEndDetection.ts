/**
 * Pure Spotify Connect poll / end-detection decisions.
 * QueueController applies the returned action; this module has no I/O.
 */

import {
  CORTINA_FADE_MS,
  END_EPSILON_MS,
  MIN_PEAK_FOR_PREMATURE_MS,
  NEAR_END_SCHEDULE_MS,
  PREMATURE_END_CONFIRM_MS,
} from "./constants";
import type { PlayerState } from "./spotifyConnect";

export type SpotifyPollAction =
  | { kind: "continue"; structural: boolean }
  | { kind: "advance" }
  | { kind: "cortina_fade" }
  | { kind: "retry_play"; uri: string }
  | { kind: "skip_unplayable"; message: string };

export interface SpotifyPollSnapshot {
  progressMs: number;
  durationMs: number;
  peakProgressMs: number;
  confirmedPlaying: boolean;
  nearEndSeen: boolean;
  prematureEndSince: number | null;
  stuckRetryDone: boolean;
  playIssuedAt: number;
  liveAlbumArtUrl: string | null;
  /** Device volume learned from Spotify, if changed. */
  learnedVolume: number | null;
}

export interface SpotifyPollInput {
  state: PlayerState | null;
  now: number;
  progressMs: number;
  durationMs: number;
  peakProgressMs: number;
  confirmedPlaying: boolean;
  nearEndSeen: boolean;
  prematureEndSince: number | null;
  stuckRetryDone: boolean;
  playIssuedAt: number;
  expectedSpotifyUri: string | null;
  liveAlbumArtUrl: string | null;
  baseVolume: number;
  fading: boolean;
  holdSilent: boolean;
  isCortina: boolean;
  cortinaSeconds: number;
  hasEndTimer: boolean;
}

export interface SpotifyPollResult {
  snapshot: SpotifyPollSnapshot;
  action: SpotifyPollAction;
  /** When set, schedule a precise end timer for this remaining ms. */
  scheduleEndMs: number | null;
  clearEndTimer: boolean;
}

function snap(
  input: SpotifyPollInput,
  overrides: Partial<SpotifyPollSnapshot> = {}
): SpotifyPollSnapshot {
  return {
    progressMs: input.progressMs,
    durationMs: input.durationMs,
    peakProgressMs: input.peakProgressMs,
    confirmedPlaying: input.confirmedPlaying,
    nearEndSeen: input.nearEndSeen,
    prematureEndSince: input.prematureEndSince,
    stuckRetryDone: input.stuckRetryDone,
    playIssuedAt: input.playIssuedAt,
    liveAlbumArtUrl: input.liveAlbumArtUrl,
    learnedVolume: null,
    ...overrides,
  };
}

function evaluateNoState(input: SpotifyPollInput): SpotifyPollResult {
  if (input.nearEndSeen) {
    return {
      snapshot: snap(input, {
        nearEndSeen: false,
        prematureEndSince: null,
      }),
      action: { kind: "advance" },
      scheduleEndMs: null,
      clearEndTimer: true,
    };
  }

  if (
    input.confirmedPlaying &&
    input.peakProgressMs >= MIN_PEAK_FOR_PREMATURE_MS
  ) {
    if (input.prematureEndSince == null) {
      return {
        snapshot: snap(input, { prematureEndSince: input.now }),
        action: { kind: "continue", structural: false },
        scheduleEndMs: null,
        clearEndTimer: false,
      };
    }
    if (input.now - input.prematureEndSince >= PREMATURE_END_CONFIRM_MS) {
      return {
        snapshot: snap(input, { prematureEndSince: null }),
        action: { kind: "advance" },
        scheduleEndMs: null,
        clearEndTimer: true,
      };
    }
  }

  return {
    snapshot: snap(input),
    action: { kind: "continue", structural: false },
    scheduleEndMs: null,
    clearEndTimer: false,
  };
}

export function evaluateSpotifyPoll(input: SpotifyPollInput): SpotifyPollResult {
  if (!input.state) return evaluateNoState(input);

  const state = input.state;
  const uri = state.item?.uri ?? null;
  const progress = state.progress_ms ?? 0;
  const duration =
    state.item?.duration_ms ?? (input.durationMs > 0 ? input.durationMs : 0);
  const peakProgressMs = Math.max(input.peakProgressMs, progress);

  const art =
    state.item?.album?.images?.[0]?.url ??
    state.item?.album?.images?.[1]?.url ??
    null;
  let structural = false;
  let liveAlbumArtUrl = input.liveAlbumArtUrl;
  if (art && art !== liveAlbumArtUrl) {
    liveAlbumArtUrl = art;
    structural = true;
  }

  let learnedVolume: number | null = null;
  const deviceVol = state.device?.volume_percent;
  if (
    !input.fading &&
    !input.holdSilent &&
    typeof deviceVol === "number" &&
    deviceVol !== input.baseVolume
  ) {
    learnedVolume = Math.min(100, Math.max(0, deviceVol));
    structural = true;
  }

  const confirmedPlaying =
    input.confirmedPlaying || (state.is_playing && progress > 500);

  const base = snap(input, {
    progressMs: progress,
    durationMs: duration > 0 ? duration : input.durationMs,
    peakProgressMs,
    confirmedPlaying,
    liveAlbumArtUrl,
    learnedVolume,
  });

  const uriMatches =
    !input.expectedSpotifyUri || !uri || uri === input.expectedSpotifyUri;

  // Stuck at 0:00 — play accepted but device never started
  if (
    uriMatches &&
    !state.is_playing &&
    progress < 1500 &&
    !confirmedPlaying &&
    input.playIssuedAt > 0 &&
    input.now - input.playIssuedAt > 3500
  ) {
    if (!input.stuckRetryDone && input.expectedSpotifyUri) {
      return {
        snapshot: {
          ...base,
          stuckRetryDone: true,
          playIssuedAt: input.now,
        },
        action: { kind: "retry_play", uri: input.expectedSpotifyUri },
        scheduleEndMs: null,
        clearEndTimer: false,
      };
    }
    if (input.now - input.playIssuedAt > 3500) {
      return {
        snapshot: base,
        action: {
          kind: "skip_unplayable",
          message: "Spotify did not start this track — skipping.",
        },
        scheduleEndMs: null,
        clearEndTimer: true,
      };
    }
  }

  // Same URI restarted from the beginning after near-end
  if (
    input.nearEndSeen &&
    uriMatches &&
    progress < 2500 &&
    confirmedPlaying
  ) {
    return {
      snapshot: { ...base, nearEndSeen: false, prematureEndSince: null },
      action: { kind: "advance" },
      scheduleEndMs: null,
      clearEndTimer: true,
    };
  }

  // Metadata longer than real audio
  const closeToListedEnd =
    duration > 0 && peakProgressMs >= Math.max(0, duration - 12_000);
  if (
    confirmedPlaying &&
    uriMatches &&
    progress < 2000 &&
    closeToListedEnd
  ) {
    return {
      snapshot: { ...base, nearEndSeen: false, prematureEndSince: null },
      action: { kind: "advance" },
      scheduleEndMs: null,
      clearEndTimer: true,
    };
  }

  // Premature stop / jump-to-0
  const jumpedToStart =
    confirmedPlaying &&
    uriMatches &&
    progress < 2000 &&
    peakProgressMs >= MIN_PEAK_FOR_PREMATURE_MS &&
    peakProgressMs - progress > 15_000;
  const stoppedWithTimeLeft =
    confirmedPlaying &&
    uriMatches &&
    !state.is_playing &&
    peakProgressMs >= MIN_PEAK_FOR_PREMATURE_MS &&
    duration > 0 &&
    duration - progress > 5000 &&
    progress >= 5000;

  if (jumpedToStart || stoppedWithTimeLeft) {
    if (input.prematureEndSince == null) {
      return {
        snapshot: { ...base, prematureEndSince: input.now },
        action: { kind: "continue", structural },
        scheduleEndMs: null,
        clearEndTimer: false,
      };
    }
    if (input.now - input.prematureEndSince >= PREMATURE_END_CONFIRM_MS) {
      return {
        snapshot: {
          ...base,
          prematureEndSince: null,
          nearEndSeen: false,
        },
        action: { kind: "advance" },
        scheduleEndMs: null,
        clearEndTimer: true,
      };
    }
  } else if (state.is_playing && progress > 3000) {
    base.prematureEndSince = null;
  }

  // Finished: Spotify stops near end
  if (
    confirmedPlaying &&
    !state.is_playing &&
    uriMatches &&
    input.nearEndSeen &&
    duration > 0 &&
    progress >= duration - 2000
  ) {
    return {
      snapshot: { ...base, nearEndSeen: false, prematureEndSince: null },
      action: { kind: "advance" },
      scheduleEndMs: null,
      clearEndTimer: true,
    };
  }

  if (input.isCortina) {
    const limitMs = input.cortinaSeconds * 1000;
    const fadeStart = Math.max(0, limitMs - CORTINA_FADE_MS);
    if (!input.fading && progress >= fadeStart) {
      return {
        snapshot: base,
        action: { kind: "cortina_fade" },
        scheduleEndMs: null,
        clearEndTimer: false,
      };
    }
    return {
      snapshot: base,
      action: { kind: "continue", structural },
      scheduleEndMs: null,
      clearEndTimer: false,
    };
  }

  if (duration > 0) {
    const remaining = duration - progress;
    if (
      remaining <= END_EPSILON_MS ||
      (progress === 0 &&
        input.nearEndSeen &&
        confirmedPlaying &&
        !state.is_playing)
    ) {
      return {
        snapshot: { ...base, nearEndSeen: false },
        action: { kind: "advance" },
        scheduleEndMs: null,
        clearEndTimer: true,
      };
    }

    if (progress > 0) {
      if (remaining < NEAR_END_SCHEDULE_MS) {
        const scheduleEndMs =
          !input.hasEndTimer ? remaining : null;
        if (
          confirmedPlaying &&
          !state.is_playing &&
          remaining < 2000
        ) {
          return {
            snapshot: { ...base, nearEndSeen: true },
            action: { kind: "advance" },
            scheduleEndMs: null,
            clearEndTimer: true,
          };
        }
        return {
          snapshot: { ...base, nearEndSeen: true },
          action: { kind: "continue", structural },
          scheduleEndMs,
          clearEndTimer: false,
        };
      }

      return {
        snapshot: { ...base, nearEndSeen: false },
        action: { kind: "continue", structural },
        scheduleEndMs: null,
        clearEndTimer: true,
      };
    }
  }

  return {
    snapshot: base,
    action: { kind: "continue", structural },
    scheduleEndMs: null,
    clearEndTimer: false,
  };
}

/** Shared near-end / cortina checks for local poll and Spotify progress ticks. */
export type LocalProgressAction =
  | { kind: "continue" }
  | { kind: "advance" }
  | { kind: "cortina_fade" }
  | { kind: "schedule_end"; remainingMs: number };

export function evaluateLocalProgress(input: {
  progressMs: number;
  durationMs: number;
  isCortina: boolean;
  cortinaSeconds: number;
  fading: boolean;
  hasEndTimer: boolean;
}): LocalProgressAction {
  if (input.isCortina) {
    const limitMs = input.cortinaSeconds * 1000;
    const fadeStart = Math.max(0, limitMs - CORTINA_FADE_MS);
    if (!input.fading && input.progressMs >= fadeStart) {
      return { kind: "cortina_fade" };
    }
    return { kind: "continue" };
  }

  if (input.durationMs > 0) {
    const remaining = input.durationMs - input.progressMs;
    if (remaining <= END_EPSILON_MS) return { kind: "advance" };
    if (remaining < NEAR_END_SCHEDULE_MS && !input.hasEndTimer) {
      return { kind: "schedule_end", remainingMs: remaining };
    }
  }
  return { kind: "continue" };
}
