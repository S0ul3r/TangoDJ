import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/supabase/server";
import { getUserPlaylists } from "@/lib/spotify";

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing Spotify token" }, { status: 401 });
  }
  try {
    const playlists = await getUserPlaylists(token);
    return NextResponse.json({ playlists });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list playlists";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
