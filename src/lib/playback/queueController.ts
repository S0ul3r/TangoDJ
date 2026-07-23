/**
 * Unified night-queue playback controller.
 * Plays one track at a time so tanda tracks advance, then cortina, then next tanda.
 */

import type {
  EventQueueItem,
  Tanda,
  Track,
  TrackSource,
} from "@/types/domain";
import { LocalAudioPlayer } from "./localAudio";
import {
  getPlaybackState,
  pausePlayback,
  playUris,
  resumePlayback,
  seekPlayback,
  setPlaybackVolume,
  setRepeatMode,
} from "./spotifyConnect";
import { findLocalFallback } from "@/lib/tracks";

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
  progressMs: number;
  durationMs: number;
  albumArtUrl: string | null;
  volumePercent: number;
}

export interface QueueControllerDeps {
  getAccessToken: () => Promise<string | null>;
  getDeviceId: () => string | null;
  resolveLocalFile: (track: Track) => Promise<File | Blob | null>;
  onChange?: () => void;
  onError?: (message: string) => void;
}

const DEFAULT_CORTINA_SECONDS = 45;
const DEFAULT_GAP_SECONDS = 2;
/** Fade cortina over the last N ms before cutting to the next tanda. */
const CORTINA_FADE_MS = 6000;
/** Advance when this much of the track remains (ms). */
const END_EPSILON_MS = 100;
/**
 * Spotify metadata duration is sometimes longer than the real audio
 * (e.g. listed 2:57, audio ends ~2:50). After a jump to 0:00 / stop,
 * wait this long before treating it as end-of-track.
 */
const PREMATURE_END_CONFIRM_MS = 2500;
/** Need at least this much playback before premature-end logic can fire. */
const MIN_PEAK_FOR_PREMATURE_MS = 20_000;

