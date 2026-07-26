import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { mapEventItem, mapTanda, mapTrackRow } from "@/lib/supabase/mappers";
import { labelForQueueItem, markerLabel } from "@/lib/domain/eventLabels";
import type { EventQueueItem, Tanda, Track } from "@/types/domain";

/**
 * Public read-only share payload — no Spotify auth required.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    const shareToken = token?.trim();
    if (!shareToken) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: eventRow, error: eErr } = await supabase
      .from("events")
      .select("id, name, created_at, updated_at, share_token")
      .eq("share_token", shareToken)
      .maybeSingle();

    if (eErr) throw new Error(eErr.message);
    if (!eventRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: itemRows, error: iErr } = await supabase
      .from("event_items")
      .select("*")
      .eq("event_id", eventRow.id)
      .order("position", { ascending: true });
    if (iErr) throw new Error(iErr.message);

    const items: EventQueueItem[] = (itemRows ?? []).map(mapEventItem);

    const tandaIds = [
      ...new Set(
        items
          .filter((i) => i.type === "tanda" && i.tandaId)
          .map((i) => i.tandaId as string)
      ),
    ];
    const trackIds = [
      ...new Set(
        items
          .filter((i) => i.type === "cortina" && i.trackId)
          .map((i) => i.trackId as string)
      ),
    ];

    const tandasById = new Map<string, Tanda>();
    const tracksById = new Map<string, Track>();

    if (tandaIds.length) {
      const { data: tandas } = await supabase
        .from("tandas")
        .select("*")
        .in("id", tandaIds);
      const { data: tt } = await supabase
        .from("tanda_tracks")
        .select("tanda_id, track_id, position")
        .in("tanda_id", tandaIds)
        .order("position", { ascending: true });

      const tracksInTandas = [
        ...new Set((tt ?? []).map((r) => String(r.track_id))),
      ];
      if (tracksInTandas.length) {
        const { data: tracks } = await supabase
          .from("tracks")
          .select("*")
          .in("id", tracksInTandas);
        for (const row of tracks ?? []) {
          const t = mapTrackRow(row);
          tracksById.set(t.id, t);
        }
      }

      for (const row of tandas ?? []) {
        const ids = (tt ?? [])
          .filter((r) => String(r.tanda_id) === String(row.id))
          .map((r) => String(r.track_id));
        const tanda = mapTanda(row, ids);
        tandasById.set(tanda.id, tanda);
      }
    }

    if (trackIds.length) {
      const { data: tracks } = await supabase
        .from("tracks")
        .select("*")
        .in("id", trackIds);
      for (const row of tracks ?? []) {
        const t = mapTrackRow(row);
        tracksById.set(t.id, t);
      }
    }

    const rows = items.map((item, index) => {
      if (item.type === "marker") {
        return {
          index: index + 1,
          type: "marker" as const,
          label: markerLabel(item),
          tracks: [] as { name: string; artists: string; orchestra: string | null }[],
        };
      }
      if (item.type === "tanda") {
        const tanda = item.tandaId ? tandasById.get(item.tandaId) : null;
        const tracks = (tanda?.trackIds ?? [])
          .map((id) => tracksById.get(id))
          .filter((t): t is Track => !!t)
          .map((t) => ({
            name: t.name,
            artists: t.artists,
            orchestra: t.orchestra ?? null,
          }));
        return {
          index: index + 1,
          type: "tanda" as const,
          label: labelForQueueItem(item, tandasById, tracksById),
          genre: tanda?.genre ?? null,
          tracks,
        };
      }
      const track = item.trackId ? tracksById.get(item.trackId) : null;
      return {
        index: index + 1,
        type: "cortina" as const,
        label: labelForQueueItem(item, tandasById, tracksById),
        tracks: track
          ? [
              {
                name: track.name,
                artists: track.artists,
                orchestra: track.orchestra ?? null,
              },
            ]
          : [],
      };
    });

    return NextResponse.json({
      event: {
        name: String(eventRow.name),
        updatedAt: String(eventRow.updated_at),
      },
      items: rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load share";
    // Missing share_token column → clear guidance
    if (/share_token/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Share is not enabled on this database yet. Run supabase/migration_markers_share.sql.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
