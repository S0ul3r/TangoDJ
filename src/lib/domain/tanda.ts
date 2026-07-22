/**
 * Tanda size/genre consistency checks
 */

import type { Tanda, TandaGenre, Track, ValidationIssue } from "@/types/domain";
import { TANDA_SIZE_HINT } from "@/types/domain";

export function expectedTandaSize(genre: TandaGenre): number {
  return TANDA_SIZE_HINT[genre];
}

export function validateTanda(
  tanda: Pick<Tanda, "genre" | "trackIds" | "name">,
  tracksById: Map<string, Track>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hint = expectedTandaSize(tanda.genre);

  if (!tanda.name.trim()) {
    issues.push({ code: "tanda_name", message: "Tanda needs a name." });
  }

  if (tanda.trackIds.length < 3 || tanda.trackIds.length > 4) {
    issues.push({
      code: "tanda_size",
      message: `Tanda should have 3–4 tracks (hint for ${tanda.genre}: ${hint}).`,
    });
  } else if (tanda.trackIds.length !== hint) {
    issues.push({
      code: "tanda_size_hint",
      message: `Usual size for ${tanda.genre} is ${hint} tracks (you have ${tanda.trackIds.length}).`,
    });
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
  return validateTanda(tanda, tracksById).every(
    (i) => i.code === "tanda_size_hint"
  );
}