function flattenTracksForItem(
  item: EventQueueItem,
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): Track[] {
  if (item.type === "cortina") {
    const t = item.trackId ? tracksById.get(item.trackId) : undefined;
    return t ? [t] : [];
  }
  const tanda = item.tandaId ? tandasById.get(item.tandaId) : undefined;
  if (!tanda) return [];
  return tanda.trackIds
    .map((id) => tracksById.get(id))
    .filter((t): t is Track => !!t);
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { formatMs };

export class QueueController {
  private items: EventQueueItem[] = [];
  private tandasById = new Map<string, Tanda>();
  private tracksById = new Map<string, Track>();
  private cursor: PlaybackCursor = { queueIndex: 0, trackIndex: 0 };
  private status: QueueControllerStatus = "idle";
  private local = new LocalAudioPlayer();
  private activeSource: TrackSource | null = null;
  private error: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private cortinaTimer: ReturnType<typeof setTimeout> | null = null;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private playingOverride: Track | null = null;
  private usedFallback = false;
  private advancing = false;
  private progressMs = 0;
  private durationMs = 0;
  private liveAlbumArtUrl: string | null = null;
  private cortinaSeconds = DEFAULT_CORTINA_SECONDS;
  private gapSeconds = DEFAULT_GAP_SECONDS;
  private expectedSpotifyUri: string | null = null;
  private nearEndSeen = false;
  private baseVolume = 100;
  private fading = false;
  private playGeneration = 0;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  /** While true, keep Spotify/local at 0 until the next track is actually started. */
  private holdSilent = false;
  /** Wall-clock when we last issued a play for the current cursor. */
  private playIssuedAt = 0;
  /** True once Spotify reported is_playing for the current track. */
  private confirmedPlaying = false;
  private stuckRetryDone = false;
  /** Highest progress seen for current track (to detect abrupt 0:00 end). */
  private peakProgressMs = 0;
  /** When set, we saw a premature stop and are confirming before advance. */
  private prematureEndSince: number | null = null;

  constructor(private deps: QueueControllerDeps) {
    this.local.setEndedHandler(() => {
      void this.onNaturalTrackEnd();
    });
    this.local.setErrorHandler((msg) => {
      this.error = msg;
      this.status = "error";
      this.deps.onError?.(msg);
      this.notify();
    });
  }

  loadQueue(
    items: EventQueueItem[],
    tandas: Tanda[],
    tracks: Track[],
    startAt: PlaybackCursor = { queueIndex: 0, trackIndex: 0 }
  ) {
    this.stopEngines();
    this.items = items;
    this.tandasById = new Map(tandas.map((t) => [t.id, t]));
    this.tracksById = new Map(tracks.map((t) => [t.id, t]));
    this.cursor = startAt;
    this.status = "idle";
    this.error = null;
    this.progressMs = 0;
    this.durationMs = 0;
    this.liveAlbumArtUrl = null;
    this.notify();
  }

  updateLibrary(tandas: Tanda[], tracks: Track[]) {
    this.tandasById = new Map(tandas.map((t) => [t.id, t]));
    this.tracksById = new Map(tracks.map((t) => [t.id, t]));
    this.notify();
  }

  setCortinaSeconds(seconds: number) {
    this.cortinaSeconds = Math.min(200, Math.max(10, Math.round(seconds)));
    this.notify();
  }

  getCortinaSeconds() {
    return this.cortinaSeconds;
  }

  setGapSeconds(seconds: number) {
    this.gapSeconds = Math.min(10, Math.max(0, Math.round(seconds)));
    this.notify();
  }

  getGapSeconds() {
    return this.gapSeconds;
  }

  getVolumePercent() {
    return this.baseVolume;
  }

  async setVolumePercent(percent: number): Promise<void> {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    this.baseVolume = clamped;
    if (!this.fading && !this.holdSilent) {
      await this.applyVolume(clamped);
    }
    this.notify();
  }

  getStatus() {
    return this.status;
  }

  getError() {
    return this.error;
  }

  getCursor() {
    return { ...this.cursor };
  }

  getNowPlaying(): NowPlayingInfo | null {
    const item = this.items[this.cursor.queueIndex];
    if (!item) return null;
    const tracks = flattenTracksForItem(item, this.tandasById, this.tracksById);
    const planned = tracks[this.cursor.trackIndex];
    const track = this.playingOverride ?? planned;
    if (!track) return null;
    const tanda =
      item.type === "tanda" && item.tandaId
        ? this.tandasById.get(item.tandaId) ?? null
        : null;

    let nextLabel: string | null = null;
    if (this.cursor.trackIndex + 1 < tracks.length) {
      nextLabel = tracks[this.cursor.trackIndex + 1]?.name ?? null;
    } else {
      const nextItem = this.items[this.cursor.queueIndex + 1];
      if (nextItem?.type === "cortina") {
        const ct = nextItem.trackId
          ? this.tracksById.get(nextItem.trackId)
          : null;
        nextLabel = ct ? `Cortina · ${ct.name}` : "Cortina";
      } else if (nextItem?.type === "tanda" && nextItem.tandaId) {
        nextLabel = this.tandasById.get(nextItem.tandaId)?.name ?? "Next tanda";
      }
    }

    return {
      track,
      source: track.source,
      usedFallback: this.usedFallback,
      queueItem: item,
      queueIndex: this.cursor.queueIndex,
      trackIndex: this.cursor.trackIndex,
      tanda,
      nextLabel,
      progressMs: this.progressMs,
      durationMs:
        item.type === "cortina"
          ? Math.min(
              this.durationMs || this.cortinaSeconds * 1000,
              this.cortinaSeconds * 1000
            )
          : this.durationMs || track.durationMs || 0,
      albumArtUrl: this.liveAlbumArtUrl ?? track.albumArtUrl ?? null,
      volumePercent: this.baseVolume,
    };
  }

  async play(): Promise<void> {
    const np = this.getNowPlaying();
    if (!np) {
      this.error = "Nothing in the queue to play.";
      this.status = "error";
      this.notify();
      return;
    }
    this.status = "loading";
    this.error = null;
    this.notify();
    try {
      await this.playTrack(np.track, np.queueItem);
      this.status = "playing";
      this.notify();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Playback failed";
      this.error = msg;
      this.status = "error";
      this.deps.onError?.(msg);
      this.notify();
    }
  }

  async pause(): Promise<void> {
    this.clearCortinaTimer();
    if (this.activeSource === "local") {
      this.local.pause();
    } else if (this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) {
        try {
          await pausePlayback(token, this.deps.getDeviceId());
        } catch {
          /* Restriction violated / no active device — still mark paused locally */
        }
      }
    }
    this.status = "paused";
    this.notify();
  }

  async resume(): Promise<void> {
    if (this.activeSource === "local") {
      await this.local.resume();
      this.status = "playing";
      this.scheduleCortinaCutIfNeeded();
      this.notify();
      return;
    }
    if (this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) {
        try {
          const ok = await resumePlayback(token, this.deps.getDeviceId());
          if (!ok) {
            // Nothing to resume (stuck/idle) — re-issue play for current track
            await this.play();
            return;
          }
        } catch {
          await this.play();
          return;
        }
      }
    }
    this.status = "playing";
    this.scheduleCortinaCutIfNeeded();
    this.notify();
  }

  async togglePlayPause(): Promise<void> {
    try {
      if (this.status === "playing") await this.pause();
      else if (this.status === "paused") await this.resume();
      else await this.play();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Playback control failed";
      this.error = msg;
      this.deps.onError?.(msg);
      this.notify();
    }
  }

  /** Next song in tanda; at last track or on cortina → next queue item. */
  async skipTrack(): Promise<void> {
    const item = this.items[this.cursor.queueIndex];
    if (!item) return;
    const tracks = flattenTracksForItem(item, this.tandasById, this.tracksById);
    if (this.cursor.trackIndex + 1 < tracks.length) {
      await this.goToTrack(this.cursor.trackIndex + 1, true);
      return;
    }
    // Last song in tanda, or cortina → jump to next queue item
    await this.goToQueueItem(this.cursor.queueIndex + 1);
  }

  /** Previous song within current tanda/cortina only. */
  async previousTrack(): Promise<void> {
    if (this.cursor.trackIndex <= 0) return;
    await this.goToTrack(this.cursor.trackIndex - 1, false);
  }

  async nextQueueItem(): Promise<void> {
    await this.goToQueueItem(this.cursor.queueIndex + 1);
  }

  async previousQueueItem(): Promise<void> {
    await this.goToQueueItem(this.cursor.queueIndex - 1);
  }

  async jumpTo(queueIndex: number, trackIndex = 0): Promise<void> {
    if (queueIndex < 0 || queueIndex >= this.items.length) return;
    this.clearGapTimer();
    this.stopEngines();
    this.cursor = { queueIndex, trackIndex };
    await this.play();
  }

  async seek(positionMs: number): Promise<void> {
    const ms = Math.max(0, Math.round(positionMs));
    const item = this.items[this.cursor.queueIndex];
    const limit =
      item?.type === "cortina" ? this.cortinaSeconds * 1000 : this.durationMs;
    const clamped = limit > 0 ? Math.min(ms, limit) : ms;
    this.progressMs = clamped;
    this.nearEndSeen = false;

    if (this.activeSource === "local") {
      this.local.seek(clamped / 1000);
    } else if (this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) {
        await seekPlayback(token, clamped, this.deps.getDeviceId());
      }
    }

    if (item?.type === "cortina" && this.status === "playing") {
      this.scheduleCortinaCutIfNeeded(item);
    }
    this.notify();
  }

  destroy() {
    this.stopEngines();
    this.local.setEndedHandler(null);
    this.local.setErrorHandler(null);
  }

  private clearEndTimer() {
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
  }

  private schedulePreciseEnd(remainingMs: number) {
    this.clearEndTimer();
    const wait = Math.max(0, remainingMs - END_EPSILON_MS);
    this.endTimer = setTimeout(() => {
      this.endTimer = null;
      void this.onNaturalTrackEnd();
    }, wait);
  }

  private async goToTrack(trackIndex: number, withGap: boolean): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    this.clearCortinaTimer();
    this.clearGapTimer();
    this.clearEndTimer();
    try {
      this.cursor = { ...this.cursor, trackIndex };
      if (withGap && this.gapSeconds > 0) {
        await this.pauseEnginesQuietly();
        this.status = "loading";
        this.notify();
        await sleep(this.gapSeconds * 1000);
      }
      await this.play();
    } finally {
      this.advancing = false;
    }
  }

  private async goToQueueItem(queueIndex: number): Promise<void> {
    if (this.advancing) return;
    if (queueIndex < 0 || queueIndex >= this.items.length) return;
    this.advancing = true;
    this.clearCortinaTimer();
    this.clearGapTimer();
    this.clearEndTimer();
    try {
      this.cursor = { queueIndex, trackIndex: 0 };
      this.holdSilent = false;
      await this.play();
    } finally {
      this.advancing = false;
    }
  }

  /**
   * Natural end of a track → next in tanda (with gap), or next queue item.
   * Cortina → tanda is handled by finishCortinaWithFade (no gap).
   */
  private async onNaturalTrackEnd(): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    this.clearCortinaTimer();
    this.clearEndTimer();
    try {
      const item = this.items[this.cursor.queueIndex];
      if (!item) {
        this.status = "idle";
        this.notify();
        return;
      }
      const tracks = flattenTracksForItem(
        item,
        this.tandasById,
        this.tracksById
      );

      if (this.cursor.trackIndex + 1 < tracks.length) {
        this.cursor.trackIndex += 1;
        if (this.gapSeconds > 0) {
          await this.pauseEnginesQuietly();
          this.status = "loading";
          this.notify();
          await sleep(this.gapSeconds * 1000);
        }
        await this.play();
        return;
      }

      if (this.cursor.queueIndex + 1 >= this.items.length) {
        this.stopEngines();
        this.status = "idle";
        this.notify();
        return;
      }

      // Last track of tanda → cortina (or next item): keep the gap silence
      this.cursor = {
        queueIndex: this.cursor.queueIndex + 1,
        trackIndex: 0,
      };
      if (this.gapSeconds > 0) {
        await this.pauseEnginesQuietly();
        this.status = "loading";
        this.notify();
        await sleep(this.gapSeconds * 1000);
      }
      await this.play();
    } finally {
      this.advancing = false;
    }
  }

  private async pauseEnginesQuietly(): Promise<void> {
    this.stopSpotifyPoll();
    this.clearEndTimer();
    if (this.activeSource === "local") {
      this.local.pause();
    } else if (this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) {
        try {
          await pausePlayback(token, this.deps.getDeviceId());
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async playTrack(track: Track, item: EventQueueItem): Promise<void> {
    const gen = ++this.playGeneration;
    const startSilent = this.holdSilent;
    this.playingOverride = null;
    this.usedFallback = false;
    this.clearCortinaTimer();
    this.clearEndTimer();
    this.progressMs = 0;
    this.durationMs = track.durationMs ?? 0;
    this.liveAlbumArtUrl = track.albumArtUrl ?? null;
    this.nearEndSeen = false;
    this.fading = false;
    this.expectedSpotifyUri = null;
    this.playIssuedAt = 0;
    this.confirmedPlaying = false;
    this.stuckRetryDone = false;
    this.peakProgressMs = 0;
    this.prematureEndSince = null;

    if (track.source === "spotify" && this.activeSource === "local") {
      this.local.stop();
    }
    if (track.source === "local" && this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) {
        try {
          await pausePlayback(token, this.deps.getDeviceId());
        } catch {
          /* ignore */
        }
      }
      this.stopSpotifyPoll();
    }

    // After cortina fade: stay at 0 until the NEW uri is playing.
    // Otherwise raise to x first (normal tanda track changes).
    if (!startSilent) {
      await this.applyVolume(this.baseVolume);
    } else {
      await this.applyVolume(0);
    }

    if (track.source === "spotify") {
      try {
        await this.playSpotify(track, startSilent);
      } catch (e) {
        const fallback = findLocalFallback(
          track,
          Array.from(this.tracksById.values())
        );
        if (!fallback) throw e;
        this.playingOverride = fallback;
        this.usedFallback = true;
        this.deps.onError?.(
          `Spotify failed — playing local ${fallback.genre}: “${fallback.name}”.`
        );
        await this.playLocal(fallback, startSilent);
      }
    } else {
      await this.playLocal(track, startSilent);
    }

    if (gen !== this.playGeneration) return;

    // Safe to restore volume — new track is active / loaded
    this.holdSilent = false;
    await this.applyVolume(this.baseVolume);
    this.scheduleCortinaCutIfNeeded(item);
  }

  private scheduleCortinaCutIfNeeded(item?: EventQueueItem) {
    this.clearCortinaTimer();
    const current = item ?? this.items[this.cursor.queueIndex];
    if (!current || current.type !== "cortina") return;
    if (this.status === "paused") return;

    const limitMs = this.cortinaSeconds * 1000;
    const fadeMs = Math.min(
      CORTINA_FADE_MS,
      Math.max(800, Math.floor(limitMs / 2))
    );
    const fadeAt = Math.max(0, limitMs - fadeMs - this.progressMs);
    this.cortinaTimer = setTimeout(() => {
      void this.finishCortinaWithFade(fadeMs);
    }, fadeAt);
  }

  /**
   * Fade cortina x→0, pause at 0, then start next tanda while still silent,
   * and only then restore volume x (never raise volume while cortina can sound).
   */
  private async finishCortinaWithFade(fadeMs = CORTINA_FADE_MS): Promise<void> {
    if (this.advancing || this.fading) return;
    this.advancing = true;
    this.clearCortinaTimer();
    this.clearEndTimer();
    this.holdSilent = true;
    try {
      await this.runVolumeFade(fadeMs);
      await this.applyVolume(0);
      await this.pauseEnginesQuietly();
      // Extra silence guard — Spotify sometimes buffers a few ms after pause
      await sleep(80);
      await this.applyVolume(0);

      if (this.cursor.queueIndex + 1 >= this.items.length) {
        this.holdSilent = false;
        this.stopEngines();
        this.status = "idle";
        this.notify();
        return;
      }

      this.cursor = {
        queueIndex: this.cursor.queueIndex + 1,
        trackIndex: 0,
      };
      // holdSilent stays true through play() so volume stays 0 until new URI
      await this.play();
    } finally {
      this.holdSilent = false;
      this.advancing = false;
    }
  }

  private async runVolumeFade(durationMs: number): Promise<void> {
    if (this.fading) return;
    this.fading = true;
    const from = this.baseVolume;
    const ms = Math.max(400, durationMs);
    const steps = 12;
    const stepMs = Math.max(40, Math.floor(ms / steps));
    try {
      for (let i = steps - 1; i >= 0; i--) {
        const pct = Math.round((i / steps) * from);
        await this.applyVolume(pct);
        await sleep(stepMs);
      }
      await this.applyVolume(0);
    } finally {
      this.fading = false;
    }
  }

  private async applyVolume(percent: number): Promise<void> {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    if (this.activeSource === "local" || !this.activeSource) {
      this.local.setVolume(clamped / 100);
    }
    if (this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) {
        try {
          await setPlaybackVolume(token, clamped, this.deps.getDeviceId());
        } catch {
          /* ignore volume errors */
        }
      }
    }
  }

  private clearCortinaTimer() {
    if (this.cortinaTimer) {
      clearTimeout(this.cortinaTimer);
      this.cortinaTimer = null;
    }
  }

  private clearGapTimer() {
    if (this.gapTimer) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  /** Wait until Spotify reports the expected URI (or timeout). */
  private async waitForSpotifyUri(
    token: string,
    uri: string,
    timeoutMs = 900
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const state = await getPlaybackState(token);
        if (state?.item?.uri === uri) return true;
      } catch {
        /* ignore */
      }
      await sleep(60);
    }
    return false;
  }

  private async playSpotify(
    track: Track,
    startSilent = false
  ): Promise<void> {
    if (!track.spotifyUri) {
      throw new Error(`No Spotify URI for "${track.name}".`);
    }

    const token = await this.deps.getAccessToken();
    if (!token) throw new Error("Not signed in to Spotify.");

    const deviceId = this.deps.getDeviceId();
    await setRepeatMode(token, "off", deviceId);

    // Critical: when coming from cortina fade, keep device at 0 until URI switches
    await setPlaybackVolume(token, startSilent ? 0 : this.baseVolume, deviceId);
    await playUris(token, [track.spotifyUri], deviceId);

    this.activeSource = "spotify";
    this.expectedSpotifyUri = track.spotifyUri;
    this.liveAlbumArtUrl = track.albumArtUrl ?? null;
    this.playIssuedAt = Date.now();
    this.confirmedPlaying = false;
    this.stuckRetryDone = false;
    this.peakProgressMs = 0;
    this.prematureEndSince = null;

    if (startSilent) {
      await this.waitForSpotifyUri(token, track.spotifyUri);
      // Still silent — volume restore happens in playTrack after this returns
      await setPlaybackVolume(token, 0, deviceId);
    }

    this.startSpotifyPoll();
  }

  private async playLocal(track: Track, startSilent = false): Promise<void> {
    const file = await this.deps.resolveLocalFile(track);
    if (!file) {
      throw new Error(
        `Local file not available for "${track.name}". Re-link your music folder.`
      );
    }
    this.stopSpotifyPoll();
    this.activeSource = "local";
    this.expectedSpotifyUri = null;
    this.liveAlbumArtUrl = track.albumArtUrl ?? null;
    this.local.setVolume(startSilent ? 0 : this.baseVolume / 100);
    await this.local.playFile(file);
    this.startLocalPoll();
  }

  private startLocalPoll() {
    this.stopSpotifyPoll();
    this.pollTimer = setInterval(() => {
      if (this.activeSource !== "local" || this.status !== "playing") return;
      this.progressMs = Math.round(this.local.currentTime * 1000);
      const dur = this.local.duration;
      if (Number.isFinite(dur) && dur > 0) {
        this.durationMs = Math.round(dur * 1000);
      }

      const item = this.items[this.cursor.queueIndex];
      if (item?.type === "cortina") {
        const limitMs = this.cortinaSeconds * 1000;
        const fadeStart = Math.max(0, limitMs - CORTINA_FADE_MS);
        if (!this.fading && this.progressMs >= fadeStart) {
          void this.finishCortinaWithFade();
          return;
        }
      } else if (this.durationMs > 0) {
        const remaining = this.durationMs - this.progressMs;
        if (remaining <= END_EPSILON_MS) {
          void this.onNaturalTrackEnd();
          return;
        }
        if (remaining < 2500 && !this.endTimer) {
          this.schedulePreciseEnd(remaining);
        }
      }
      this.notify();
    }, 250);
  }

  private startSpotifyPoll() {
    this.stopSpotifyPoll();
    this.nearEndSeen = false;

    this.pollTimer = setInterval(() => {
      void (async () => {
        if (
          this.activeSource !== "spotify" ||
          this.status !== "playing" ||
          this.advancing
        ) {
          return;
        }
        try {
          const token = await this.deps.getAccessToken();
          if (!token) return;
          const state = await getPlaybackState(token);
          const deviceId = this.deps.getDeviceId();
          const item = this.items[this.cursor.queueIndex];

          // No active Spotify session — treat as end if we already played near the end
          if (!state) {
            if (this.nearEndSeen) {
              this.clearEndTimer();
              this.nearEndSeen = false;
              this.prematureEndSince = null;
              await this.onNaturalTrackEnd();
              return;
            }
            if (
              this.confirmedPlaying &&
              this.peakProgressMs >= MIN_PEAK_FOR_PREMATURE_MS
            ) {
              if (this.prematureEndSince == null) {
                this.prematureEndSince = Date.now();
              } else if (
                Date.now() - this.prematureEndSince >=
                PREMATURE_END_CONFIRM_MS
              ) {
                this.prematureEndSince = null;
                this.clearEndTimer();
                await this.onNaturalTrackEnd();
              }
            }
            return;
          }

          const uri = state.item?.uri ?? null;
          const progress = state.progress_ms ?? 0;
          const duration =
            state.item?.duration_ms ??
            (this.durationMs > 0 ? this.durationMs : 0);
          this.progressMs = progress;
          if (duration > 0) this.durationMs = duration;
          if (progress > this.peakProgressMs) this.peakProgressMs = progress;

          const art =
            state.item?.album?.images?.[0]?.url ??
            state.item?.album?.images?.[1]?.url ??
            null;
          if (art) this.liveAlbumArtUrl = art;

          // Learn user volume from Spotify (knob / app) when not fading
          const deviceVol = state.device?.volume_percent;
          if (
            !this.fading &&
            !this.holdSilent &&
            typeof deviceVol === "number" &&
            deviceVol !== this.baseVolume
          ) {
            this.baseVolume = Math.min(100, Math.max(0, deviceVol));
          }

          if (state.is_playing && progress > 500) {
            this.confirmedPlaying = true;
          }

          const uriMatches =
            !this.expectedSpotifyUri ||
            !uri ||
            uri === this.expectedSpotifyUri;

          // Stuck at 0:00 — play accepted but device never started (restricted / flaky)
          if (
            uriMatches &&
            !state.is_playing &&
            progress < 1500 &&
            !this.confirmedPlaying &&
            this.playIssuedAt > 0 &&
            Date.now() - this.playIssuedAt > 3500
          ) {
            if (!this.stuckRetryDone && this.expectedSpotifyUri) {
              this.stuckRetryDone = true;
              this.playIssuedAt = Date.now();
              try {
                await playUris(
                  token,
                  [this.expectedSpotifyUri],
                  deviceId
                );
              } catch (e) {
                const msg =
                  e instanceof Error ? e.message : "Spotify play failed";
                this.error = msg;
                this.deps.onError?.(
                  `${msg} — skipping unplayable track.`
                );
                this.clearEndTimer();
                await this.onNaturalTrackEnd();
              }
              return;
            }
            if (Date.now() - this.playIssuedAt > 3500) {
              this.deps.onError?.(
                "Spotify did not start this track — skipping."
              );
              this.clearEndTimer();
              await this.onNaturalTrackEnd();
              return;
            }
          }

          // Same URI restarted from the beginning after near-end (repeat / auto-restart)
          if (
            this.nearEndSeen &&
            uriMatches &&
            progress < 2500 &&
            this.confirmedPlaying
          ) {
            this.nearEndSeen = false;
            this.prematureEndSince = null;
            this.clearEndTimer();
            await this.onNaturalTrackEnd();
            return;
          }

          // Metadata longer than real audio (e.g. 2:57 listed, ends ~2:50):
          // peak is close to true end but not within a few seconds of duration.
          const closeToListedEnd =
            duration > 0 &&
            this.peakProgressMs >= Math.max(0, duration - 12_000);
          if (
            this.confirmedPlaying &&
            uriMatches &&
            progress < 2000 &&
            closeToListedEnd
          ) {
            this.nearEndSeen = false;
            this.prematureEndSince = null;
            this.clearEndTimer();
            await this.onNaturalTrackEnd();
            return;
          }

          // Premature stop / jump-to-0: confirm silence, then advance (gap applies in onNaturalTrackEnd)
          const jumpedToStart =
            this.confirmedPlaying &&
            uriMatches &&
            progress < 2000 &&
            this.peakProgressMs >= MIN_PEAK_FOR_PREMATURE_MS &&
            this.peakProgressMs - progress > 15_000;
          const stoppedWithTimeLeft =
            this.confirmedPlaying &&
            uriMatches &&
            !state.is_playing &&
            this.peakProgressMs >= MIN_PEAK_FOR_PREMATURE_MS &&
            duration > 0 &&
            duration - progress > 5000 &&
            progress >= 5000;

          if (jumpedToStart || stoppedWithTimeLeft) {
            if (this.prematureEndSince == null) {
              this.prematureEndSince = Date.now();
            } else if (
              Date.now() - this.prematureEndSince >=
              PREMATURE_END_CONFIRM_MS
            ) {
              this.prematureEndSince = null;
              this.nearEndSeen = false;
              this.clearEndTimer();
              await this.onNaturalTrackEnd();
              return;
            }
          } else if (state.is_playing && progress > 3000) {
            this.prematureEndSince = null;
          }

          // Finished: Spotify stops near end (progress still high)
          if (
            this.confirmedPlaying &&
            !state.is_playing &&
            uriMatches &&
            this.nearEndSeen &&
            duration > 0 &&
            progress >= duration - 2000
          ) {
            this.nearEndSeen = false;
            this.prematureEndSince = null;
            this.clearEndTimer();
            await this.onNaturalTrackEnd();
            return;
          }

          if (item?.type === "cortina") {
            const limitMs = this.cortinaSeconds * 1000;
            const fadeStart = Math.max(0, limitMs - CORTINA_FADE_MS);
            if (!this.fading && progress >= fadeStart) {
              this.clearCortinaTimer();
              await this.finishCortinaWithFade();
              return;
            }
            this.notify();
            return;
          }

          if (duration > 0) {
            const remaining = duration - progress;
            // progress can be 0 at true end — still treat as finished if we were near end
            if (
              remaining <= END_EPSILON_MS ||
              (progress === 0 &&
                this.nearEndSeen &&
                this.confirmedPlaying &&
                !state.is_playing)
            ) {
              this.nearEndSeen = false;
              this.clearEndTimer();
              await this.onNaturalTrackEnd();
              return;
            }

            if (progress > 0) {
              if (remaining < 2500) {
                this.nearEndSeen = true;
                if (!this.endTimer) this.schedulePreciseEnd(remaining);
              } else {
                this.nearEndSeen = false;
                this.clearEndTimer();
              }

              if (
                this.confirmedPlaying &&
                !state.is_playing &&
                remaining < 2000
              ) {
                this.clearEndTimer();
                await this.onNaturalTrackEnd();
                return;
              }
            }
          }

          this.notify();
        } catch {
          /* ignore transient poll errors */
        }
      })();
    }, 500);
  }

  private stopSpotifyPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private stopEngines() {
    this.clearCortinaTimer();
    this.clearGapTimer();
    this.clearEndTimer();
    this.local.stop();
    this.stopSpotifyPoll();
    this.activeSource = null;
    this.playingOverride = null;
    this.usedFallback = false;
    this.progressMs = 0;
    this.durationMs = 0;
    this.liveAlbumArtUrl = null;
    this.expectedSpotifyUri = null;
    this.nearEndSeen = false;
    this.fading = false;
    this.holdSilent = false;
    this.playIssuedAt = 0;
    this.confirmedPlaying = false;
    this.stuckRetryDone = false;
    this.peakProgressMs = 0;
    this.prematureEndSince = null;
  }

  private notify() {
    this.deps.onChange?.();
  }
}
