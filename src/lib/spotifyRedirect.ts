/**
 * Spotify OAuth redirect URI must match exactly what was sent in /authorize
 * and what is allowlisted in the Spotify Developer Dashboard.
 *
 * Prefer the current browser origin so the same build works on local
 * (http://127.0.0.1:3000) and production (https://….vercel.app).
 * Fall back to NEXT_PUBLIC_SPOTIFY_REDIRECT_URI when window is unavailable.
 *
 * Spotify treats `localhost` and `127.0.0.1` as different URIs, and
 * sessionStorage is origin-scoped. Locally, bounce onto 127.0.0.1 first
 * via {@link redirectLocalhostToLoopbackIfNeeded} — do not rewrite the
 * redirect URI alone or the PKCE verifier will be missing on callback.
 */
export function getSpotifyRedirectUri(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/callback`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  throw new Error("NEXT_PUBLIC_SPOTIFY_REDIRECT_URI is not set");
}

/**
 * Spotify local allowlists use 127.0.0.1, not localhost.
 * Hard-navigate so PKCE sessionStorage and redirect_uri share one origin.
 * @returns true if a redirect was started (caller must stop work)
 */
export function redirectLocalhostToLoopbackIfNeeded(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "localhost") return false;

  const { protocol, port, pathname, search, hash } = window.location;
  const portPart = port ? `:${port}` : "";
  window.location.replace(
    `${protocol}//127.0.0.1${portPart}${pathname}${search}${hash}`
  );
  return true;
}
