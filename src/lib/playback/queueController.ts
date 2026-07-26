/**
 * Unified night-queue playback controller.
 * Plays one track at a time so tanda tracks advance, then cortina, then next tanda.
 *
 * Progress ticks call onProgress (cheap); structural changes call onChange.
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
  setRepeatMode,
} from "./spotifyConnect";
import { findLocalFallback } from "@/lib/tracks";
import {
  CORTINA_FADE_MS,
  DEFAULT_CORTINA_SECONDS,
  DEFAULT_GAP_SECONDS,
  END_EPSILON_MS,
  PROGRESS_TICK_MS,
  SPOTIFY_POLL_MS,
} from "./constants";
import {
  buildNextLabel,
  estimateRemainingMs,
  flattenTracksForItem,
  formatMs,
  nextPlayableQueueIndex,
  prevPlayableQueueIndex,
  resolveUpcoming,
  sleep,
} from "./queueHelpers";
import {
  evaluateLocalProgress,
  evaluateSpotifyPoll,
} from "./spotifyEndDetection";
import { VolumeControl } from "./volumeControl";
import type {
  NowPlayingInfo,
  PlaybackCursor,
  QueueControllerDeps,
  QueueControllerStatus,
} from "./types";

export type {
  NowPlayingInfo,
  PlaybackCursor,
  PlaybackProgress,
  QueueControllerDeps,
  QueueControllerStatus,
} from "./types";

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
  private progressTickTimer: ReturnType<typeof setInterval> | null = null;
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
  /** Device id we already set repeat=off for (once per device). */
  private repeatOffForDevice: string | null = null;
  private volume: VolumeControl;
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
  /** Wall-clock of last progress sync (poll or tick). */
  private lastProgressTickAt = 0;

  constructor(private deps: QueueControllerDeps) {
    this.volume = new VolumeControl(
      () => this.deps.getAccessToken(),
      () => this.deps.getDeviceId(),
      () => this.activeSource,
      this.local
    );
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

  private get fading() {
    return this.volume.fading;
  }

  private get baseVolume() {
    return this.volume.baseVolume;
  }

  private set baseVolume(v: number) {
    this.volume.baseVolume = v;
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
    const playable = nextPlayableQueueIndex(
      items,
      startAt.queueIndex,
      this.tandasById,
      this.tracksById
    );
    this.cursor = {
      queueIndex: playable >= 0 ? playable : startAt.queueIndex,
      trackIndex: playable >= 0 ? 0 : startAt.trackIndex,
    };
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
      await this.volume.applyVolume(clamped);
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

  getProgress(): { progressMs: number; durationMs: number } {
    const item = this.items[this.cursor.queueIndex];
    const track =
      this.playingOverride ??
      (item
        ? flattenTracksForItem(item, this.tandasById, this.tracksById)[
            this.cursor.trackIndex
          ]
        : undefined);
    const durationMs =
      item?.type === "cortina"
        ? Math.min(
            this.durationMs || this.cortinaSeconds * 1000,
            this.cortinaSeconds * 1000
          )
        : this.durationMs || track?.durationMs || 0;
    return { progressMs: this.progressMs, durationMs };
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

    const nextLabel = buildNextLabel(
      item,
      this.cursor.trackIndex,
      this.cursor.queueIndex,
      this.items,
      this.tandasById,
      this.tracksById
    );

    const upcoming = resolveUpcoming(
      item,
      this.cursor.trackIndex,
      this.cursor.queueIndex,
      this.items,
      this.tandasById,
      this.tracksById,
      this.cortinaSeconds
    );

    const { progressMs, durationMs } = this.getProgress();
    const remainingQueueMs = estimateRemainingMs(
      this.items,
      this.cursor.queueIndex,
      this.cursor.trackIndex,
      this.tandasById,
      this.tracksById,
      this.cortinaSeconds,
      progressMs,
      durationMs
    );

    return {
      track,
      source: track.source,
      usedFallback: this.usedFallback,
      queueItem: item,
      queueIndex: this.cursor.queueIndex,
      trackIndex: this.cursor.trackIndex,
      tanda,
      nextLabel,
      upcoming,
      remainingQueueMs,
      progressMs,
      durationMs,
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
    const playable = nextPlayableQueueIndex(
      this.items,
      queueIndex,
      this.tandasById,
      this.tracksById
    );
    if (playable < 0) return;
    this.clearGapTimer();
    this.stopEngines();
    this.cursor = {
      queueIndex: playable,
      trackIndex: playable === queueIndex ? trackIndex : 0,
    };
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
    if (queueIndex < 0 || queueIndex >= this.items.length) {
      // Try previous direction via prevPlayable when going backward past start
      return;
    }
    const forward = queueIndex >= this.cursor.queueIndex;
    const playable = forward
      ? nextPlayableQueueIndex(
          this.items,
          queueIndex,
          this.tandasById,
          this.tracksById
        )
      : prevPlayableQueueIndex(
          this.items,
          queueIndex,
          this.tandasById,
          this.tracksById
        );
    if (playable < 0) return;
    this.advancing = true;
    this.clearCortinaTimer();
    this.clearGapTimer();
    this.clearEndTimer();
    try {
      this.cursor = { queueIndex: playable, trackIndex: 0 };
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
      const nextQi = nextPlayableQueueIndex(
        this.items,
        this.cursor.queueIndex + 1,
        this.tandasById,
        this.tracksById
      );
      if (nextQi < 0) {
        this.stopEngines();
        this.status = "idle";
        this.notify();
        return;
      }
      this.cursor = {
        queueIndex: nextQi,
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
    this.volume.fading = false;
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
      await this.volume.applyVolume(this.baseVolume);
    } else {
      await this.volume.applyVolume(0);
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
    await this.volume.applyVolume(this.baseVolume);
    this.scheduleCortinaCutIfNeeded(item);
    void this.warmUpcoming();
  }

  /**
   * Warm the next local file into a paused Audio element, and prefetch Spotify art.
   * Never issues Connect play() — that would steal the active stream.
   */
  private async warmUpcoming(): Promise<void> {
    const item = this.items[this.cursor.queueIndex];
    if (!item) {
      this.local.clearWarm();
      return;
    }
    const upcoming = resolveUpcoming(
      item,
      this.cursor.trackIndex,
      this.cursor.queueIndex,
      this.items,
      this.tandasById,
      this.tracksById,
      this.cortinaSeconds
    );
    const track = upcoming?.track;
    if (!track) {
      this.local.clearWarm();
      return;
    }

    if (track.albumArtUrl && typeof Image !== "undefined") {
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = track.albumArtUrl;
      } catch {
        /* ignore */
      }
    }

    if (track.source === "local") {
      try {
        const file = await this.deps.resolveLocalFile(track);
        if (file) await this.local.warmFile(track.id, file);
        else this.local.clearWarm();
      } catch {
        this.local.clearWarm();
      }
      return;
    }

    // Spotify: URI is already known on the track; Connect cannot preload silently.
    this.local.clearWarm();
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
      await this.volume.runFade(fadeMs);
      await this.volume.applyVolume(0);
      await this.pauseEnginesQuietly();
      // Extra silence guard — Spotify sometimes buffers a few ms after pause
      await sleep(80);
      await this.volume.applyVolume(0);

      if (this.cursor.queueIndex + 1 >= this.items.length) {
        this.holdSilent = false;
        this.stopEngines();
        this.status = "idle";
        this.notify();
        return;
      }

      const nextQi = nextPlayableQueueIndex(
        this.items,
        this.cursor.queueIndex + 1,
        this.tandasById,
        this.tracksById
      );
      if (nextQi < 0) {
        this.holdSilent = false;
        this.stopEngines();
        this.status = "idle";
        this.notify();
        return;
      }

      this.cursor = {
        queueIndex: nextQi,
        trackIndex: 0,
      };
      // holdSilent stays true through play() so volume stays 0 until new URI
      await this.play();
    } finally {
      this.holdSilent = false;
      this.advancing = false;
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
    timeoutMs = 1000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const state = await getPlaybackState(token);
        if (state?.item?.uri === uri) return true;
      } catch {
        /* ignore */
      }
      await sleep(250);
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
    // Repeat off once per device — avoid a PUT on every track change.
    if (deviceId && deviceId !== this.repeatOffForDevice) {
      await setRepeatMode(token, "off", deviceId);
      this.repeatOffForDevice = deviceId;
    } else if (!deviceId && this.repeatOffForDevice !== "") {
      await setRepeatMode(token, "off", deviceId);
      this.repeatOffForDevice = "";
    }

    // Critical: when coming from cortina fade, keep device at 0 until URI switches
    await this.volume.ensureSpotifyVolume(startSilent ? 0 : this.baseVolume);
    await playUris(token, [track.spotifyUri], deviceId);

    this.activeSource = "spotify";
    this.expectedSpotifyUri = track.spotifyUri;
    this.liveAlbumArtUrl = track.albumArtUrl ?? null;
    this.playIssuedAt = Date.now();
    this.confirmedPlaying = false;
    this.stuckRetryDone = false;
    this.peakProgressMs = 0;
    this.prematureEndSince = null;
    this.lastProgressTickAt = Date.now();

    if (startSilent) {
      await this.waitForSpotifyUri(token, track.spotifyUri);
      // Still silent — volume restore happens in playTrack after this returns
      await this.volume.ensureSpotifyVolume(0);
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
    await this.local.playFile(file, track.id);
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
      const decision = evaluateLocalProgress({
        progressMs: this.progressMs,
        durationMs: this.durationMs,
        isCortina: item?.type === "cortina",
        cortinaSeconds: this.cortinaSeconds,
        fading: this.fading,
        hasEndTimer: !!this.endTimer,
      });

      if (decision.kind === "cortina_fade") {
        void this.finishCortinaWithFade();
        return;
      }
      if (decision.kind === "advance") {
        void this.onNaturalTrackEnd();
        return;
      }
      if (decision.kind === "schedule_end") {
        this.schedulePreciseEnd(decision.remainingMs);
      }
      this.notifyProgress();
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

          const result = evaluateSpotifyPoll({
            state,
            now: Date.now(),
            progressMs: this.progressMs,
            durationMs: this.durationMs,
            peakProgressMs: this.peakProgressMs,
            confirmedPlaying: this.confirmedPlaying,
            nearEndSeen: this.nearEndSeen,
            prematureEndSince: this.prematureEndSince,
            stuckRetryDone: this.stuckRetryDone,
            playIssuedAt: this.playIssuedAt,
            expectedSpotifyUri: this.expectedSpotifyUri,
            liveAlbumArtUrl: this.liveAlbumArtUrl,
            baseVolume: this.baseVolume,
            fading: this.fading,
            holdSilent: this.holdSilent,
            isCortina: item?.type === "cortina",
            cortinaSeconds: this.cortinaSeconds,
            hasEndTimer: !!this.endTimer,
          });

          const s = result.snapshot;
          this.progressMs = s.progressMs;
          this.durationMs = s.durationMs;
          this.peakProgressMs = s.peakProgressMs;
          this.confirmedPlaying = s.confirmedPlaying;
          this.nearEndSeen = s.nearEndSeen;
          this.prematureEndSince = s.prematureEndSince;
          this.stuckRetryDone = s.stuckRetryDone;
          this.playIssuedAt = s.playIssuedAt;
          this.liveAlbumArtUrl = s.liveAlbumArtUrl;
          if (s.learnedVolume != null) {
            this.baseVolume = s.learnedVolume;
            this.volume.lastSpotifyVolume = s.learnedVolume;
          }
          if (state) this.lastProgressTickAt = Date.now();

          if (result.clearEndTimer) this.clearEndTimer();
          if (result.scheduleEndMs != null) {
            this.schedulePreciseEnd(result.scheduleEndMs);
          }

          const action = result.action;
          if (action.kind === "advance") {
            await this.onNaturalTrackEnd();
            return;
          }
          if (action.kind === "cortina_fade") {
            this.clearCortinaTimer();
            await this.finishCortinaWithFade();
            return;
          }
          if (action.kind === "retry_play") {
            try {
              await playUris(token, [action.uri], deviceId);
            } catch (e) {
              const msg =
                e instanceof Error ? e.message : "Spotify play failed";
              this.error = msg;
              this.deps.onError?.(`${msg} — skipping unplayable track.`);
              this.clearEndTimer();
              await this.onNaturalTrackEnd();
            }
            return;
          }
          if (action.kind === "skip_unplayable") {
            this.deps.onError?.(action.message);
            this.clearEndTimer();
            await this.onNaturalTrackEnd();
            return;
          }

          if (action.structural) this.notify();
          else this.notifyProgress();
        } catch {
          /* ignore transient poll errors */
        }
      })();
    }, SPOTIFY_POLL_MS);

    this.startLocalProgressTick();
  }

  /**
   * Smooth progress UI between Spotify polls without extra API calls.
   * Also backs up near-end / cortina detection using wall-clock estimates.
   */
  private startLocalProgressTick() {
    this.stopLocalProgressTick();
    this.lastProgressTickAt = Date.now();
    this.progressTickTimer = setInterval(() => {
      if (
        this.activeSource !== "spotify" ||
        this.status !== "playing" ||
        this.fading ||
        this.advancing ||
        this.holdSilent ||
        !this.confirmedPlaying
      ) {
        this.lastProgressTickAt = Date.now();
        return;
      }

      const now = Date.now();
      const dt = now - this.lastProgressTickAt;
      this.lastProgressTickAt = now;
      if (dt <= 0 || dt > 2000) return;

      this.progressMs += dt;
      if (this.durationMs > 0 && this.progressMs > this.durationMs) {
        this.progressMs = this.durationMs;
      }
      if (this.progressMs > this.peakProgressMs) {
        this.peakProgressMs = this.progressMs;
      }

      const item = this.items[this.cursor.queueIndex];
      const decision = evaluateLocalProgress({
        progressMs: this.progressMs,
        durationMs: this.durationMs,
        isCortina: item?.type === "cortina",
        cortinaSeconds: this.cortinaSeconds,
        fading: this.fading,
        hasEndTimer: !!this.endTimer,
      });

      if (decision.kind === "cortina_fade") {
        this.clearCortinaTimer();
        void this.finishCortinaWithFade();
        return;
      }
      if (decision.kind === "advance") {
        void this.onNaturalTrackEnd();
        return;
      }
      if (decision.kind === "schedule_end") {
        this.nearEndSeen = true;
        this.schedulePreciseEnd(decision.remainingMs);
      }

      this.notifyProgress();
    }, PROGRESS_TICK_MS);
  }

  private stopLocalProgressTick() {
    if (this.progressTickTimer) {
      clearInterval(this.progressTickTimer);
      this.progressTickTimer = null;
    }
  }

  private stopSpotifyPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopLocalProgressTick();
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
    this.volume.fading = false;
    this.holdSilent = false;
    this.playIssuedAt = 0;
    this.confirmedPlaying = false;
    this.stuckRetryDone = false;
    this.peakProgressMs = 0;
    this.prematureEndSince = null;
    this.lastProgressTickAt = 0;
  }

  private notify() {
    this.deps.onChange?.();
    this.deps.onProgress?.();
  }

  private notifyProgress() {
    this.deps.onProgress?.();
  }
}
