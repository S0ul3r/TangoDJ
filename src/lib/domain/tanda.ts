/**
 * Tanda size/genre consistency checks
 */

import type { Tanda, TandaGenre, Track, ValidationIssue } from "@/types/domain";
import { TANDA_SIZE_HINT } from "@/types/domain";

/** Preferred / maximum tracks for a genre (tango 4, vals/milonga 3). */
export function expectedTandaSize(genre: TandaGenre): number {
  return TANDA_SIZE_HINT[genre];
}

/** Minimum tracks required to save a tanda. */
export function minTandaSize(_genre: TandaGenre): number {
  return 3;
}

export function maxTandaSize(genre: TandaGenre): number {
  return TANDA_SIZE_HINT[genre];
}

export function validateTanda(
  tanda: Pick<Tanda, "genre" | "trackIds" | "name">,
  tracksById: Map<string, Track>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const min = minTandaSize(tanda.genre);
  const max = maxTandaSize(tanda.genre);
  const n = tanda.trackIds.length;

  if (n < min || n > max) {
    if (max === min) {
      issues.push({
        code: "tanda_size",
        message: `${tanda.genre} tanda needs exactly ${max} tracks (you have ${n}).`,
      });
    } else {
      issues.push({
        code: "tanda_size",
        message: `Tanda needs ${min}–${max} tracks (you have ${n}).`,
      });
    }
  }

  for (let i = 0; i < tanda.trackIds.length; i++) {
    const track = tracksById.get(tanda.trackIds[i]);
    if (!track) {
      issues.push({
        code: "tanda_missing_track",
        message: `Track #${i + 1} is missing from the library.`,
        itemIndex: i,
      });
      continue;
    }
    if (track.genre !== tanda.genre) {
      issues.push({
        code: "tanda_genre_mismatch",
        message: `"${track.name}" is ${track.genre}, but tanda is ${tanda.genre}.`,
        itemIndex: i,
      });
    }
  }

  return issues;
}

export function isTandaReady(
  tanda: Pick<Tanda, "genre" | "trackIds" | "name">,
  tracksById: Map<string, Track>
): boolean {
  return validateTanda(tanda, tracksById).length === 0;
}

/** Next auto-name like "Untitled vals 1", "Untitled tango 2". */
export function nextUntitledTandaName(
  genre: TandaGenre,
  existing: Tanda[]
): string {
  const re = new RegExp(`^Untitled ${genre} (\\d+)$`, "i");
  let max = 0;
  for (const t of existing) {
    if (t.genre !== genre) continue;
    const m = t.name.trim().match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Untitled ${genre} ${max + 1}`;
}
