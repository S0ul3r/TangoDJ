import type { EventQueueItem, Tanda, Track, TrackSource } from "@/types/domain";
import type { UpcomingInfo } from "./queueHelpers";

export type QueueControllerStatus =
  | "idle"
  | "playing"
  | "paused"
  | "loading"
  | "error";

export interface PlaybackCursor {
  queueIndex: number;
  /** Within current tanda; 0 for cortina */
  trackIndex: number;
}

export interface NowPlayingInfo {
  track: Track;
  source: TrackSource;
  usedFallback?: boolean;
  queueItem: EventQueueItem;
  queueIndex: number;
  trackIndex: number;
  tanda?: Tanda | null;
  nextLabel?: string | null;
  upcoming?: UpcomingInfo | null;
  remainingQueueMs?: number;
  progressMs: number;
  durationMs: number;
  albumArtUrl: string | null;
  volumePercent: number;
}

export interface PlaybackProgress {
  progressMs: number;
  durationMs: number;
}

export interface QueueControllerDeps {
  getAccessToken: () => Promise<string | null>;
  getDeviceId: () => string | null;
  resolveLocalFile: (track: Track) => Promise<File | Blob | null>;
  /** Structural playback changes (track, status, volume, metadata). */
  onChange?: () => void;
  /** Progress-only ticks — must not drive full React tree updates. */
  onProgress?: () => void;
  onError?: (message: string) => void;
}
