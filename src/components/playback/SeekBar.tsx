"use client";

import { usePlayback, usePlaybackProgress } from "@/context/PlaybackContext";
import { formatMs } from "@/lib/playback/queueHelpers";

interface SeekBarProps {
  timeWidthClass?: string;
  className?: string;
}

/** Isolated seek bar — re-renders on progress ticks without updating the DJ page tree. */
export function SeekBar({
  timeWidthClass = "w-10",
  className = "",
}: SeekBarProps) {
  const { seek } = usePlayback();
  const { progressMs, durationMs } = usePlaybackProgress();
  const progressPct =
    durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;

  const onSeekClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    void seek(ratio * durationMs);
  };

  return (
    <div
      className={`flex items-center gap-3 text-xs text-muted tabular-nums ${className}`.trim()}
    >
      <span className={`${timeWidthClass} shrink-0`}>
        {formatMs(progressMs)}
      </span>
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
      <span className={`${timeWidthClass} shrink-0 text-right`}>
        {formatMs(durationMs)}
      </span>
    </div>
  );
}
