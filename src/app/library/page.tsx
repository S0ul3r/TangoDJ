"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useLibrary } from "@/context/LibraryContext";
import { useSpotify } from "@/context/SpotifyContext";
import { useSpotifyPlaylists } from "@/hooks/useSpotifyPlaylists";
import { parsePlaylistId, searchTracks } from "@/lib/spotify";
import {
  createSpotifyTrack,
  dedupeTracksAgainstLibrary,
} from "@/lib/tracks";
import type { Genre, SpotifySearchTrack, Track } from "@/types/domain";
import { GENRE_LABELS } from "@/types/domain";

const TABS: Genre[] = ["tango", "vals", "milonga", "cortina"];

export default function LibraryPage() {
  const {
    tracks,
    tracksByGenre,
    upsertTracks,
    deleteTracks,
    linkLocalFolder,
    importLocalFilesToGenre,
    importLocalFolderToGenre,
    supportsLocal,
    supportsFilePick,
    folderLinked,
  } = useLibrary();
  const { getValidToken } = useSpotify();
  const {
    playlists,
    loading: loadingPlaylists,
    error: playlistsError,
    importPlaylistTracks,
  } = useSpotifyPlaylists();

  const [genre, setGenre] = useState<Genre>("tango");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [orchestraEdit, setOrchestraEdit] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "warn">("ok");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const list = tracksByGenre(genre);
  const hasSelection = selectedIds.size > 0;
  const allSelected = list.length > 0 && selectedIds.size === list.length;

  const onSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setMessage(null);
    try {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      const items = await searchTracks(token, query.trim());
      setResults(items);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Search failed");
      setMessageTone("warn");
    } finally {
      setSearching(false);
    }
  };

  const addSpotifyTrack = async (item: SpotifySearchTrack) => {
    const track = createSpotifyTrack(item, genre);
    const unique = dedupeTracksAgainstLibrary([track], tracks);
    if (!unique.length) {
      setMessage(`“${item.name}” is already in your library.`);
      setMessageTone("warn");
      return;
    }
    await upsertTracks(unique);
    setMessage(`Added “${item.name}” to ${GENRE_LABELS[genre]}`);
    setMessageTone("ok");
  };

  const importPlaylist = async () => {
    const id = selectedPlaylistId || parsePlaylistId(playlistUrl);
    if (!id) {
      setMessage("Paste a Spotify playlist link or pick one from the list.");
      setMessageTone("warn");
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const items = await importPlaylistTracks(id);
      if (!items.length) {
        setMessage(
          "Spotify returned no tracks. You can only import playlists you own or collaborate on."
        );
        setMessageTone("warn");
        return;
      }
      const now = new Date().toISOString();
      const mapped = items.map((item) => createSpotifyTrack(item, genre, now));
      const unique = dedupeTracksAgainstLibrary(mapped, tracks);
      if (unique.length) await upsertTracks(unique);
      const skipped = mapped.length - unique.length;
      setMessage(
        `Imported ${unique.length} of ${mapped.length} track${mapped.length === 1 ? "" : "s"} into ${GENRE_LABELS[genre]}${
          skipped ? ` (${skipped} already in library)` : ""
        }.`
      );
      setMessageTone("ok");
      setPlaylistUrl("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Playlist import failed");
      setMessageTone("warn");
    } finally {
      setImporting(false);
    }
  };

  const saveOrchestra = async (track: Track) => {
    const value = orchestraEdit[track.id] ?? track.orchestra ?? "";
    await upsertTracks([
      {
        ...track,
        orchestra: value.trim() || null,
        updatedAt: new Date().toISOString(),
      },
    ]);
  };

  const onImportStructuredFolder = async () => {
    try {
      const n = await linkLocalFolder();
      setMessage(
        n > 0
          ? `Imported ${n} new local track${n === 1 ? "" : "s"} from structured library.`
          : "No new tracks found. Use folders named Tango / Vals / Milonga / Cortina, or import into the active genre below."
      );
      setMessageTone(n > 0 ? "ok" : "warn");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Folder import failed");
      setMessageTone("warn");
    }
  };

  const onImportFlatFolder = async () => {
    try {
      const n = await importLocalFolderToGenre(genre);
      setMessage(
        n > 0
          ? `Imported ${n} local file${n === 1 ? "" : "s"} into ${GENRE_LABELS[genre]}.`
          : "No audio files found in that folder."
      );
      setMessageTone(n > 0 ? "ok" : "warn");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Local folder import failed");
      setMessageTone("warn");
    }
  };

  const onImportLocalFiles = async () => {
    try {
      const n = await importLocalFilesToGenre(genre);
      setMessage(
        n > 0
          ? `Added ${n} local file${n === 1 ? "" : "s"} to ${GENRE_LABELS[genre]}.`
          : "No new files added."
      );
      setMessageTone(n > 0 ? "ok" : "warn");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "File import failed");
      setMessageTone("warn");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await deleteTracks(ids);
    setSelectedIds(new Set());
    setMessage(`Removed ${ids.length} track${ids.length === 1 ? "" : "s"}.`);
    setMessageTone("ok");
  };

  const moveSelectedToGenre = async (target: Genre) => {
    if (selectedIds.size === 0 || target === genre) return;
    const now = new Date().toISOString();
    const updates = list
      .filter((t) => selectedIds.has(t.id))
      .map((t) => ({ ...t, genre: target, updatedAt: now }));
    if (updates.length) await upsertTracks(updates);
    setSelectedIds(new Set());
    setMessage(
      `Moved ${updates.length} track${updates.length === 1 ? "" : "s"} to ${GENRE_LABELS[target]}.`
    );
    setMessageTone("ok");
  };

  const counts = useMemo(
    () =>
      Object.fromEntries(TABS.map((g) => [g, tracksByGenre(g).length])) as Record<
        Genre,
        number
      >,
    [tracksByGenre]
  );

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-muted">
            Link a playlist into the active category, search Spotify, or add
            local files.
          </p>
        </div>
        {supportsLocal && (
          <button
            type="button"
            onClick={() => void onImportStructuredFolder()}
            className="pill border border-border bg-surface/70 px-4 py-2 text-sm transition hover:border-accent hover:text-accent"
            title="Expects MyTango/Tango|Vals|Milonga|Cortina"
          >
            {folderLinked ? "Rescan structured library" : "Link structured library"}
          </button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              setGenre(g);
              setSelectedIds(new Set());
            }}
            className={`pill px-4 py-2 text-sm transition ${
              genre === g
                ? "bg-accent text-background"
                : "bg-surface/80 text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {GENRE_LABELS[g]}
            <span className="ml-2 opacity-70">{counts[g]}</span>
          </button>
        ))}
      </div>

      <section className="panel mb-6 p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Link Spotify playlist → {GENRE_LABELS[genre]}
        </h2>
        <p className="mb-3 text-xs text-muted">
          All tracks from the playlist are tagged as{" "}
          <strong className="text-foreground">{GENRE_LABELS[genre]}</strong>. Switch
          the tab above before importing vals / milonga / tango lists.
        </p>
        {playlistsError && (
          <p className="mb-2 text-xs text-warn">{playlistsError}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedPlaylistId}
            onChange={(e) => {
              setSelectedPlaylistId(e.target.value);
              if (e.target.value) setPlaylistUrl("");
            }}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            disabled={loadingPlaylists}
          >
            <option value="">
              {loadingPlaylists
                ? "Loading your playlists…"
                : "Pick one of your playlists"}
            </option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.tracksTotal > 0 ? ` (${p.tracksTotal})` : ""}
              </option>
            ))}
          </select>
          <input
            value={playlistUrl}
            onChange={(e) => {
              setPlaylistUrl(e.target.value);
              if (e.target.value) setSelectedPlaylistId("");
            }}
            placeholder="…or paste open.spotify.com/playlist/…"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void importPlaylist()}
            disabled={importing}
            className="pill shrink-0 bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent-hover disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import playlist"}
          </button>
        </div>
      </section>

      {(supportsLocal || supportsFilePick) && (
        <section className="panel mb-6 p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Add local files → {GENRE_LABELS[genre]}
          </h2>
          <p className="mb-3 text-xs text-muted">
            For a loose folder of MP3s (like cortina soundboard files), use these
            buttons — they tag everything as{" "}
            <strong className="text-foreground">{GENRE_LABELS[genre]}</strong>.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {supportsFilePick && (
              <button
                type="button"
                onClick={() => void onImportLocalFiles()}
                className="pill border border-border bg-surface-2 px-4 py-2 text-sm hover:border-accent"
              >
                Add local file(s)
              </button>
            )}
            {supportsLocal && (
              <button
                type="button"
                onClick={() => void onImportFlatFolder()}
                className="pill border border-border bg-surface-2 px-4 py-2 text-sm hover:border-accent"
              >
                Import folder into {GENRE_LABELS[genre]}
              </button>
            )}
          </div>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer text-foreground/80 hover:text-accent">
              Structured library layout (optional)
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2/80 p-3 text-[11px] leading-relaxed text-muted">
{`MyTango/
  Tango/     ← .mp3 / .flac / .wav …
  Vals/
  Milonga/
  Cortina/`}
            </pre>
            <p className="mt-2">
              Use <em>Link structured library</em> at the top for that layout.
              A flat folder like <code className="text-foreground">obiad/</code>{" "}
              with only MP3s should use <em>Import folder into {GENRE_LABELS[genre]}</em>{" "}
              instead.
            </p>
          </details>
        </section>
      )}

      <section className="panel mb-6 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Add single track from Spotify
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void onSearch()}
            placeholder={`Search Spotify for ${GENRE_LABELS[genre]}…`}
            className="min-w-[240px] flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void onSearch()}
            disabled={searching}
            className="pill bg-surface-2 px-4 py-2 text-sm font-medium text-foreground hover:bg-border disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/80 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted">
                    {r.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void addSpotifyTrack(r)}
                  className="shrink-0 text-sm text-accent hover:text-accent-hover"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && (
        <p
          className={`mb-4 text-sm ${
            messageTone === "warn" ? "text-warn" : "text-accent"
          }`}
        >
          {message}
        </p>
      )}

      <section>
        {/* Fixed-height toolbar so the list does not jump when selection changes */}
        <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {GENRE_LABELS[genre]} tracks ({list.length})
          </h2>
          {list.length > 0 && (
            <div className="flex min-h-8 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    allSelected ? new Set() : new Set(list.map((t) => t.id))
                  )
                }
                className="text-xs text-muted hover:text-foreground"
              >
                {hasSelection ? "Unselect all" : "Select all"}
              </button>
              <select
                value=""
                disabled={!hasSelection}
                onChange={(e) => {
                  const g = e.target.value as Genre;
                  if (g) void moveSelectedToGenre(g);
                  e.target.value = "";
                }}
                className="h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Move selected tracks"
              >
                <option value="">Move to…</option>
                {TABS.filter((g) => g !== genre).map((g) => (
                  <option key={g} value={g}>
                    {GENRE_LABELS[g]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!hasSelection}
                onClick={() => void deleteSelected()}
                className="pill h-8 border border-bad/50 px-3 text-xs text-bad hover:bg-bad/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete selected{hasSelection ? ` (${selectedIds.size})` : ""}
              </button>
            </div>
          )}
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing here yet — import a playlist, local folder, or search to add
            tracks.
          </p>
        ) : (
          <ul className="panel divide-y divide-border overflow-hidden">
            {list.map((track) => {
              const selected = selectedIds.has(track.id);
              return (
                <li
                  key={track.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors ${
                    selected ? "bg-accent-soft" : "hover:bg-surface-2/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(track.id)}
                    aria-label={`Select ${track.name}`}
                    className="accent-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{track.name}</p>
                    <p className="text-xs text-muted">
                      {track.artists || track.localRelPath || "—"} ·{" "}
                      <span className="uppercase">{track.source}</span>
                      {track.orchestra ? ` · ${track.orchestra}` : ""}
                    </p>
                  </div>
                  <select
                    value={track.genre}
                    onChange={(e) => {
                      const g = e.target.value as Genre;
                      void upsertTracks([
                        {
                          ...track,
                          genre: g,
                          updatedAt: new Date().toISOString(),
                        },
                      ]);
                    }}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
                    aria-label="Genre"
                  >
                    {TABS.map((g) => (
                      <option key={g} value={g}>
                        {GENRE_LABELS[g]}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Orchestra"
                    title="Orchestra / ensemble name (e.g. Di Sarli, Pugliese) — used for tanda suggestions"
                    value={orchestraEdit[track.id] ?? track.orchestra ?? ""}
                    onChange={(e) =>
                      setOrchestraEdit((prev) => ({
                        ...prev,
                        [track.id]: e.target.value,
                      }))
                    }
                    onBlur={() => void saveOrchestra(track)}
                    className="w-36 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void deleteTracks([track.id]);
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(track.id);
                        return next;
                      });
                    }}
                    className="text-xs text-bad hover:underline"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted">
          <strong className="font-medium text-foreground/70">Orchestra</strong>{" "}
          = optional tag for the orchestra/ensemble (Di Sarli, Pugliese, …). Helps
          tanda recommendations group similar vibes — not required for playback.
        </p>
      </section>
    </AppShell>
  );
}
