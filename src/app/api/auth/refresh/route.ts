import { NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/auth";
import {
  getRefreshTokenFromCookie,
  refreshCookieOptions,
  SPOTIFY_REFRESH_COOKIE,
} from "@/lib/authCookies";

export async function POST() {
  try {
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "Missing Spotify client id." },
        { status: 500 }
      );
    }

    const refresh = await getRefreshTokenFromCookie();
    if (!refresh) {
      return NextResponse.json({ error: "No session." }, { status: 401 });
    }

    const data = await refreshAccessToken(refresh, clientId);
    const res = NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
    if (data.refresh_token) {
      res.cookies.set(
        SPOTIFY_REFRESH_COOKIE,
        data.refresh_token,
        refreshCookieOptions()
      );
    }
    return res;
  } catch {
    const res = NextResponse.json(
      { error: "Session expired." },
      { status: 401 }
    );
    res.cookies.set(SPOTIFY_REFRESH_COOKIE, "", refreshCookieOptions(0));
    return res;
  }
}
