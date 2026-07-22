/**
 * Spotify Web API helpers used by TangoDJ (browser + server).
 *
 * Feb 2026 API notes (Development Mode):
 * - Playlist track-count: tracks → items (both may appear during transition)
 * - Playlist contents: GET /playlists/{id}/items only (owned/collaborator)
 * - Each row: { item: TrackObject } (renamed from track)
 * @see https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
 */

import { SPOTIFY_API_BASE } from "./constants";
import type { SpotifySearchTrack } from "@/types/domain";

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  email?: string;
  images?: { url: string }[];
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  tracksTotal: number;
  images: { url: string }[];
  ownerName: string;
}

async function parseSpotifyError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const msg = body?.error?.message ?? body?.error ?? res.statusText;
    return typeof msg === "string" ? msg : "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchWithAuth(
  url: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });
}

export async function getProfile(accessToken: string): Promise<SpotifyUser> {
  const res = await fetchWithAuth(`${SPOTIFY_API_BASE}/me`, accessToken);
  if (!res.ok) throw new Error(await parseSpotifyError(res));
  return res.json();
}

export async function searchTracks(
  accessToken: string,
  query: string,
  limit = 10
): Promise<SpotifySearchTrack[]> {
  // Feb 2026: search limit max is 10
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(Math.min(limit, 10)),
  });
  const res = await fetchWithAuth(
    `${SPOTIFY_API_BASE}/search?${params}`,
    accessToken
  );
  if (!res.ok) throw new Error(await parseSpotifyError(res));
  const data = await res.json();
  return data.tracks?.items ?? [];
}

/** Accept playlist URL, URI, or raw id. */
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const uri = trimmed.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uri) return uri[1];

  const url = trimmed.match(
    /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)(?:\?|$|\/)/
  );
  if (url) return url[1];

  if (/^[a-zA-Z0-9]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

/** Feb 2026+: prefer items.total, fall back to deprecated tracks.total */
export function playlistTrackCount(playlist: Record<string, unknown>): number {
  const items = playlist.items as { total?: number } | undefined;
  const tracks = playlist.tracks as { total?: number } | undefined;
  const n = items?.total ?? tracks?.total;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export async function getUserPlaylists(
  accessToken: string,
  limit = 50
): Promise<SpotifyPlaylistSummary[]> {
  const all: SpotifyPlaylistSummary[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total && all.length < 150) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const res = await fetchWithAuth(
      `${SPOTIFY_API_BASE}/me/playlists?${params}`,
      accessToken
    );
    if (!res.ok) throw new Error(await parseSpotifyError(res));
    const data = await res.json();
    total = data.total ?? 0;
    for (const p of data.items ?? []) {
      all.push({
        id: p.id,
        name: p.name,
        tracksTotal: playlistTrackCount(p),
        images: p.images ?? [],
        ownerName: p.owner?.display_name ?? "",
      });
    }
    offset += (data.items ?? []).length;
    if (!(data.items ?? []).length) break;
  }

  return all;
}

function asSearchTrack(raw: unknown): SpotifySearchTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;

  // Skip episodes / non-tracks when type is present
  if (typeof t.type === "string" && t.type !== "track") return null;

  const id = typeof t.id === "string" ? t.id : null;
  const name = typeof t.name === "string" ? t.name : null;
  if (!id || !name) return null;

  const uri =
    typeof t.uri === "string" && t.uri.startsWith("spotify:track:")
      ? t.uri
      : `spotify:track:${id}`;

  const artistsRaw = Array.isArray(t.artists) ? t.artists : [];
  const artists = artistsRaw
    .map((a) => {
      if (a && typeof a === "object" && "name" in a) {
        return { name: String((a as { name: unknown }).name ?? "") };
      }
      if (typeof a === "string") return { name: a };
      return null;
    })
    .filter((a): a is { name: string } => !!a);

  const albumObj =
    t.album && typeof t.album === "object"
      ? (t.album as { name?: string; images?: { url: string }[] })
      : null;

  return {
    id,
    uri,
    name,
    artists,
    album: {
      name: albumObj?.name ?? "",
      images: Array.isArray(albumObj?.images) ? albumObj!.images : [],
    },
    duration_ms: typeof t.duration_ms === "number" ? t.duration_ms : 0,
  };
}

