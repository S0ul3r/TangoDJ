"use client";

import { useEffect } from "react";
import Link from "next/link";
import { DevicePicker } from "@/components/DevicePicker";
import { PlaybackTimingSettings } from "@/components/playback/PlaybackTimingSettings";
import { SeekBar } from "@/components/playback/SeekBar";
import { TransportControls } from "@/components/playback/TransportControls";
import { UpcomingCard } from "@/components/playback/UpcomingCard";
import { VolumeIcon } from "@/components/playback/TransportIcons";
import { useSpotify } from "@/context/SpotifyContext";
import { usePlayback } from "@/context/PlaybackContext";

export default function RemotePage() {
  const { isAuthenticated } = useSpotify();
  const {
    nowPlaying,
    status,
    error,
    togglePlayPause,
    skipTrack,
    previousTrack,
    nextQueueItem,
    previousQueueItem,
    refreshDevices,
    cortinaSeconds,
    setCortinaSeconds,
    gapSeconds,
    setGapSeconds,
    volumePercent,
    setVolumePercent,
  } = usePlayback();

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">TangoDJ Remote</h1>
        <p className="text-muted">Sign in on this phone to control Connect.</p>
        <Link
          href="/login"
          className="rounded bg-accent px-5 py-3 text-sm font-semibold text-white"
        >
          Sign in with Spotify
        </Link>
      </div>
    );
  }

  const isPlaying = status === "playing";
  const albumArt = nowPlaying?.albumArtUrl;
  const volume = nowPlaying?.volumePercent ?? volumePercent;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />

      <header className="relative z-10 mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">TangoDJ</h1>
        <Link href="/dj" className="text-xs text-muted hover:text-accent">
          Full DJ
        </Link>
      </header>

      <div className="relative z-10 mb-4 rounded border border-border bg-surface/60 p-4">
        {nowPlaying ? (
          <div className="animate-fade-up flex gap-3">
            <div className="aspect-square w-20 shrink-0 overflow-hidden rounded-md bg-black">
              {albumArt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={albumArt}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
                  No art
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-accent">
                Now playing · {nowPlaying.source}
                {nowPlaying.usedFallback ? " · local fallback" : ""}
              </p>
              <h2 className="truncate text-xl font-semibold leading-tight">
                {nowPlaying.track.name}
              </h2>
              <p className="mt-1 truncate text-sm text-muted">
                {nowPlaying.track.orchestra ||
                  nowPlaying.track.artists ||
                  "—"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted">
                {nowPlaying.tanda && (
                  <span>
                    Tanda: {nowPlaying.tanda.name} ·{" "}
                    {nowPlaying.trackIndex + 1}/
                    {nowPlaying.tanda.trackIds.length}
                  </span>
                )}
                {nowPlaying.queueItem.type === "cortina" && (
                  <span>Cortina · cuts after {cortinaSeconds}s</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-base font-medium">No active playback</p>
            <p className="mt-0.5 text-xs text-muted">
              Load a queue on the desktop DJ view first.
            </p>
          </div>
        )}

        <div className="mt-3">
          <UpcomingCard upcoming={nowPlaying?.upcoming} />
        </div>

        <div className="mt-3">
          <SeekBar timeWidthClass="w-9" className="gap-2" />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <p className="text-center text-[11px] uppercase tracking-wide text-muted">
            Status: {status}
            {error ? ` · ${error}` : ""}
          </p>

          <TransportControls
            size="lg"
            className="gap-4"
            isPlaying={isPlaying}
            onPreviousQueueItem={() => void previousQueueItem()}
            onPreviousTrack={() => void previousTrack()}
            onTogglePlayPause={() => void togglePlayPause()}
            onNextTrack={() => void skipTrack()}
            onNextQueueItem={() => void nextQueueItem()}
          />

          <div className="flex items-center gap-2 px-1">
            <VolumeIcon className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => void setVolumePercent(Number(e.target.value))}
              className="h-1 w-full accent-[var(--accent)]"
              aria-label="Volume"
            />
            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">
              {volume}
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-10 rounded border border-border bg-surface/40 p-4">
        <DevicePicker />
        <PlaybackTimingSettings
          cortinaSeconds={cortinaSeconds}
          setCortinaSeconds={setCortinaSeconds}
          gapSeconds={gapSeconds}
          setGapSeconds={setGapSeconds}
        />
      </div>
    </div>
  );
}
