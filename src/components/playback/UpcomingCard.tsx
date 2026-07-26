"use client";

import type { UpcomingInfo } from "@/lib/playback/queueHelpers";
import { formatMs } from "@/lib/playback/queueHelpers";

const KIND_LABEL: Record<UpcomingInfo["kind"], string> = {
  song: "Up next",
  cortina: "Next cortina",
  tanda: "Next tanda",
};

export function UpcomingCard({
  upcoming,
}: {
  upcoming: UpcomingInfo | null | undefined;
}) {
  if (!upcoming) {
    return (
      <div className="rounded border border-border/70 bg-surface/30 p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
          Up next
        </p>
        <p className="mt-1 text-sm text-muted">End of queue</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded border border-border/70 bg-surface/30 p-3">
      <div className="aspect-square w-14 shrink-0 overflow-hidden rounded bg-black sm:w-16">
        {upcoming.albumArtUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={upcoming.albumArtUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] text-muted">
            —
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
          {KIND_LABEL[upcoming.kind]}
          {upcoming.source ? ` · ${upcoming.source}` : ""}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium leading-snug">
          {upcoming.title}
        </p>
        <p className="truncate text-xs text-muted">{upcoming.subtitle}</p>
        {upcoming.durationMs > 0 && (
          <p className="mt-1 text-[11px] tabular-nums text-muted">
            {formatMs(upcoming.durationMs)}
          </p>
        )}
      </div>
    </div>
  );
}
