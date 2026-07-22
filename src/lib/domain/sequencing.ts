/**
 * Milonga night sequencing rules (El Recodo–style):
 * - every tanda followed by a cortina
 * - never two fast tandas (vals/milonga) back-to-back
 * - prefer ~2 tango tandas between each fast tanda
 */

import type {
  EventQueueItem,
  Genre,
  MilongaEvent,
  Tanda,
  TandaGenre,
  Track,
  ValidationIssue,
  ValidationResult,
} from "@/types/domain";
import { FAST_GENRES } from "@/types/domain";

function resolveTandaGenre(
  item: EventQueueItem,
  tandasById: Map<string, Tanda>
): TandaGenre | null {
  if (item.type !== "tanda" || !item.tandaId) return null;
  return tandasById.get(item.tandaId)?.genre ?? null;
}

/** Extract ordered tanda genres from queue (ignoring cortinas). */
export function tandaGenresInQueue(
  items: EventQueueItem[],
  tandasById: Map<string, Tanda>
): TandaGenre[] {
  const genres: TandaGenre[] = [];
  for (const item of items) {
    const g = resolveTandaGenre(item, tandasById);
    if (g) genres.push(g);
  }
  return genres;
}

export function validateQueue(
  items: EventQueueItem[],
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (items.length === 0) {
    return { ok: true, issues: [] };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === "tanda") {
      if (!item.tandaId || !tandasById.has(item.tandaId)) {
        issues.push({
          code: "missing_tanda",
          message: `Queue item #${i + 1}: tanda not found.`,
          itemIndex: i,
        });
      }
      const next = items[i + 1];
      if (!next || next.type !== "cortina") {
        issues.push({
          code: "tanda_needs_cortina",
          message: `Tanda at #${i + 1} should be followed by a cortina.`,
          itemIndex: i,
        });
      }
    } else if (item.type === "cortina") {
      if (!item.trackId || !tracksById.has(item.trackId)) {
        issues.push({
          code: "missing_cortina",
          message: `Queue item #${i + 1}: cortina track not found.`,
          itemIndex: i,
        });
      } else {
        const track = tracksById.get(item.trackId)!;
        if (track.genre !== "cortina") {
          issues.push({
            code: "cortina_genre",
            message: `Queue item #${i + 1}: track is not a cortina.`,
            itemIndex: i,
          });
        }
      }
    }
  }

  // Fast-after-fast among consecutive tandas
  const tandaOnly = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === "tanda");

  for (let t = 1; t < tandaOnly.length; t++) {
    const prev = resolveTandaGenre(tandaOnly[t - 1].item, tandasById);
    const curr = resolveTandaGenre(tandaOnly[t].item, tandasById);
    if (prev && curr && FAST_GENRES.has(prev) && FAST_GENRES.has(curr)) {
      issues.push({
        code: "fast_after_fast",
        message: `Two fast tandas in a row (${prev} → ${curr}) at positions ${tandaOnly[t - 1].index + 1} and ${tandaOnly[t].index + 1}.`,
        itemIndex: tandaOnly[t].index,
      });
    }
  }

  // Soft preference: ~2 tangos between fast tandas
  let tangosSinceFast = 0;
  let seenFast = false;
  for (const { item, index } of tandaOnly) {
    const g = resolveTandaGenre(item, tandasById);
    if (!g) continue;
    if (FAST_GENRES.has(g)) {
      if (seenFast && tangosSinceFast < 2) {
        issues.push({
          code: "prefer_two_tangos",
          message: `Prefer ~2 tango tandas between fast ones (only ${tangosSinceFast} since last fast).`,
          itemIndex: index,
        });
      }
      seenFast = true;
      tangosSinceFast = 0;
    } else if (g === "tango") {
      tangosSinceFast += 1;
    }
  }

  const hardCodes = new Set([
    "missing_tanda",
    "missing_cortina",
    "cortina_genre",
    "tanda_needs_cortina",
    "fast_after_fast",
  ]);
  const ok = !issues.some((i) => hardCodes.has(i.code));

  return { ok, issues };
}

