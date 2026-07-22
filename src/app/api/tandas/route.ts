import { NextResponse } from "next/server";
import {
  AuthError,
  ensureProfile,
  getServiceSupabase,
  requireSpotifyUser,
} from "@/lib/supabase/server";
import { mapTanda } from "@/lib/supabase/mappers";
import type { Tanda } from "@/types/domain";

export async function POST(req: Request) {
  try {
    const user = await requireSpotifyUser(req);
    await ensureProfile(user);
    const body = await req.json();
    const tanda = body.tanda as Tanda;
    if (!tanda?.id || !tanda.name || !tanda.genre) {
      return NextResponse.json({ error: "Invalid tanda" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { error: tErr } = await supabase.from("tandas").upsert(
      {
        id: tanda.id,
        spotify_user_id: user.id,
        name: tanda.name,
        genre: tanda.genre,
        created_at: tanda.createdAt,
        updated_at: tanda.updatedAt,
      },
      { onConflict: "id" }
    );
    if (tErr) throw new Error(tErr.message);

    await supabase.from("tanda_tracks").delete().eq("tanda_id", tanda.id);
    if (tanda.trackIds.length) {
      const rows = tanda.trackIds.map((trackId, position) => ({
        tanda_id: tanda.id,
        track_id: trackId,
        position,
      }));
      const { error: ttErr } = await supabase.from("tanda_tracks").insert(rows);
      if (ttErr) throw new Error(ttErr.message);
    }

    return NextResponse.json({
      tanda: mapTanda(
        {
          id: tanda.id,
          name: tanda.name,
          genre: tanda.genre,
          created_at: tanda.createdAt,
          updated_at: tanda.updatedAt,
        },
        tanda.trackIds
      ),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to save tanda";
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
      .from("tandas")
      .delete()
      .eq("spotify_user_id", user.id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to delete tanda";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
