"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useLibrary } from "@/context/LibraryContext";
import { useSpotify } from "@/context/SpotifyContext";
import { expectedTandaSize, validateTanda } from "@/lib/domain/tanda";
import { recommendForTanda } from "@/lib/domain/recommendations";
import {
  createSpotifyTrack,
  dedupeTracksAgainstLibrary,
} from "@/lib/tracks";
import type { SpotifySearchTrack, Tanda, TandaGenre, Track } from "@/types/domain";
import { GENRE_LABELS, TANDA_SIZE_HINT } from "@/types/domain";

const GENRES: TandaGenre[] = ["tango", "vals", "milonga"];

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
  const [recLibrary, setRecLibrary] = useState<Track[]>([]);
  const [recSpotify, setRecSpotify] = useState<SpotifySearchTrack[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recNote, setRecNote] = useState<string | null>(null);

  const tracksById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t])),
    [tracks]
  );

  const pool = tracksByGenre(genre).filter((t) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.artists.toLowerCase().includes(q) ||
      (t.orchestra ?? "").toLowerCase().includes(q)
    );
  });

  const draftIssues = validateTanda(
    { name, genre, trackIds: selected },
    tracksById
  );

  const startNew = () => {
    setEditingId(null);
    setName("");
    setGenre("tango");
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
      if (prev.length >= 4) return prev;
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
    const now = new Date().toISOString();
    const existing = editingId
      ? tandas.find((t) => t.id === editingId)
      : undefined;
    const tanda: Tanda = {
      id: editingId ?? crypto.randomUUID(),
      name: name.trim() || `Untitled ${genre}`,
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
    if (selected.length >= 4) return;
    const track = createSpotifyTrack(item, genre);
    const unique = dedupeTracksAgainstLibrary([track], tracks);
    const toUse = unique[0] ?? tracks.find((t) => t.spotifyId === item.id);
    if (!toUse) return;
    if (unique.length) await upsertTracks(unique);
    setSelected((prev) =>
      prev.includes(toUse.id) || prev.length >= 4 ? prev : [...prev, toUse.id]
    );
  };

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Tandas</h1>
        <p className="mt-1 text-muted">
          Pre-approve 3–4 tracks of one genre. Hint: {TANDA_SIZE_HINT.tango}{" "}
          tango / {TANDA_SIZE_HINT.vals} vals or milonga. Recommendations never
          cross genres.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">
              {editingId ? "Edit tanda" : "New tanda"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={startNew}
                className="text-xs text-muted hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          <label className="mb-1 block text-xs text-muted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="e.g. Di Sarli late night"
          />

          <label className="mb-1 block text-xs text-muted">Genre</label>
          <div className="mb-3 flex gap-2">
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

          <p className="mb-2 text-xs text-muted">
            Selected {selected.length}/{expectedTandaSize(genre)} (max 4)
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
                    <button type="button" onClick={() => move(i, -1)} className="text-xs text-muted hover:text-foreground">
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, 1)} className="text-xs text-muted hover:text-foreground">
                      ↓
                    </button>
                    <button type="button" onClick={() => toggleTrack(id)} className="text-xs text-bad">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {draftIssues.length > 0 && (
            <ul className="mb-3 space-y-1 text-xs text-warn">
              {draftIssues.map((issue, i) => (
                <li key={`${issue.code}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={selected.length < 3}
              className="pill bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent-hover disabled:opacity-40"
            >
              Save tanda
            </button>
            <button
              type="button"
              onClick={() => void loadRecommendations()}
              disabled={recLoading || selected.length === 0}
              className="pill border border-border px-4 py-2 text-sm hover:border-accent disabled:opacity-40"
            >
              {recLoading ? "Suggesting…" : `Suggest more ${GENRE_LABELS[genre]}`}
            </button>
          </div>

          {(recLibrary.length > 0 || recSpotify.length > 0 || recNote) && (
            <div className="mb-6 rounded-xl border border-border/80 bg-surface-2/50 p-3">
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
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {pool.map((t: Track) => {
                const on = selected.includes(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggleTrack(t.id)}
                      className={`flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm ${
                        on ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
                      }`}
                    >
                      <span className="mt-0.5 text-xs">{on ? "✓" : "+"}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.name}</span>
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
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Saved tandas ({tandas.length})</h2>
          {tandas.length === 0 ? (
            <p className="text-sm text-muted">No tandas yet.</p>
          ) : (
            <ul className="space-y-3">
              {tandas.map((tanda) => {
                const issues = validateTanda(tanda, tracksById).filter(
                  (i) => i.code !== "tanda_size_hint"
                );
                return (
                  <li key={tanda.id} className="panel p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{tanda.name}</p>
                        <p className="text-xs uppercase tracking-wide text-muted">
                          {tanda.genre} · {tanda.trackIds.length} tracks
                        </p>
                      </div>
                      <div className="flex gap-2">
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
                    <ol className="list-decimal space-y-0.5 pl-4 text-sm text-muted">
                      {tanda.trackIds.map((id) => (
                        <li key={id}>{tracksById.get(id)?.name ?? "Missing"}</li>
                      ))}
                    </ol>
                    {issues.length > 0 && (
                      <p className="mt-2 text-xs text-warn">{issues[0].message}</p>
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
