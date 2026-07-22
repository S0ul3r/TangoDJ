"use client";

import { useEffect } from "react";
import Link from "next/link";
import { DevicePicker } from "@/components/DevicePicker";
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
    nextQueueItem,
    refreshDevices,
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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />

      <header className="relative z-10 mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">TangoDJ</h1>
        <Link href="/dj" className="text-xs text-muted hover:text-accent">
          Full DJ
        </Link>
      </header>

      <div className="mb-8 flex-1">
        {nowPlaying ? (
          <div className="animate-fade-up">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-accent">
              {nowPlaying.source} · {status}
            </p>
            <h2 className="text-3xl font-semibold leading-tight">
              {nowPlaying.track.name}
            </h2>
            <p className="mt-3 text-base text-muted">
              {nowPlaying.track.orchestra || nowPlaying.track.artists || "—"}
            </p>
            {nowPlaying.tanda && (
              <p className="mt-4 text-sm text-muted">
                {nowPlaying.tanda.name} · {nowPlaying.trackIndex + 1}/
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
            <p className="text-xl text-muted">No active playback</p>
            <p className="mt-2 text-sm text-muted">
              Load a queue on the desktop DJ view first.
            </p>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-bad">{error}</p>}
      </div>

      <div className="mb-6">
        <DevicePicker compact />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => void togglePlayPause()}
          className="rounded bg-accent py-5 text-lg font-semibold text-white active:scale-[0.98] hover:bg-accent-hover"
        >
          {status === "playing" ? "Pause" : "Play"}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void skipTrack()}
            className="rounded border border-border bg-surface py-4 text-base active:scale-[0.98] hover:border-accent"
          >
            Skip track
          </button>
          <button
            type="button"
            onClick={() => void nextQueueItem()}
            className="rounded border border-border bg-surface py-4 text-base active:scale-[0.98] hover:border-accent"
          >
            Next tanda / cortina
          </button>
        </div>
      </div>
    </div>
  );
}
