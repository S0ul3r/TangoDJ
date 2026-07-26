"use client";

import { useState } from "react";
import {
  parsePlaylistId,
  searchTracks,
  type SpotifyPlaylistSummary,
} from "@/lib/spotify";
import {
  createSpotifyTrack,
  dedupeTracksAgainstLibrary,
} from "@/lib/tracks";
import type { Genre, SpotifySearchTrack, Track } from "@/types/domain";
import { GENRE_LABELS } from "@/types/domain";

interface LibraryImportPanelProps {
  genre: Genre;
  isOpen: boolean;
  canAnimate: boolean;
  tracks: Track[];
  supportsLocal: boolean;
  folderLinked: boolean;
  playlists: SpotifyPlaylistSummary[];
  loadingPlaylists: boolean;
  playlistsError: string | null;
  importPlaylistTracks: (id: string) => Promise<SpotifySearchTrack[]>;
  getValidToken: () => Promise<string | null>;
  upsertTracks: (tracks: Track[]) => Promise<void>;
  linkLocalFolder: () => Promise<number>;
  importLocalFolderToGenre: (genre: Genre) => Promise<number>;
  onMessage: (message: string, tone: "ok" | "warn") => void;
}

export function LibraryImportPanel({
  genre,
  isOpen,
  canAnimate,
  tracks,
  supportsLocal,
  folderLinked,
  playlists,
  loadingPlaylists,
  playlistsError,
  importPlaylistTracks,
  getValidToken,
  upsertTracks,
  linkLocalFolder,
  importLocalFolderToGenre,
  onMessage,
}: LibraryImportPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [importing, setImporting] = useState(false);

  const onSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      const items = await searchTracks(token, query.trim());
      setResults(items);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Search failed", "warn");
    } finally {
      setSearching(false);
    }
  };

  const addSpotifyTrack = async (item: SpotifySearchTrack) => {
    const track = createSpotifyTrack(item, genre);
    const unique = dedupeTracksAgainstLibrary([track], tracks);
    if (!unique.length) {
      onMessage(`“${item.name}” is already in your library.`, "warn");
      return;
    }
    await upsertTracks(unique);
    onMessage(`Added “${item.name}” to ${GENRE_LABELS[genre]}`, "ok");
  };

  const importPlaylist = async () => {
    const id = selectedPlaylistId || parsePlaylistId(playlistUrl);
    if (!id) {
      onMessage(
        "Paste a Spotify playlist link or pick one from the list.",
        "warn"
      );
      return;
    }
    setImporting(true);
    try {
      const items = await importPlaylistTracks(id);
      if (!items.length) {
        onMessage(
          "Spotify returned no tracks. You can only import playlists you own or collaborate on.",
          "warn"
        );
        return;
      }
      const now = new Date().toISOString();
      const mapped = items.map((item) => createSpotifyTrack(item, genre, now));
      const unique = dedupeTracksAgainstLibrary(mapped, tracks);
      if (unique.length) await upsertTracks(unique);
      const skipped = mapped.length - unique.length;
      onMessage(
        `Imported ${unique.length} of ${mapped.length} track${mapped.length === 1 ? "" : "s"} into ${GENRE_LABELS[genre]}${
          skipped ? ` (${skipped} already in library)` : ""
        }.`,
        "ok"
      );
      setPlaylistUrl("");
    } catch (e) {
      onMessage(
        e instanceof Error ? e.message : "Playlist import failed",
        "warn"
      );
    } finally {
      setImporting(false);
    }
  };

  const onImportStructuredFolder = async () => {
    try {
      const n = await linkLocalFolder();
      onMessage(
        n > 0
          ? `Imported ${n} new local track${n === 1 ? "" : "s"} from structured library.`
          : "No new tracks found. Use folders named Tango / Vals / Milonga / Cortina, or import into the active genre below.",
        n > 0 ? "ok" : "warn"
      );
    } catch (e) {
      onMessage(
        e instanceof Error ? e.message : "Folder import failed",
        "warn"
      );
    }
  };

  const onImportFlatFolder = async () => {
    try {
      const n = await importLocalFolderToGenre(genre);
      onMessage(
        n > 0
          ? `Imported ${n} local file${n === 1 ? "" : "s"} into ${GENRE_LABELS[genre]}.`
          : "No audio files found in that folder.",
        n > 0 ? "ok" : "warn"
      );
    } catch (e) {
      onMessage(
        e instanceof Error ? e.message : "Local folder import failed",
        "warn"
      );
    }
  };

  return (
    <div
      className={`collapse-panel ${isOpen ? "is-open" : ""} ${
        canAnimate ? "can-animate" : ""
      }`}
      aria-hidden={!isOpen}
    >
      <div className="collapse-panel-inner">
        <div className="space-y-6">
          <section className="panel p-4">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
              Link Spotify playlist → {GENRE_LABELS[genre]}
            </h2>
            <p className="mb-3 text-xs text-muted">
              All tracks from the playlist are tagged as{" "}
              <strong className="text-foreground">{GENRE_LABELS[genre]}</strong>.
              Switch the tab above before importing vals / milonga / tango
              lists.
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

          {supportsLocal && (
            <section className="panel p-4">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
                Add local files → {GENRE_LABELS[genre]}
              </h2>
              <p className="mb-3 text-xs text-muted">
                Import a folder of MP3s into{" "}
                <strong className="text-foreground">
                  {GENRE_LABELS[genre]}
                </strong>
                , or link a structured library that already has genre
                subfolders.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onImportFlatFolder()}
                  className="pill border border-border bg-surface-2 px-4 py-2 text-sm hover:border-accent"
                >
                  Import folder
                </button>
                <button
                  type="button"
                  onClick={() => void onImportStructuredFolder()}
                  className="pill border border-border bg-surface/70 px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-accent"
                  title="Expects MyTango/Tango|Vals|Milonga|Cortina"
                >
                  {folderLinked
                    ? "Rescan structured library"
                    : "Link structured library"}
                </button>
              </div>
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer text-foreground/80 hover:text-accent">
                  What is a structured library?
                </summary>
                <p className="mt-2">
                  Optional: one root folder with genre subfolders. Genres come
                  from folder names (not the active tab):
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2/80 p-3 text-[11px] leading-relaxed text-muted">
{`MyTango/
  Tango/
  Vals/
  Milonga/
  Cortina/`}
                </pre>
              </details>
            </section>
          )}

          <section className="panel p-4">
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
        </div>
      </div>
    </div>
  );
}
