"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DevicePicker } from "@/components/DevicePicker";
import { KeyboardShortcutsHint } from "@/components/playback/KeyboardShortcutsHint";
import { PlaybackTimingSettings } from "@/components/playback/PlaybackTimingSettings";
import { SeekBar } from "@/components/playback/SeekBar";
import { TransportControls } from "@/components/playback/TransportControls";
import { UpcomingCard } from "@/components/playback/UpcomingCard";
import { VolumeIcon } from "@/components/playback/TransportIcons";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayback } from "@/context/PlaybackContext";
import { useDjKeyboardShortcuts } from "@/hooks/useDjKeyboardShortcuts";
import { formatDurationLong } from "@/lib/playback/queueHelpers";

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

  const keyboardHandlers = useMemo(
    () => ({
      togglePlayPause: () => void togglePlayPause(),
      skipTrack: () => void skipTrack(),
      previousTrack: () => void previousTrack(),
      nextQueueItem: () => void nextQueueItem(),
      previousQueueItem: () => void previousQueueItem(),
    }),
    [
      togglePlayPause,
      skipTrack,
      previousTrack,
      nextQueueItem,
      previousQueueItem,
    ]
  );
  useDjKeyboardShortcuts(keyboardHandlers);

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
  const albumArt = nowPlaying?.albumArtUrl;
  const volume = nowPlaying?.volumePercent ?? volumePercent;
  const remainingLabel =
    nowPlaying?.remainingQueueMs != null && nowPlaying.remainingQueueMs > 0
      ? formatDurationLong(nowPlaying.remainingQueueMs)
      : null;

  return (
    <AppShell>
      <div className="mb-3 flex justify-end">
        <Link href="/remote" className="text-sm text-accent hover:underline">
          Open phone remote →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="rounded border border-border bg-surface/60 p-4 sm:p-5">
          {nowPlaying ? (
            <div className="animate-fade-up flex gap-4">
              <div className="aspect-square w-28 shrink-0 overflow-hidden rounded-md bg-black sm:w-32">
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
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-accent">
                  Now playing · {nowPlaying.source}
                  {nowPlaying.usedFallback ? " · local fallback" : ""}
                </p>

                <h2 className="truncate text-2xl font-semibold leading-tight sm:text-3xl">
                  {nowPlaying.track.name}
                </h2>

                <p className="mt-1 truncate text-sm text-muted">
                  {nowPlaying.track.orchestra ||
                    nowPlaying.track.artists ||
                    "—"}
                </p>

                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {nowPlaying.tanda && (
                    <span>
                      Tanda: {nowPlaying.tanda.name} · track{" "}
                      {nowPlaying.trackIndex + 1}/
                      {nowPlaying.tanda.trackIds.length}
                    </span>
                  )}
                  {nowPlaying.queueItem.type === "cortina" && (
                    <span>
                      Cortina · cuts after {cortinaSeconds}s (fades last 6s)
                    </span>
                  )}
                  {remainingLabel && (
                    <span>Night remaining ≈ {remainingLabel}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-medium text-foreground">
                  Nothing in the booth yet
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Load a saved event below, or build a queue in Events.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {events.slice(0, 2).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => loadEventQueue(event.items)}
                    className="rounded border border-accent/50 bg-accent-soft px-3 py-1.5 text-sm text-accent hover:border-accent"
                  >
                    Load {event.name}
                  </button>
                ))}
                <Link
                  href="/events"
                  className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
                >
                  Open Events →
                </Link>
              </div>
            </div>
          )}

          <div className="mt-4">
            <SeekBar />
          </div>

          <div className="mt-3 grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <p className="justify-self-start text-xs uppercase tracking-wide text-muted sm:order-1">
              Status: {status}
              {error ? ` · ${error}` : ""}
            </p>

            <TransportControls
              className="sm:order-2"
              isPlaying={isPlaying}
              onPreviousQueueItem={() => void previousQueueItem()}
              onPreviousTrack={() => void previousTrack()}
              onTogglePlayPause={() => void togglePlayPause()}
              onNextTrack={() => void skipTrack()}
              onNextQueueItem={() => void nextQueueItem()}
            />

            <div className="flex w-full max-w-[180px] items-center gap-2 sm:order-3 sm:justify-self-end">
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

          <KeyboardShortcutsHint className="mt-3 border-t border-border/60 pt-3" />
        </div>

        <div className="space-y-3">
          <UpcomingCard upcoming={nowPlaying?.upcoming} />
          <div className="rounded border border-border bg-surface/40 p-4">
            <DevicePicker />
            <PlaybackTimingSettings
              cortinaSeconds={cortinaSeconds}
              setCortinaSeconds={setCortinaSeconds}
              gapSeconds={gapSeconds}
              setGapSeconds={setGapSeconds}
            />
            <button
              type="button"
              onClick={() => void play()}
              className="mt-4 w-full rounded border border-border py-2 text-sm hover:border-accent"
            >
              Start / restart from cursor
            </button>
          </div>
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
