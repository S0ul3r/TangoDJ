import { NextResponse } from "next/server";
import {
  AuthError,
  ensureProfile,
  getServiceSupabase,
  requireSpotifyUser,
} from "@/lib/supabase/server";
import {
  mapEvent,
  mapEventItem,
  mapTanda,
  mapTrackRow,
} from "@/lib/supabase/mappers";

export async function GET(req: Request) {
  try {
    const user = await requireSpotifyUser(req);
    await ensureProfile(user);
    const supabase = getServiceSupabase();
    const uid = user.id;

    const [tracksRes, tandasRes, eventsRes] = await Promise.all([
      supabase.from("tracks").select("*").eq("spotify_user_id", uid),
      supabase.from("tandas").select("*").eq("spotify_user_id", uid),
      supabase.from("events").select("*").eq("spotify_user_id", uid),
    ]);

    if (tracksRes.error) throw new Error(tracksRes.error.message);
    if (tandasRes.error) throw new Error(tandasRes.error.message);
    if (eventsRes.error) throw new Error(eventsRes.error.message);

    const tandaIds = (tandasRes.data ?? []).map((t) => t.id as string);
    const eventIds = (eventsRes.data ?? []).map((e) => e.id as string);

    const [ttRes, eiRes] = await Promise.all([
      tandaIds.length
        ? supabase
            .from("tanda_tracks")
            .select("*")
            .in("tanda_id", tandaIds)
            .order("position")
        : Promise.resolve({ data: [], error: null }),
      eventIds.length
        ? supabase
            .from("event_items")
            .select("*")
            .in("event_id", eventIds)
            .order("position")
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (ttRes.error) throw new Error(ttRes.error.message);
    if (eiRes.error) throw new Error(eiRes.error.message);

    const tracksByTanda = new Map<string, string[]>();
    for (const row of ttRes.data ?? []) {
      const tid = String(row.tanda_id);
      const list = tracksByTanda.get(tid) ?? [];
      list.push(String(row.track_id));
      tracksByTanda.set(tid, list);
    }

    const itemsByEvent = new Map<string, ReturnType<typeof mapEventItem>[]>();
    for (const row of eiRes.data ?? []) {
      const eid = String(row.event_id);
      const list = itemsByEvent.get(eid) ?? [];
      list.push(mapEventItem(row));
      itemsByEvent.set(eid, list);
    }

    return NextResponse.json({
      profile: {
        spotifyUserId: user.id,
        displayName: user.display_name,
      },
      tracks: (tracksRes.data ?? []).map(mapTrackRow),
      tandas: (tandasRes.data ?? []).map((row) =>
        mapTanda(row, tracksByTanda.get(String(row.id)) ?? [])
      ),
      events: (eventsRes.data ?? []).map((row) =>
        mapEvent(row, itemsByEvent.get(String(row.id)) ?? [])
      ),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
