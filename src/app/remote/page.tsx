"use client";

import { useEffect } from "react";
import Link from "next/link";
import { DevicePicker } from "@/components/DevicePicker";
import { useSpotify } from "@/context/SpotifyContext";
import { usePlayback } from "@/context/PlaybackContext";
import { formatMs } from "@/lib/playback/queueController";

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function PrevIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function NextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
    </svg>
  );
}

function SkipItemPrevIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 18V6l-8.5 6L11 18zm.5-6 8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function SkipItemNextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 6v12l8.5-6L3 6zm9.5 0v12L21 12l-8.5-6z" />
    </svg>
  );
}

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 9v6h4l5 5V4L9 9H5zm11.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  );
}

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
    seek,
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
  const progressMs = nowPlaying?.progressMs ?? 0;
  const durationMs = nowPlaying?.durationMs ?? 0;
  const progressPct =
    durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;
  const albumArt = nowPlaying?.albumArtUrl;
  const volume = nowPlaying?.volumePercent ?? volumePercent;

  const onSeekClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    void seek(ratio * durationMs);
  };

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
        <div className="absolute right-4 top-4 aspect-square w-[88px] overflow-hidden rounded-md bg-black">
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

        {nowPlaying ? (
          <div className="animate-fade-up min-h-[96px] pr-[100px]">
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-accent">
              Now playing · {nowPlaying.source}
              {nowPlaying.usedFallback ? " · local fallback" : ""}
            </p>
            <h2 className="text-2xl font-semibold leading-tight">
              {nowPlaying.track.name}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {nowPlaying.track.orchestra ||
                nowPlaying.track.artists ||
                "—"}
            </p>
            <div className="mt-2 space-y-0.5 pb-3 text-xs text-muted">
              {nowPlaying.tanda && (
                <p>
                  Tanda: {nowPlaying.tanda.name} · track{" "}
                  {nowPlaying.trackIndex + 1}/
                  {nowPlaying.tanda.trackIds.length}
                </p>
              )}
              {nowPlaying.queueItem.type === "cortina" && (
                <p>Cortina · cuts after {cortinaSeconds}s</p>
              )}
              {nowPlaying.nextLabel && <p>Next: {nowPlaying.nextLabel}</p>}
            </div>
          </div>
        ) : (
          <div className="min-h-[96px] pr-[100px]">
            <p className="text-lg text-muted">No active playback</p>
            <p className="mt-1 pb-3 text-xs text-muted">
              Load a queue on the desktop DJ view first.
            </p>
          </div>
        )}

        <div className="mt-1">
          <div className="flex items-center gap-2 text-xs text-muted tabular-nums">
            <span className="w-9 shrink-0">{formatMs(progressMs)}</span>
            <button
              type="button"
              onClick={onSeekClick}
              className="relative h-3 flex-1 cursor-pointer rounded-full bg-transparent p-0"
              aria-label="Seek"
            >
              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-border">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-foreground transition-[width] duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </span>
            </button>
            <span className="w-9 shrink-0 text-right">
              {formatMs(durationMs)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <p className="text-center text-[11px] uppercase tracking-wide text-muted">
            Status: {status}
            {error ? ` · ${error}` : ""}
          </p>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => void previousQueueItem()}
              className="text-muted transition active:scale-95 hover:text-foreground"
              aria-label="Previous item"
              title="Previous tanda / cortina"
            >
              <SkipItemPrevIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => void previousTrack()}
              className="text-muted transition active:scale-95 hover:text-foreground"
              aria-label="Previous track"
            >
              <PrevIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => void togglePlayPause()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <PauseIcon className="h-6 w-6" />
              ) : (
                <PlayIcon className="ml-0.5 h-6 w-6" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void skipTrack()}
              className="text-muted transition active:scale-95 hover:text-foreground"
              aria-label="Next track"
            >
              <NextIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => void nextQueueItem()}
              className="text-muted transition active:scale-95 hover:text-foreground"
              aria-label="Next item"
              title="Next tanda / cortina"
            >
              <SkipItemNextIcon className="h-6 w-6" />
            </button>
          </div>

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
        <label className="mt-4 block text-xs text-muted">
          Cortina length: {cortinaSeconds}s
        </label>
        <input
          type="range"
          min={10}
          max={200}
          step={5}
          value={cortinaSeconds}
          onChange={(e) => setCortinaSeconds(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--accent)]"
        />
        <label className="mt-4 block text-xs text-muted">
          Silence between songs: {gapSeconds}s
        </label>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={gapSeconds}
          onChange={(e) => setGapSeconds(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--accent)]"
        />
        <p className="mt-1 text-[11px] text-muted">
          Applies between tanda tracks. Cortina → tanda fades with no gap.
        </p>
      </div>
    </div>
  );
}
