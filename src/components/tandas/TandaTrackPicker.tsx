"use client";

import type { Track } from "@/types/domain";

interface TandaTrackPickerProps {
  tracks: Track[];
  selectedIds: string[];
  filter: string;
  onFilterChange: (value: string) => void;
  onToggle: (id: string) => void;
  genreLabel: string;
}

export function TandaTrackPicker({
  tracks,
  selectedIds,
  filter,
  onFilterChange,
  onToggle,
  genreLabel,
}: TandaTrackPickerProps) {
  return (
    <div>
      <input
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={`Filter ${genreLabel} library…`}
        className="mb-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <ul className="space-y-1">
        {tracks.map((t) => {
          const on = selectedIds.includes(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onToggle(t.id)}
                className={`flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm ${
                  on ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
                }`}
              >
                <span className="mt-0.5 text-xs">{on ? "✓" : "+"}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {t.orchestra || t.artists || t.source}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {tracks.length === 0 && (
          <li className="text-sm text-muted">
            No tracks in this genre yet — import a playlist in Library.
          </li>
        )}
      </ul>
    </div>
  );
}
