"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DevicePicker } from "@/components/DevicePicker";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayback } from "@/context/PlaybackContext";

export default function DjPage() {
  const { events, tandas, tracks } = useLibrary();
  const {
    activeQueue,
    loadEventQueue,
    nowPlaying,
    status,
    error,
    play,
    pause,
    resume,
    togglePlayPause,
    skipTrack,
    nextQueueItem,
    jumpTo,
    refreshDevices,
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

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">DJ View</h1>
          <p className="mt-1 text-muted">
            Drive the night on Spotify Connect or local files.
          </p>
        </div>
        <Link href="/remote" className="text-sm text-accent hover:underline">
          Open phone remote →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded border border-border bg-surface/60 p-6">
          {nowPlaying ? (
            <div className="animate-fade-up">
              <p className="mb-1 text-xs uppercase tracking-[0.2em] text-accent">
                Now playing · {nowPlaying.source}
                {nowPlaying.usedFallback ? " · local fallback" : ""}
              </p>
              <h2 className="text-3xl font-semibold sm:text-4xl">
                {nowPlaying.track.name}
              </h2>
              <p className="mt-2 text-lg text-muted">
                {nowPlaying.track.orchestra ||
                  nowPlaying.track.artists ||
                  "—"}
              </p>
              {nowPlaying.tanda && (
                <p className="mt-3 text-sm text-muted">
                  Tanda: {nowPlaying.tanda.name} · track{" "}
                  {nowPlaying.trackIndex + 1}/
                  {nowPlaying.tanda.trackIds.length}
                </p>
              )}
              {nowPlaying.nextLabel && (
                <p className="mt-1 text-sm text-muted">
                  Next: {nowPlaying.nextLabel}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xl text-muted">Nothing loaded.</p>
              <p className="mt-2 text-sm text-muted">
                Build a queue in Events, or load a saved night below.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void togglePlayPause()}
              className="min-w-[120px] rounded bg-accent px-6 py-3 text-base font-semibold text-white hover:bg-accent-hover"
            >
              {status === "playing" ? "Pause" : status === "paused" ? "Resume" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => void skipTrack()}
              className="rounded border border-border px-5 py-3 text-sm hover:border-accent"
            >
              Skip track
            </button>
            <button
              type="button"
              onClick={() => void nextQueueItem()}
              className="rounded border border-border px-5 py-3 text-sm hover:border-accent"
            >
              Next item
            </button>
            {status === "paused" && (
              <button
                type="button"
                onClick={() => void resume()}
                className="text-sm text-muted hover:text-foreground"
              >
                Resume
              </button>
            )}
            {status === "playing" && (
              <button
                type="button"
                onClick={() => void pause()}
                className="text-sm text-muted hover:text-foreground"
              >
                Pause
              </button>
            )}
          </div>

          <p className="mt-3 text-xs uppercase tracking-wide text-muted">
            Status: {status}
            {error ? ` · ${error}` : ""}
          </p>
        </div>

        <div className="rounded border border-border bg-surface/40 p-4">
          <DevicePicker />
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
