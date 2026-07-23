"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DevicePicker } from "@/components/DevicePicker";
import { useLibrary } from "@/context/LibraryContext";
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

export default function DjPage() {
  const { events, tandas, tracks } = useLibrary();
  const {
    activeQueue,
    loadEventQueue,
    nowPlaying,
    status,
    error,
    play,
    togglePlayPause,
    skipTrack,
    previousTrack,
    nextQueueItem,
    previousQueueItem,
    jumpTo,
    seek,
    refreshDevices,
    cortinaSeconds,
    setCortinaSeconds,
    gapSeconds,
    setGapSeconds,
    volumePercent,
    setVolumePercent,
  } = usePlayback();

  const tandasById = useMemo(
    () => new Map(tandas.map((t) => [t.id, t])),
    [tandas]
  );
  const tracksById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t])),
    [tracks]
  );

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const queueLabel = (index: number) => {
    const item = activeQueue[index];
    if (!item) return "";
    if (item.type === "tanda") {
      return tandasById.get(item.tandaId ?? "")?.name ?? "Tanda";
    }
    return tracksById.get(item.trackId ?? "")?.name ?? "Cortina";
  };

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
    <AppShell>
      <div className="mb-3 flex justify-end">
        <Link href="/remote" className="text-sm text-accent hover:underline">
          Open phone remote →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="relative rounded border border-border bg-surface/60 p-5">
          {/* Album art — top-right, sized so timeline clears below it */}
          <div className="absolute right-5 top-5 aspect-square w-[120px] overflow-hidden rounded-md bg-black sm:w-[132px]">
            {albumArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={albumArt}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                No artwork
              </div>
            )}
          </div>

          {nowPlaying ? (
            <div className="animate-fade-up min-h-[132px] pr-[140px] sm:min-h-[144px] sm:pr-[152px]">
              <p className="mb-1 text-xs uppercase tracking-[0.2em] text-accent">
                Now playing · {nowPlaying.source}
                {nowPlaying.usedFallback ? " · local fallback" : ""}
              </p>

              <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
                {nowPlaying.track.name}
              </h2>

              <p className="mt-2 text-base text-muted">
                {nowPlaying.track.orchestra ||
                  nowPlaying.track.artists ||
                  "—"}
              </p>

              <div className="mt-2 space-y-0.5 pb-5 text-sm text-muted">
                {nowPlaying.tanda && (
                  <p>
                    Tanda: {nowPlaying.tanda.name} · track{" "}
                    {nowPlaying.trackIndex + 1}/
                    {nowPlaying.tanda.trackIds.length}
                  </p>
                )}
                {nowPlaying.queueItem.type === "cortina" && (
                  <p>
                    Cortina · cuts after {cortinaSeconds}s (fades last 6s)
                  </p>
                )}
                {nowPlaying.nextLabel && (
                  <p>Next: {nowPlaying.nextLabel}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-[132px] pr-[140px] sm:min-h-[144px] sm:pr-[152px]">
              <p className="text-xl text-muted">Nothing loaded.</p>
              <p className="mt-1 pb-5 text-sm text-muted">
                Build a queue in Events, or load a saved night below.
              </p>
            </div>
          )}

          {/* Timeline — clear of album art */}
          <div className="mt-2">
            <div className="flex items-center gap-3 text-xs text-muted tabular-nums">
              <span className="w-10 shrink-0">{formatMs(progressMs)}</span>
              <button
                type="button"
                onClick={onSeekClick}
                className="relative h-3 flex-1 cursor-pointer rounded-full bg-transparent p-0"
                aria-label="Seek"
                title="Click to seek"
              >
                <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-border">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-foreground transition-[width] duration-150"
                    style={{ width: `${progressPct}%` }}
                  />
                </span>
              </button>
              <span className="w-10 shrink-0 text-right">
                {formatMs(durationMs)}
              </span>
            </div>
          </div>

          {/* Status left · controls centered · volume right */}
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <p className="justify-self-start text-xs uppercase tracking-wide text-muted">
              Status: {status}
              {error ? ` · ${error}` : ""}
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void previousQueueItem()}
                className="text-muted transition hover:text-foreground"
                aria-label="Previous item"
                title="Previous tanda / cortina"
              >
                <SkipItemPrevIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void previousTrack()}
                className="text-muted transition hover:text-foreground"
                aria-label="Previous track"
                title="Previous song in current tanda"
              >
                <PrevIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void togglePlayPause()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition hover:scale-105"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <PauseIcon className="h-5 w-5" />
                ) : (
                  <PlayIcon className="ml-0.5 h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void skipTrack()}
                className="text-muted transition hover:text-foreground"
                aria-label="Next track"
                title="Next song (or cortina / next tanda at end)"
              >
                <NextIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void nextQueueItem()}
                className="text-muted transition hover:text-foreground"
                aria-label="Next item"
                title="Next tanda / cortina"
              >
                <SkipItemNextIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex w-full max-w-[180px] items-center justify-self-end gap-2">
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
                title={`Volume ${volume}%`}
              />
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {volume}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded border border-border bg-surface/40 p-4">
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
          <button
            type="button"
            onClick={() => void play()}
            className="mt-4 w-full rounded border border-border py-2 text-sm hover:border-accent"
          >
            Start / restart from cursor
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Active queue
          </h2>
          {activeQueue.length === 0 ? (
            <p className="text-sm text-muted">No active queue.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {activeQueue.map((item, index) => {
                const active = nowPlaying?.queueIndex === index;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void jumpTo(index)}
                      className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                        active
                          ? "bg-accent-soft text-accent"
                          : "bg-surface hover:bg-surface-2"
                      }`}
                    >
                      <span className="w-6 text-xs text-muted">{index + 1}</span>
                      <span className="flex-1 truncate">
                        {item.type === "cortina" ? "▸ " : ""}
                        {queueLabel(index)}
                      </span>
                      {active && (
                        <span className="animate-pulse-soft text-xs">●</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Load saved event
          </h2>
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => loadEventQueue(event.items)}
                  className="w-full rounded border border-border bg-surface/50 px-3 py-2 text-left text-sm hover:border-accent"
                >
                  <span className="font-medium">{event.name}</span>
                  <span className="ml-2 text-muted">
                    {event.items.length} items
                  </span>
                </button>
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-sm text-muted">
                Save an event first, or use{" "}
                <Link href="/events" className="text-accent hover:underline">
                  Events
                </Link>
                .
              </li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