/** Suggest next tanda genre given current tanda sequence. */
export function suggestNextGenre(previousTandaGenres: TandaGenre[]): TandaGenre {
  if (previousTandaGenres.length === 0) return "tango";

  const last = previousTandaGenres[previousTandaGenres.length - 1];
  if (FAST_GENRES.has(last)) return "tango";

  let tangosSinceFast = 0;
  for (let i = previousTandaGenres.length - 1; i >= 0; i--) {
    const g = previousTandaGenres[i];
    if (FAST_GENRES.has(g)) break;
    if (g === "tango") tangosSinceFast += 1;
  }

  if (tangosSinceFast >= 2) {
    // Alternate vals / milonga preference by count
    const vals = previousTandaGenres.filter((g) => g === "vals").length;
    const milongas = previousTandaGenres.filter((g) => g === "milonga").length;
    return vals <= milongas ? "vals" : "milonga";
  }

  return "tango";
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Auto-generate a night queue from tanda + cortina pools.
 * Pattern: tango, tango, fast, (repeat) with cortina after every tanda.
 */
export function autoGenerateNight(
  tandas: Tanda[],
  cortinaTracks: Track[],
  options?: { maxTandas?: number }
): EventQueueItem[] {
  const maxTandas = options?.maxTandas ?? 12;
  if (tandas.length === 0 || cortinaTracks.length === 0) return [];

  const pools: Record<TandaGenre, Tanda[]> = {
    tango: tandas.filter((t) => t.genre === "tango"),
    vals: tandas.filter((t) => t.genre === "vals"),
    milonga: tandas.filter((t) => t.genre === "milonga"),
  };

  const used = new Set<string>();
  const items: EventQueueItem[] = [];
  const genresUsed: TandaGenre[] = [];
  let cortinaIdx = 0;

  const pick = (genre: TandaGenre): Tanda | null => {
    const pool = pools[genre].filter((t) => !used.has(t.id));
    if (pool.length === 0) {
      // Allow reuse if exhausted
      const fallback = pools[genre];
      return fallback.length ? fallback[items.length % fallback.length] : null;
    }
    const tanda = pool[0];
    used.add(tanda.id);
    return tanda;
  };

  for (let n = 0; n < maxTandas; n++) {
    const want = suggestNextGenre(genresUsed);
    let tanda = pick(want);
    if (!tanda) {
      // Try any available genre that doesn't violate fast-after-fast
      const candidates: TandaGenre[] = ["tango", "vals", "milonga"];
      for (const g of candidates) {
        if (
          genresUsed.length > 0 &&
          FAST_GENRES.has(genresUsed[genresUsed.length - 1]) &&
          FAST_GENRES.has(g)
        ) {
          continue;
        }
        tanda = pick(g);
        if (tanda) break;
      }
    }
    if (!tanda) break;

    genresUsed.push(tanda.genre);
    items.push({ id: newId(), type: "tanda", tandaId: tanda.id });

    const cortina = cortinaTracks[cortinaIdx % cortinaTracks.length];
    cortinaIdx += 1;
    items.push({ id: newId(), type: "cortina", trackId: cortina.id });
  }

  return items;
}

export function genreOfQueueItem(
  item: EventQueueItem,
  tandasById: Map<string, Tanda>
): Genre | null {
  if (item.type === "cortina") return "cortina";
  return resolveTandaGenre(item, tandasById);
}

/** Helper for tests / UI: wrap validation for a full event. */
export function validateEvent(
  event: Pick<MilongaEvent, "items">,
  tandasById: Map<string, Tanda>,
  tracksById: Map<string, Track>
): ValidationResult {
  return validateQueue(event.items, tandasById, tracksById);
}
