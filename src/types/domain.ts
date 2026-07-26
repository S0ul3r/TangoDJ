/** Domain types for Milonga DJ Assistant */

export type Genre = "tango" | "vals" | "milonga" | "cortina";
export type TandaGenre = "tango" | "vals" | "milonga";
export type TrackSource = "spotify" | "local";
export type QueueItemType = "tanda" | "cortina" | "marker";
export type SectionMarkerKind = "first_half" | "snack" | "second_half" | "custom";

export interface Track {
  id: string;
  source: TrackSource;
  genre: Genre;
  name: string;
  artists: string;
  orchestra?: string | null;
  year?: number | null;
  singer?: string | null;
  durationMs?: number | null;
  /** Spotify track URI e.g. spotify:track:... */
  spotifyUri?: string | null;
  /** Spotify track id */
  spotifyId?: string | null;
  albumArtUrl?: string | null;
  /** Relative path under the imported local root folder */
  localRelPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tanda {
  id: string;
  name: string;
  genre: TandaGenre;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventQueueItem {
  id: string;
  type: QueueItemType;
  /** When type=tanda */
  tandaId?: string | null;
  /** When type=cortina — track id from cortina genre */
  trackId?: string | null;
  /** When type=marker */
  markerKind?: SectionMarkerKind | null;
  /** Display label for markers (especially custom) */
  label?: string | null;
}

export interface MilongaEvent {
  id: string;
  name: string;
  items: EventQueueItem[];
  /** Opaque token for public read-only share URL */
  shareToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  itemIndex?: number;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export interface SpotifySearchTrack {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
    release_date?: string | null;
  };
  duration_ms: number;
}

export const TANDA_SIZE_HINT: Record<TandaGenre, number> = {
  tango: 4,
  vals: 3,
  milonga: 3,
};

export const FAST_GENRES: ReadonlySet<TandaGenre> = new Set(["vals", "milonga"]);

export const GENRE_LABELS: Record<Genre, string> = {
  tango: "Tango",
  vals: "Vals",
  milonga: "Milonga",
  cortina: "Cortina",
};

export const SECTION_MARKER_LABELS: Record<SectionMarkerKind, string> = {
  first_half: "1st half",
  snack: "Snack / break",
  second_half: "2nd half",
  custom: "Section",
};
