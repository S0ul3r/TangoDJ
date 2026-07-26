import type {
  EventQueueItem,
  SectionMarkerKind,
  Tanda,
  Track,
} from "@/types/domain";
import { SECTION_MARKER_LABELS } from "@/types/domain";

export function markerLabel(item: EventQueueItem): string {
  if (item.type !== "marker") return "";
  if (item.label?.trim()) return item.label.trim();
  const kind = (item.markerKind ?? "custom") as SectionMarkerKind;
  return SECTION_MARKER_LABELS[kind] ?? "Section";
}

export function labelForQueueItem(
  item: EventQueueItem,
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): string {
  if (item.type === "marker") {
    return `▸ ${markerLabel(item)}`;
  }
  if (item.type === "tanda") {
    const t = item.tandaId ? tandasById.get(item.tandaId) : null;
    return t ? `Tanda · ${t.name} (${t.genre})` : "Tanda · missing";
  }
  const track = item.trackId ? tracksById.get(item.trackId) : null;
  return track ? `Cortina · ${track.name}` : "Cortina · missing";
}

/** Expand queue into printable setlist lines (markers + tanda tracks + cortinas). */
export function buildSetlistLines(
  items: EventQueueItem[],
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): { kind: "marker" | "tanda" | "track" | "cortina"; text: string }[] {
  const lines: { kind: "marker" | "tanda" | "track" | "cortina"; text: string }[] =
    [];
  let tandaOrdinal = 0;

  for (const item of items) {
    if (item.type === "marker") {
      lines.push({ kind: "marker", text: markerLabel(item) });
      continue;
    }
    if (item.type === "tanda") {
      tandaOrdinal += 1;
      const t = item.tandaId ? tandasById.get(item.tandaId) : null;
      lines.push({
        kind: "tanda",
        text: `${tandaOrdinal}. ${t?.name ?? "Tanda"} (${t?.genre ?? "?"})`,
      });
      for (const id of t?.trackIds ?? []) {
        const tr = tracksById.get(id);
        if (tr) {
          lines.push({
            kind: "track",
            text: `    ${tr.name} — ${tr.orchestra || tr.artists || "—"}`,
          });
        }
      }
      continue;
    }
    const track = item.trackId ? tracksById.get(item.trackId) : null;
    lines.push({
      kind: "cortina",
      text: `Cortina · ${track?.name ?? "missing"}`,
    });
  }
  return lines;
}
