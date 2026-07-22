/**
 * Unified night-queue playback controller.
 * Dispatches to Spotify Connect or local HTML5 audio per track.
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
  skipToNext,
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
  /** True when we fell back from Spotify to a local file */
  usedFallback?: boolean;
  queueItem: EventQueueItem;
  queueIndex: number;
  trackIndex: number;
  tanda?: Tanda | null;
  nextLabel?: string | null;
}

export interface QueueControllerDeps {
  getAccessToken: () => Promise<string | null>;
  getDeviceId: () => string | null;
  /** Resolve a local track to a File/Blob for HTML5 audio */
  resolveLocalFile: (track: Track) => Promise<File | Blob | null>;
  onChange?: () => void;
  onError?: (message: string) => void;
}

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
  private spotifyUriIndex = 0;
  private currentSpotifyUris: string[] = [];
  private playingOverride: Track | null = null;
  private usedFallback = false;
  private advancing = false;

  constructor(private deps: QueueControllerDeps) {
    this.local.setEndedHandler(() => {
      void this.advanceTrack();
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
    this.notify();
  }

  /** Refresh tanda/track maps without interrupting playback. */
  updateLibrary(tandas: Tanda[], tracks: Track[]) {
    this.tandasById = new Map(tandas.map((t) => [t.id, t]));
    this.tracksById = new Map(tracks.map((t) => [t.id, t]));
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
      if (nextItem?.type === "cortina") nextLabel = "Cortina";
      else if (nextItem?.type === "tanda" && nextItem.tandaId) {
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
    if (this.activeSource === "local") {
      this.local.pause();
    } else if (this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) await pausePlayback(token, this.deps.getDeviceId());
    }
    this.status = "paused";
    this.notify();
  }

  async resume(): Promise<void> {
    if (this.activeSource === "local") {
      await this.local.resume();
    } else if (this.activeSource === "spotify") {
      const token = await this.deps.getAccessToken();
      if (token) await resumePlayback(token, this.deps.getDeviceId());
    }
    this.status = "playing";
    this.notify();
  }

  async togglePlayPause(): Promise<void> {
    if (this.status === "playing") await this.pause();
    else if (this.status === "paused") await this.resume();
    else await this.play();
  }

  /** Skip current track within tanda / cortina, or advance queue. */
  async skipTrack(): Promise<void> {
    if (this.activeSource === "spotify" && this.currentSpotifyUris.length > 1) {
      const token = await this.deps.getAccessToken();
      if (token) {
        try {
          await skipToNext(token, this.deps.getDeviceId());
          this.cursor.trackIndex += 1;
          this.spotifyUriIndex += 1;
          if (this.cursor.trackIndex >= this.currentSpotifyUris.length) {
            await this.advanceQueueItem();
          } else {
            this.notify();
          }
          return;
        } catch {
          // fall through to controller advance
        }
      }
    }
    await this.advanceTrack();
  }

  /** Jump to next queue item (next tanda or cortina). */
  async nextQueueItem(): Promise<void> {
    await this.advanceQueueItem();
  }

  async jumpTo(queueIndex: number, trackIndex = 0): Promise<void> {
    this.stopEngines();
    this.cursor = { queueIndex, trackIndex };
    await this.play();
  }

  destroy() {
    this.stopEngines();
    this.local.setEndedHandler(null);
    this.local.setErrorHandler(null);
  }

  private async advanceTrack(): Promise<void> {
    const item = this.items[this.cursor.queueIndex];
    if (!item) {
      this.status = "idle";
      this.notify();
      return;
    }
    const tracks = flattenTracksForItem(item, this.tandasById, this.tracksById);
    if (this.cursor.trackIndex + 1 < tracks.length) {
      this.cursor.trackIndex += 1;
      await this.play();
      return;
    }
    await this.advanceQueueItem();
  }

  private async advanceQueueItem(): Promise<void> {
    if (this.cursor.queueIndex + 1 >= this.items.length) {
      this.stopEngines();
      this.status = "idle";
      this.notify();
      return;
    }
    this.cursor = {
      queueIndex: this.cursor.queueIndex + 1,
      trackIndex: 0,
    };
    await this.play();
  }

  private async playTrack(track: Track, item: EventQueueItem): Promise<void> {
    this.playingOverride = null;
    this.usedFallback = false;

    // Switch engines cleanly
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

    if (track.source === "spotify") {
      try {
        await this.playSpotify(item);
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
        await this.playLocal(fallback);
      }
    } else {
      await this.playLocal(track);
    }
  }

  private async playSpotify(item: EventQueueItem): Promise<void> {
    const tracks = flattenTracksForItem(item, this.tandasById, this.tracksById);
    const from = this.cursor.trackIndex;
    const slice = tracks.slice(from);
    const uris = slice
      .filter((t) => t.source === "spotify" && t.spotifyUri)
      .map((t) => t.spotifyUri!);

    // If mixed sources inside tanda, play only contiguous Spotify uris from cursor
    const contiguous: string[] = [];
    for (const t of slice) {
      if (t.source === "spotify" && t.spotifyUri) contiguous.push(t.spotifyUri);
      else break;
    }

    const playList = contiguous.length ? contiguous : uris.slice(0, 1);
    if (playList.length === 0) {
      throw new Error(`No Spotify URI for "${tracks[from]?.name ?? "track"}".`);
    }

    const token = await this.deps.getAccessToken();
    if (!token) throw new Error("Not signed in to Spotify.");

    await playUris(token, playList, this.deps.getDeviceId());
    this.activeSource = "spotify";
    this.currentSpotifyUris = playList;
    this.spotifyUriIndex = 0;
    this.startSpotifyPoll();
  }

  private async playLocal(track: Track): Promise<void> {
    const file = await this.deps.resolveLocalFile(track);
    if (!file) {
      throw new Error(
        `Local file not available for "${track.name}". Re-link your music folder.`
      );
    }
    this.stopSpotifyPoll();
    this.activeSource = "local";
    this.currentSpotifyUris = [];
    await this.local.playFile(file);
  }

  private startSpotifyPoll() {
    this.stopSpotifyPoll();
    let lastUri: string | null = null;
    let sawPlaying = false;
    let nearEndTicks = 0;

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
          if (!state) return;

          const uri = state.item?.uri ?? null;
          const progress = state.progress_ms ?? 0;
          const duration = state.item?.duration_ms ?? 0;

          if (state.is_playing) sawPlaying = true;

          if (uri && lastUri && uri !== lastUri) {
            const idx = this.currentSpotifyUris.indexOf(uri);
            if (idx >= 0) {
              this.cursor.trackIndex += idx - this.spotifyUriIndex;
              this.spotifyUriIndex = idx;
              nearEndTicks = 0;
              this.notify();
            }
          }
          if (uri) lastUri = uri;

          const nearEnd =
            duration > 0 && progress > 0 && duration - progress < 2500;
          if (nearEnd && state.is_playing) nearEndTicks += 1;
          else if (!nearEnd) nearEndTicks = 0;

          const finished =
            (sawPlaying && !state.is_playing && nearEnd) ||
            nearEndTicks >= 2 ||
            (sawPlaying &&
              !state.is_playing &&
              duration > 0 &&
              progress >= duration - 1500);

          if (!finished) return;

          this.advancing = true;
          try {
            const atBatchEnd =
              this.spotifyUriIndex >= this.currentSpotifyUris.length - 1;
            if (atBatchEnd) {
              await this.advanceTrack();
            } else {
              this.cursor.trackIndex += 1;
              this.spotifyUriIndex += 1;
              nearEndTicks = 0;
              sawPlaying = false;
              this.notify();
            }
          } finally {
            this.advancing = false;
          }
        } catch {
          /* ignore transient poll errors */
        }
      })();
    }, 2000);
  }

  private stopSpotifyPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private stopEngines() {
    this.local.stop();
    this.stopSpotifyPoll();
    this.activeSource = null;
    this.currentSpotifyUris = [];
    this.playingOverride = null;
    this.usedFallback = false;
  }

  private notify() {
    this.deps.onChange?.();
  }
}
