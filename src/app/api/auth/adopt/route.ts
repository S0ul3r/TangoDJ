import { NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/auth";
import {
  refreshCookieOptions,
  SPOTIFY_REFRESH_COOKIE,
} from "@/lib/authCookies";

/**
 * One-time migration: move a refresh token from localStorage into an httpOnly cookie.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { refresh_token?: string };
    const refresh = body.refresh_token?.trim();
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;

    if (!refresh || !clientId) {
      return NextResponse.json(
        { error: "Missing refresh token." },
        { status: 400 }
      );
    }

    const data = await refreshAccessToken(refresh, clientId);
    const res = NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
    res.cookies.set(
      SPOTIFY_REFRESH_COOKIE,
      data.refresh_token ?? refresh,
      refreshCookieOptions()
    );
    return res;
  } catch {
    return NextResponse.json(
      { error: "Could not adopt session." },
      { status: 401 }
    );
  }
}
