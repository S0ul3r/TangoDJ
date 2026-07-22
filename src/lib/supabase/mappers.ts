import type {
  EventQueueItem,
  Genre,
  MilongaEvent,
  Tanda,
  TandaGenre,
  Track,
  TrackSource,
} from "@/types/domain";

export function mapTrackRow(row: Record<string, unknown>): Track {
  return {
    id: String(row.id),
    source: row.source as TrackSource,
    genre: row.genre as Genre,
    name: String(row.name),
    artists: String(row.artists ?? ""),
    orchestra: (row.orchestra as string | null) ?? null,
    year: (row.year as number | null) ?? null,
    singer: (row.singer as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    spotifyUri: (row.spotify_uri as string | null) ?? null,
    spotifyId: (row.spotify_id as string | null) ?? null,
    albumArtUrl: (row.album_art_url as string | null) ?? null,
    localRelPath: (row.local_rel_path as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function trackToRow(track: Track, spotifyUserId: string) {
  return {
    id: track.id,
    spotify_user_id: spotifyUserId,
    source: track.source,
    genre: track.genre,
    name: track.name,
    artists: track.artists,
    orchestra: track.orchestra ?? null,
    year: track.year ?? null,
    singer: track.singer ?? null,
    duration_ms: track.durationMs ?? null,
    spotify_uri: track.spotifyUri ?? null,
    spotify_id: track.spotifyId ?? null,
    album_art_url: track.albumArtUrl ?? null,
    local_rel_path: track.localRelPath ?? null,
    created_at: track.createdAt,
    updated_at: track.updatedAt,
  };
}

export function mapTanda(
  row: Record<string, unknown>,
  trackIds: string[]
): Tanda {
  return {
    id: String(row.id),
    name: String(row.name),
    genre: row.genre as TandaGenre,
    trackIds,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapEvent(
  row: Record<string, unknown>,
  items: EventQueueItem[]
): MilongaEvent {
  return {
    id: String(row.id),
    name: String(row.name),
    items,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapEventItem(row: Record<string, unknown>): EventQueueItem {
  return {
    id: String(row.id),
    type: row.item_type as EventQueueItem["type"],
    tandaId: (row.tanda_id as string | null) ?? null,
    trackId: (row.track_id as string | null) ?? null,
  };
}
