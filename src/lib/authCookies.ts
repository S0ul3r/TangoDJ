import { cookies } from "next/headers";

export const SPOTIFY_REFRESH_COOKIE = "tdj_spotify_refresh";

/** ~30 days — Spotify refresh tokens are long-lived; cookie mirrors that. */
const REFRESH_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function refreshCookieOptions(maxAge = REFRESH_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function getRefreshTokenFromCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(SPOTIFY_REFRESH_COOKIE)?.value;
  return value && value.length > 0 ? value : null;
}
