/**
 * Spotify Connect playback control (no Web Playback SDK)
 */

import { SPOTIFY_API_BASE } from "@/lib/constants";
import { fetchWithAuth } from "@/lib/spotify";
import type { SpotifyDevice } from "@/types/domain";

async function parseError(res: Response): Promise<string> {
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : NaN;
    if (Number.isFinite(seconds) && seconds > 0) {
      const mins = Math.max(1, Math.ceil(seconds / 60));
      return `Spotify rate limit — wait ~${mins} min and try again`;
    }
    return "Spotify rate limit — wait a bit and try again";
  }
  try {
    const body = await res.json();
    const msg = body?.error?.message ?? body?.error ?? res.statusText;
    return typeof msg === "string" ? msg : "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function getDevices(accessToken: string): Promise<SpotifyDevice[]> {
  const res = await fetchWithAuth(
    `${SPOTIFY_API_BASE}/me/player/devices`,
    accessToken
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.devices ?? [];
}

export async function transferPlayback(
  accessToken: string,
  deviceId: string,
  play = false
): Promise<void> {
  const res = await fetchWithAuth(`${SPOTIFY_API_BASE}/me/player`, accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}

export async function playUris(
  accessToken: string,
  uris: string[],
  deviceId?: string | null,
  positionMs = 0
): Promise<void> {
  if (uris.length === 0) return;
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/play`;
  const res = await fetchWithAuth(url, accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uris,
      position_ms: positionMs,
    }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}

/** Returns false when Spotify rejects (e.g. Restriction violated) instead of throwing. */
export async function pausePlayback(
  accessToken: string,
  deviceId?: string | null
): Promise<boolean> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/pause`;
  const res = await fetchWithAuth(url, accessToken, { method: "PUT" });
  if (res.ok || res.status === 204) return true;
  const msg = await parseError(res);
  if (/restriction violated|no active device|not paused/i.test(msg)) {
    return false;
  }
  throw new Error(msg);
}

/** Returns false when Spotify rejects instead of throwing. */
export async function resumePlayback(
  accessToken: string,
  deviceId?: string | null
): Promise<boolean> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/play`;
  const res = await fetchWithAuth(url, accessToken, { method: "PUT" });
  if (res.ok || res.status === 204) return true;
  const msg = await parseError(res);
  if (/restriction violated|no active device/i.test(msg)) {
    return false;
  }
  throw new Error(msg);
}

export async function skipToNext(
  accessToken: string,
  deviceId?: string | null
): Promise<void> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/next?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/next`;
  const res = await fetchWithAuth(url, accessToken, { method: "POST" });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}

export async function seekPlayback(
  accessToken: string,
  positionMs: number,
  deviceId?: string | null
): Promise<void> {
  const params = new URLSearchParams({
    position_ms: String(Math.max(0, Math.round(positionMs))),
  });
  if (deviceId) params.set("device_id", deviceId);
  const res = await fetchWithAuth(
    `${SPOTIFY_API_BASE}/me/player/seek?${params}`,
    accessToken,
    { method: "PUT" }
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}

export async function setPlaybackVolume(
  accessToken: string,
  volumePercent: number,
  deviceId?: string | null
): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(volumePercent)));
  const params = new URLSearchParams({ volume_percent: String(clamped) });
  if (deviceId) params.set("device_id", deviceId);
  const res = await fetchWithAuth(
    `${SPOTIFY_API_BASE}/me/player/volume?${params}`,
    accessToken,
    { method: "PUT" }
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}

/** Turn off repeat so single-URI plays don't loop the first track. */
export async function setRepeatMode(
  accessToken: string,
  state: "off" | "track" | "context" = "off",
  deviceId?: string | null
): Promise<void> {
  const params = new URLSearchParams({ state });
  if (deviceId) params.set("device_id", deviceId);
  const res = await fetchWithAuth(
    `${SPOTIFY_API_BASE}/me/player/repeat?${params}`,
    accessToken,
    { method: "PUT" }
  );
  if (!res.ok && res.status !== 204) {
    /* non-fatal — Premium / device quirks */
  }
}

export interface PlayerState {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album?: { images: { url: string }[] };
  } | null;
  device?: SpotifyDevice;
}

export async function getPlaybackState(
  accessToken: string
): Promise<PlayerState | null> {
  const res = await fetchWithAuth(`${SPOTIFY_API_BASE}/me/player`, accessToken);
  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json();
}

/** Prefer desktop / last-used device from a list. */
export function pickPreferredDevice(
  devices: SpotifyDevice[],
  lastDeviceId?: string | null
): SpotifyDevice | null {
  if (devices.length === 0) return null;
  if (lastDeviceId) {
    const last = devices.find((d) => d.id === lastDeviceId);
    if (last) return last;
  }
  const active = devices.find((d) => d.is_active);
  if (active) return active;
  const desktop = devices.find(
    (d) =>
      /computer|desktop|pc/i.test(d.type) ||
      /spotify.*(desktop|computer)|desktop.*spotify/i.test(d.name)
  );
  return desktop ?? devices[0];
}
