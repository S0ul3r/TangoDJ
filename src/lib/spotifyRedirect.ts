/**
 * Spotify OAuth redirect URI must match exactly what was sent in /authorize
 * and what is allowlisted in the Spotify Developer Dashboard.
 *
 * Prefer the current browser origin so the same build works on local
 * (http://127.0.0.1:3000) and production (https://….vercel.app).
 * Fall back to NEXT_PUBLIC_SPOTIFY_REDIRECT_URI when window is unavailable.
 */
export function getSpotifyRedirectUri(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/callback`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  throw new Error("NEXT_PUBLIC_SPOTIFY_REDIRECT_URI is not set");
}
