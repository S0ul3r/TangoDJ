import { NextResponse } from "next/server";
import {
  AuthError,
  ensureProfile,
  getServiceSupabase,
  requireSpotifyUser,
} from "@/lib/supabase/server";
import { mapTrackRow, trackToRow } from "@/lib/supabase/mappers";
import type { Track } from "@/types/domain";

export async function POST(req: Request) {
  try {
    const user = await requireSpotifyUser(req);
    await ensureProfile(user);
    const body = await req.json();
    const tracks = (body.tracks ?? []) as Track[];
    if (!Array.isArray(tracks)) {
      return NextResponse.json({ error: "tracks must be an array" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const rows = tracks.map((t) => trackToRow(t, user.id));
    const { data, error } = await supabase
      .from("tracks")
      .upsert(rows, { onConflict: "id" })
      .select("*");
    if (error) throw new Error(error.message);

    return NextResponse.json({ tracks: (data ?? []).map(mapTrackRow) });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to save tracks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireSpotifyUser(req);
    const body = await req.json();
    const ids = (body.ids ?? []) as string[];
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("tracks")
      .delete()
      .eq("spotify_user_id", user.id)
      .in("id", ids);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to delete tracks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