/** Extract a track from a playlist row (Feb 2026 `item` or legacy `track`). */
export function parsePlaylistTrackEntry(
  entry: unknown
): SpotifySearchTrack | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;

  // Feb 2026: { item: TrackObject }
  const fromItem = asSearchTrack(row.item);
  if (fromItem) return fromItem;

  // Legacy: { track: TrackObject }
  const fromTrack = asSearchTrack(row.track);
  if (fromTrack) return fromTrack;

  // Some payloads nest further
  if (row.item && typeof row.item === "object") {
    const nested = row.item as Record<string, unknown>;
    const deeper = asSearchTrack(nested.track) ?? asSearchTrack(nested.item);
    if (deeper) return deeper;
  }

  // Row itself is a track (rare)
  return asSearchTrack(row);
}

type PlaylistPage = {
  entries: unknown[];
  total: number;
  status: number;
  errorBody?: string;
};

async function fetchPlaylistItemsPage(
  accessToken: string,
  playlistId: string,
  offset: number,
  limit = 50
): Promise<PlaylistPage> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const path = `${SPOTIFY_API_BASE}/playlists/${playlistId}/items?${params}`;
  const res = await fetchWithAuth(path, accessToken);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {
      entries: [],
      total: 0,
      status: res.status,
      errorBody: text.slice(0, 300),
    };
  }
  if (!res.ok) {
    const err = data.error as { message?: string } | string | undefined;
    const msg =
      typeof err === "string"
        ? err
        : err?.message ?? res.statusText;
    return {
      entries: [],
      total: 0,
      status: res.status,
      errorBody: String(msg),
    };
  }
  return {
    entries: Array.isArray(data.items) ? data.items : [],
    total: typeof data.total === "number" ? data.total : 0,
    status: res.status,
  };
}

/**
 * Fetch all tracks from a playlist the user owns or collaborates on.
 */
export async function getAllPlaylistTracks(
  accessToken: string,
  playlistId: string
): Promise<SpotifySearchTrack[]> {
  const all: SpotifySearchTrack[] = [];
  let offset = 0;
  let total = Infinity;
  let rawRows = 0;
  let sampleKeys: string[] | null = null;

  while (offset < total) {
    const page = await fetchPlaylistItemsPage(
      accessToken,
      playlistId,
      offset
    );

    if (page.status === 403) {
      throw new Error(
        "Cannot read this playlist’s tracks. Spotify only allows importing playlists you own or collaborate on (Development Mode restriction)."
      );
    }
    if (page.status === 404) {
      throw new Error("Playlist not found.");
    }
    if (page.status !== 200) {
      throw new Error(
        page.errorBody ||
          `Spotify returned ${page.status} while loading playlist items.`
      );
    }

    total = page.total;
    rawRows += page.entries.length;

    if (page.entries.length > 0 && !sampleKeys) {
      const first = page.entries[0];
      if (first && typeof first === "object") {
        sampleKeys = Object.keys(first as object);
        const item = (first as { item?: unknown; track?: unknown }).item ??
          (first as { track?: unknown }).track;
        if (item && typeof item === "object") {
          sampleKeys = [
            ...sampleKeys,
            ...Object.keys(item as object).map((k) => `item.${k}`),
          ];
        }
      }
    }

    for (const entry of page.entries) {
      const track = parsePlaylistTrackEntry(entry);
      if (track) all.push(track);
    }

    offset += page.entries.length;
    if (page.entries.length === 0) break;
  }

  if (all.length === 0 && (total > 0 || rawRows > 0)) {
    throw new Error(
      `Playlist reported ${total} items but none could be parsed as tracks` +
        (sampleKeys ? ` (row keys: ${sampleKeys.join(", ")})` : "") +
        ". If this is not your playlist, Spotify blocks track details in Development Mode."
    );
  }

  return all;
}
