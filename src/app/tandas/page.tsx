"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useLibrary } from "@/context/LibraryContext";
import { useSpotify } from "@/context/SpotifyContext";
import {
  maxTandaSize,
  minTandaSize,
  nextUntitledTandaName,
  validateTanda,
} from "@/lib/domain/tanda";
import { recommendForTanda } from "@/lib/domain/recommendations";
import {
  createSpotifyTrack,
  dedupeTracksAgainstLibrary,
} from "@/lib/tracks";
import type { SpotifySearchTrack, Tanda, TandaGenre, Track } from "@/types/domain";
import { GENRE_LABELS } from "@/types/domain";

const GENRES: TandaGenre[] = ["tango", "vals", "milonga"];
type SavedFilter = "all" | TandaGenre;

export default function TandasPage() {
  const {
    tracks,
    tandas,
    upsertTanda,
    deleteTanda,
    tracksByGenre,
    upsertTracks,
  } = useLibrary();
  const { getValidToken } = useSpotify();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [genre, setGenre] = useState<TandaGenre>("tango");
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [savedFilter, setSavedFilter] = useState<SavedFilter>("all");
  const [recLibrary, setRecLibrary] = useState<Track[]>([]);
  const [recSpotify, setRecSpotify] = useState<SpotifySearchTrack[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recNote, setRecNote] = useState<string | null>(null);

  const tracksById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t])),
    [tracks]
  );

  const maxTracks = maxTandaSize(genre);
  const minTracks = minTandaSize(genre);
  const canSave =
    selected.length >= minTracks && selected.length <= maxTracks;

  const pool = tracksByGenre(genre).filter((t) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.artists.toLowerCase().includes(q) ||
      (t.orchestra ?? "").toLowerCase().includes(q)
    );
  });

  const filteredSaved = useMemo(
    () =>
      savedFilter === "all"
        ? tandas
        : tandas.filter((t) => t.genre === savedFilter),
    [tandas, savedFilter]
  );

  const sizeHint =
    selected.length < minTracks
      ? ` · need at least ${minTracks}`
      : selected.length > maxTracks
        ? ` · max ${maxTracks}`
        : "";

  const startNew = (keepGenre = true) => {
    setEditingId(null);
    setName("");
    if (!keepGenre) setGenre("tango");
    setSelected([]);
    setRecLibrary([]);
    setRecSpotify([]);
    setRecNote(null);
  };

  const startEdit = (tanda: Tanda) => {
    setEditingId(tanda.id);
    setName(tanda.name);
    setGenre(tanda.genre);
    setSelected([...tanda.trackIds]);
    setRecLibrary([]);
    setRecSpotify([]);
  };

  const toggleTrack = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxTracks) return prev;
      return [...prev, id];
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...selected];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setSelected(next);
  };

  const save = async () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const existing = editingId
      ? tandas.find((t) => t.id === editingId)
      : undefined;
    const others = editingId
      ? tandas.filter((t) => t.id !== editingId)
      : tandas;
    const resolvedName =
      name.trim() || nextUntitledTandaName(genre, others);
    const tanda: Tanda = {
      id: editingId ?? crypto.randomUUID(),
      name: resolvedName,
      genre,
      trackIds: selected,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertTanda(tanda);
    startNew();
  };

  const loadRecommendations = async () => {
    setRecLoading(true);
    setRecNote(null);
    try {
      const seeds = selected
        .map((id) => tracksById.get(id))
        .filter((t): t is Track => !!t);
      const token = await getValidToken();
      const result = await recommendForTanda({
        genre,
        seedTracks: seeds,
        library: tracks,
        excludeIds: new Set(selected),
        accessToken: token,
        limit: 10,
      });
      setRecLibrary(result.fromLibrary);
      setRecSpotify(result.fromSpotify);
      setRecNote(
        `Strict ${GENRE_LABELS[genre]} only — library matches + Spotify search with genre keywords.`
      );
    } catch (e) {
      setRecNote(e instanceof Error ? e.message : "Recommendations failed");
    } finally {
      setRecLoading(false);
    }
  };

  const addSpotifyRec = async (item: SpotifySearchTrack) => {
    if (selected.length >= maxTracks) return;
    const track = createSpotifyTrack(item, genre);
    const unique = dedupeTracksAgainstLibrary([track], tracks);
    const toUse = unique[0] ?? tracks.find((t) => t.spotifyId === item.id);
    if (!toUse) return;
    if (unique.length) await upsertTracks(unique);
    setSelected((prev) =>
      prev.includes(toUse.id) || prev.length >= maxTracks
        ? prev
        : [...prev, toUse.id]
    );
  };

  return (
    <AppShell>
      <div className="grid h-full min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-2">
        <section className="panel flex min-h-0 flex-col overflow-hidden p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">
                {editingId ? "Edit tanda" : "New tanda"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={() => startNew()}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGenre(g);
                    setSelected([]);
                    setRecLibrary([]);
                    setRecSpotify([]);
                  }}
                  className={`pill px-3 py-1.5 text-sm ${
                    genre === g
                      ? "bg-accent text-background"
                      : "bg-surface-2 text-muted hover:text-foreground"
                  }`}
                >
                  {GENRE_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <label className="mb-1 block text-xs text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder={`e.g. Di Sarli late night (or leave blank → Untitled ${genre} N)`}
            />

            <p
              className={`mb-3 truncate text-xs ${
                sizeHint ? "text-warn" : "text-muted"
              }`}
            >
              Selected {selected.length}/{maxTracks}
              {sizeHint}
            </p>

            {selected.length > 0 && (
              <ul className="mb-4 space-y-1">
                {selected.map((id, i) => {
                  const t = tracksById.get(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5 text-sm"
                    >
                      <span className="w-5 text-muted">{i + 1}</span>
                      <span className="flex-1 truncate">{t?.name ?? id}</span>
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTrack(id)}
                        className="text-xs text-bad"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {(recLibrary.length > 0 || recSpotify.length > 0 || recNote) && (
              <div className="mb-4 rounded-xl border border-border/80 bg-surface-2/50 p-3">
                <p className="mb-2 text-xs text-muted">{recNote}</p>
                {recLibrary.length > 0 && (
                  <>
                    <p className="mb-1 text-xs uppercase tracking-wide text-accent">
                      From your library
                    </p>
                    <ul className="mb-3 space-y-1">
                      {recLibrary.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => toggleTrack(t.id)}
                            className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface"
                          >
                            + {t.name}
                            <span className="ml-2 text-xs text-muted">
                              {t.orchestra || t.artists}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {recSpotify.length > 0 && (
                  <>
                    <p className="mb-1 text-xs uppercase tracking-wide text-accent">
                      From Spotify search
                    </p>
                    <ul className="space-y-1">
                      {recSpotify.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => void addSpotifyRec(r)}
                            className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface"
                          >
                            + {r.name}
                            <span className="ml-2 text-xs text-muted">
                              {r.artists.map((a) => a.name).join(", ")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filter ${GENRE_LABELS[genre]} library…`}
                className="mb-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <ul className="space-y-1">
                {pool.map((t: Track) => {
                  const on = selected.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => toggleTrack(t.id)}
                        className={`flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm ${
                          on
                            ? "bg-accent-soft text-accent"
                            : "hover:bg-surface-2"
                        }`}
                      >
                        <span className="mt-0.5 text-xs">{on ? "✓" : "+"}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {t.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {t.orchestra || t.artists || t.source}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {pool.length === 0 && (
                  <li className="text-sm text-muted">
                    No tracks in this genre yet — import a playlist in Library.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Sticky actions — always visible at bottom of panel */}
          <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => void loadRecommendations()}
              disabled={recLoading || selected.length === 0}
              className="pill border border-border px-4 py-2 text-sm hover:border-accent disabled:opacity-40"
            >
              {recLoading
                ? "Suggesting…"
                : `Suggest more ${GENRE_LABELS[genre]}`}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              className="pill bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent-hover disabled:opacity-40"
            >
              Save tanda
            </button>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Saved tandas ({filteredSaved.length}
              {savedFilter !== "all" ? ` / ${tandas.length}` : ""})
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["tango", "Tango"],
                  ["vals", "Vals"],
                  ["milonga", "Milonga"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSavedFilter(value)}
                  className={`pill px-2.5 py-1 text-xs ${
                    savedFilter === value
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredSaved.length === 0 ? (
            <p className="text-sm text-muted">
              {tandas.length === 0
                ? "No tandas yet."
                : `No ${savedFilter} tandas.`}
            </p>
          ) : (
            <ul className="tanda-card-stack min-h-0 flex-1 space-y-2">
              {filteredSaved.map((tanda, index) => {
                const issues = validateTanda(tanda, tracksById);
                return (
                  <li
                    key={tanda.id}
                    className="panel border-border/80 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                    style={{ zIndex: index + 1 }}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {tanda.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-muted">
                          {tanda.genre} · {tanda.trackIds.length} tracks
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(tanda)}
                          className="text-xs text-accent hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTanda(tanda.id)}
                          className="text-xs text-bad hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <ol className="space-y-0.5 text-xs text-muted">
                      {tanda.trackIds.map((id, i) => (
                        <li key={id} className="truncate">
                          {i + 1}. {tracksById.get(id)?.name ?? "Missing"}
                        </li>
                      ))}
                    </ol>
                    {issues.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-warn">
                        {issues[0].message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
