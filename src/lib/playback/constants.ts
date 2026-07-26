export const DEFAULT_CORTINA_SECONDS = 45;
export const DEFAULT_GAP_SECONDS = 2;
/** Fade cortina over the last N ms before cutting to the next tanda. */
export const CORTINA_FADE_MS = 6000;
/** Volume steps during cortina fade (kept low to stay under Spotify rate limits). */
export const CORTINA_FADE_STEPS = 5;
/** How often we ask Spotify for player state (UI progress is interpolated locally). */
export const SPOTIFY_POLL_MS = 2000;
/** Local progress tick for smooth UI between Spotify polls. */
export const PROGRESS_TICK_MS = 250;
/** Schedule precise end when this much remains (wider than poll interval). */
export const NEAR_END_SCHEDULE_MS = 4000;
/** Advance when this much of the track remains (ms). */
export const END_EPSILON_MS = 100;
/**
 * Spotify metadata duration is sometimes longer than the real audio
 * (e.g. listed 2:57, audio ends ~2:50). After a jump to 0:00 / stop,
 * wait this long before treating it as end-of-track.
 */
export const PREMATURE_END_CONFIRM_MS = 2500;
/** Need at least this much playback before premature-end logic can fire. */
export const MIN_PEAK_FOR_PREMATURE_MS = 20_000;
