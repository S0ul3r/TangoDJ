"use client";

import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  SkipItemNextIcon,
  SkipItemPrevIcon,
} from "@/components/playback/TransportIcons";

interface TransportControlsProps {
  isPlaying: boolean;
  onPreviousQueueItem: () => void;
  onPreviousTrack: () => void;
  onTogglePlayPause: () => void;
  onNextTrack: () => void;
  onNextQueueItem: () => void;
  size?: "sm" | "lg";
  className?: string;
}

export function TransportControls({
  isPlaying,
  onPreviousQueueItem,
  onPreviousTrack,
  onTogglePlayPause,
  onNextTrack,
  onNextQueueItem,
  size = "sm",
  className = "",
}: TransportControlsProps) {
  const icon = size === "lg" ? "h-6 w-6" : "h-5 w-5";
  const playBtn =
    size === "lg"
      ? "flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95"
      : "flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition hover:scale-105";
  const sideBtn =
    size === "lg"
      ? "text-muted transition active:scale-95 hover:text-foreground"
      : "text-muted transition hover:text-foreground";

  return (
    <div className={`flex items-center justify-center gap-3 ${className}`.trim()}>
      <button
        type="button"
        onClick={onPreviousQueueItem}
        className={sideBtn}
        aria-label="Previous item"
        title="Previous tanda / cortina"
      >
        <SkipItemPrevIcon className={icon} />
      </button>
      <button
        type="button"
        onClick={onPreviousTrack}
        className={sideBtn}
        aria-label="Previous track"
        title="Previous song in current tanda"
      >
        <PrevIcon className={icon} />
      </button>
      <button
        type="button"
        onClick={onTogglePlayPause}
        className={playBtn}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <PauseIcon className={icon} />
        ) : (
          <PlayIcon className={`ml-0.5 ${icon}`} />
        )}
      </button>
      <button
        type="button"
        onClick={onNextTrack}
        className={sideBtn}
        aria-label="Next track"
        title="Next song (or cortina / next tanda at end)"
      >
        <NextIcon className={icon} />
      </button>
      <button
        type="button"
        onClick={onNextQueueItem}
        className={sideBtn}
        aria-label="Next item"
        title="Next tanda / cortina"
      >
        <SkipItemNextIcon className={icon} />
      </button>
    </div>
  );
}
