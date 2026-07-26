import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/auth";
import {
  refreshCookieOptions,
  SPOTIFY_REFRESH_COOKIE,
} from "@/lib/authCookies";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
    };
    const { code, codeVerifier, redirectUri } = body;
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;

    if (!code || !codeVerifier || !redirectUri || !clientId) {
      return NextResponse.json(
        { error: "Missing code, verifier, redirect URI, or client id." },
        { status: 400 }
      );
    }

    const data = await exchangeCodeForToken(
      code,
      redirectUri,
      codeVerifier,
      clientId
    );

    if (!data.refresh_token) {
      return NextResponse.json(
        {
          error:
            "Spotify did not return a refresh token. Re-consent and try again.",
        },
        { status: 400 }
      );
    }

    const res = NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
    res.cookies.set(
      SPOTIFY_REFRESH_COOKIE,
      data.refresh_token,
      refreshCookieOptions()
    );
    return res;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Token exchange failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
