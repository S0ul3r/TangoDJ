/**
 * Spotify Connect playback control (no Web Playback SDK)
 */

import { SPOTIFY_API_BASE } from "@/lib/constants";
import { fetchWithAuth } from "@/lib/spotify";
import type { SpotifyDevice } from "@/types/domain";

async function parseError(res: Response): Promise<string> {
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

export async function pausePlayback(
  accessToken: string,
  deviceId?: string | null
): Promise<void> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/pause`;
  const res = await fetchWithAuth(url, accessToken, { method: "PUT" });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}

export async function resumePlayback(
  accessToken: string,
  deviceId?: string | null
): Promise<void> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/play`;
  const res = await fetchWithAuth(url, accessToken, { method: "PUT" });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
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
