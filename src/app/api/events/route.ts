import { NextResponse } from "next/server";
import {
  AuthError,
  ensureProfile,
  getServiceSupabase,
  requireSpotifyUser,
} from "@/lib/supabase/server";
import { mapEvent } from "@/lib/supabase/mappers";
import type { MilongaEvent } from "@/types/domain";

export async function POST(req: Request) {
  try {
    const user = await requireSpotifyUser(req);
    await ensureProfile(user);
    const body = await req.json();
    const event = body.event as MilongaEvent;
    if (!event?.id || !event.name) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { error: eErr } = await supabase.from("events").upsert(
      {
        id: event.id,
        spotify_user_id: user.id,
        name: event.name,
        created_at: event.createdAt,
        updated_at: event.updatedAt,
      },
      { onConflict: "id" }
    );
    if (eErr) throw new Error(eErr.message);

    await supabase.from("event_items").delete().eq("event_id", event.id);
    if (event.items.length) {
      const rows = event.items.map((item, position) => ({
        id: item.id,
        event_id: event.id,
        position,
        item_type: item.type,
        tanda_id: item.tandaId ?? null,
        track_id: item.trackId ?? null,
      }));
      const { error: iErr } = await supabase.from("event_items").insert(rows);
      if (iErr) throw new Error(iErr.message);
    }

    return NextResponse.json({ event: mapEvent(
      {
        id: event.id,
        name: event.name,
        created_at: event.createdAt,
        updated_at: event.updatedAt,
      },
      event.items
    ) });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to save event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireSpotifyUser(req);
    const body = await req.json();
    const id = body.id as string;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("spotify_user_id", user.id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to delete event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
