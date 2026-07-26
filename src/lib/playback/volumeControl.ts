/**
 * Volume application + cortina fade helpers for Connect / local engines.
 */

import { setPlaybackVolume } from "./spotifyConnect";
import { CORTINA_FADE_STEPS } from "./constants";
import { sleep } from "./queueHelpers";
import type { LocalAudioPlayer } from "./localAudio";
import type { TrackSource } from "@/types/domain";

export class VolumeControl {
  baseVolume = 100;
  /** Last volume percent successfully sent to Spotify (skip redundant PUTs). */
  lastSpotifyVolume: number | null = null;
  /** Device id last used for volume (invalidate cache on device switch). */
  lastVolumeDeviceId: string | null = null;
  fading = false;

  constructor(
    private getAccessToken: () => Promise<string | null>,
    private getDeviceId: () => string | null,
    private getActiveSource: () => TrackSource | null,
    private local: LocalAudioPlayer
  ) {}

  async applyVolume(percent: number): Promise<void> {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    const source = this.getActiveSource();
    if (source === "local" || !source) {
      this.local.setVolume(clamped / 100);
    }
    if (source === "spotify") {
      await this.ensureSpotifyVolume(clamped);
    }
  }

  /** Skip Spotify volume PUTs when the device already has this level. */
  async ensureSpotifyVolume(percent: number): Promise<void> {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    const deviceId = this.getDeviceId();
    if (deviceId !== this.lastVolumeDeviceId) {
      this.lastSpotifyVolume = null;
      this.lastVolumeDeviceId = deviceId;
    }
    if (this.lastSpotifyVolume === clamped) return;
    const token = await this.getAccessToken();
    if (!token) return;
    try {
      await setPlaybackVolume(token, clamped, deviceId);
      this.lastSpotifyVolume = clamped;
    } catch {
      /* ignore volume errors (incl. rate limit) — don't block playback */
    }
  }

  async runFade(durationMs: number): Promise<void> {
    if (this.fading) return;
    this.fading = true;
    const from = this.baseVolume;
    const ms = Math.max(400, durationMs);
    const steps = CORTINA_FADE_STEPS;
    const stepMs = Math.max(80, Math.floor(ms / steps));
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
}
