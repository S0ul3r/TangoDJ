"use client";

interface PlaybackTimingSettingsProps {
  cortinaSeconds: number;
  setCortinaSeconds: (seconds: number) => void;
  gapSeconds: number;
  setGapSeconds: (seconds: number) => void;
}

export function PlaybackTimingSettings({
  cortinaSeconds,
  setCortinaSeconds,
  gapSeconds,
  setGapSeconds,
}: PlaybackTimingSettingsProps) {
  return (
    <>
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
    </>
  );
}
