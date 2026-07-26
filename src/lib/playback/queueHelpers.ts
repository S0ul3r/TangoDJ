import type {
  EventQueueItem,
  Tanda,
  Track,
  TrackSource,
} from "@/types/domain";

export function flattenTracksForItem(
  item: EventQueueItem,
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): Track[] {
  if (item.type === "marker") return [];
  if (item.type === "cortina") {
    const t = item.trackId ? tracksById.get(item.trackId) : undefined;
    return t ? [t] : [];
  }
  const tanda = item.tandaId ? tandasById.get(item.tandaId) : undefined;
  if (!tanda) return [];
  return tanda.trackIds
    .map((id) => tracksById.get(id))
    .filter((t): t is Track => !!t);
}

/** First queue index at or after `from` that has playable tracks. */
export function nextPlayableQueueIndex(
  items: EventQueueItem[],
  from: number,
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): number {
  for (let i = Math.max(0, from); i < items.length; i++) {
    if (flattenTracksForItem(items[i], tandasById, tracksById).length > 0) {
      return i;
    }
  }
  return -1;
}

/** Previous playable queue index at or before `from`. */
export function prevPlayableQueueIndex(
  items: EventQueueItem[],
  from: number,
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): number {
  for (let i = Math.min(items.length - 1, from); i >= 0; i--) {
    if (flattenTracksForItem(items[i], tandasById, tracksById).length > 0) {
      return i;
    }
  }
  return -1;
}

export function buildNextLabel(
  item: EventQueueItem,
  cursorTrackIndex: number,
  queueIndex: number,
  items: EventQueueItem[],
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): string | null {
  const upcoming = resolveUpcoming(
    item,
    cursorTrackIndex,
    queueIndex,
    items,
    tandasById,
    tracksById
  );
  return upcoming?.title ?? null;
}

export type UpcomingKind = "song" | "cortina" | "tanda";

export interface UpcomingInfo {
  kind: UpcomingKind;
  title: string;
  subtitle: string;
  durationMs: number;
  albumArtUrl: string | null;
  source: TrackSource | null;
  /** When kind is tanda, the first track of that tanda (if resolved). */
  track: Track | null;
}

/**
 * Resolve the next thing the DJ will hear after the current cursor position.
 */
export function resolveUpcoming(
  item: EventQueueItem,
  cursorTrackIndex: number,
  queueIndex: number,
  items: EventQueueItem[],
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>,
  cortinaSeconds = 45
): UpcomingInfo | null {
  const tracks = flattenTracksForItem(item, tandasById, tracksById);

  if (cursorTrackIndex + 1 < tracks.length) {
    const next = tracks[cursorTrackIndex + 1];
    if (!next) return null;
    return {
      kind: "song",
      title: next.name,
      subtitle: next.orchestra || next.artists || "—",
      durationMs: next.durationMs ?? 0,
      albumArtUrl: next.albumArtUrl ?? null,
      source: next.source,
      track: next,
    };
  }

  const nextItem = items[queueIndex + 1];
  if (!nextItem) return null;

  // Skip markers when resolving "what's next to hear"
  let look = queueIndex + 1;
  while (look < items.length && items[look]?.type === "marker") look += 1;
  const playableNext = items[look];
  if (!playableNext) return null;

  if (playableNext.type === "cortina") {
    const ct = playableNext.trackId ? tracksById.get(playableNext.trackId) : null;
    const dur = Math.min(
      ct?.durationMs ?? cortinaSeconds * 1000,
      cortinaSeconds * 1000
    );
    return {
      kind: "cortina",
      title: ct?.name ?? "Cortina",
      subtitle: ct ? ct.orchestra || ct.artists || "Cortina" : "Cortina",
      durationMs: dur,
      albumArtUrl: ct?.albumArtUrl ?? null,
      source: ct?.source ?? null,
      track: ct ?? null,
    };
  }

  if (playableNext.type === "tanda" && playableNext.tandaId) {
    const tanda = tandasById.get(playableNext.tandaId);
    const firstId = tanda?.trackIds[0];
    const first = firstId ? tracksById.get(firstId) ?? null : null;
    return {
      kind: "tanda",
      title: tanda?.name ?? "Next tanda",
      subtitle: first
        ? first.orchestra || first.artists || first.name
        : "Next tanda",
      durationMs: first?.durationMs ?? 0,
      albumArtUrl: first?.albumArtUrl ?? null,
      source: first?.source ?? null,
      track: first,
    };
  }

  return null;
}

/** Estimate remaining playback time from cursor through end of queue (ms). */
export function estimateRemainingMs(
  items: EventQueueItem[],
  queueIndex: number,
  trackIndex: number,
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>,
  cortinaSeconds: number,
  currentProgressMs = 0,
  currentDurationMs = 0
): number {
  if (queueIndex < 0 || queueIndex >= items.length) return 0;
  let total = 0;

  for (let qi = queueIndex; qi < items.length; qi++) {
    const item = items[qi];
    if (item.type === "marker") continue;
    const tracks = flattenTracksForItem(item, tandasById, tracksById);
    const startTrack = qi === queueIndex ? trackIndex : 0;

    for (let ti = startTrack; ti < tracks.length; ti++) {
      const track = tracks[ti];
      let dur =
        item.type === "cortina"
          ? Math.min(
              track?.durationMs ?? cortinaSeconds * 1000,
              cortinaSeconds * 1000
            )
          : track?.durationMs ?? 0;

      if (qi === queueIndex && ti === trackIndex) {
        const live = currentDurationMs > 0 ? currentDurationMs : dur;
        dur = Math.max(0, live - currentProgressMs);
      }
      total += dur;
    }
  }

  return total;
}

export function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format longer durations as h:mm or m:ss. */
export function formatDurationLong(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
