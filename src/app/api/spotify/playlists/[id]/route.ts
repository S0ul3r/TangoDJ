import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/supabase/server";
import { getAllPlaylistTracks, parsePlaylistId } from "@/lib/spotify";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing Spotify token" }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = parsePlaylistId(decodeURIComponent(rawId)) ?? rawId;
  if (!id) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  try {
    const tracks = await getAllPlaylistTracks(token, id);
    return NextResponse.json({
      playlistId: id,
      total: tracks.length,
      tracks,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load playlist";
    console.error("[playlist import]", id, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
