"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LibraryImportPanel } from "@/components/library/LibraryImportPanel";
import { useLibrary } from "@/context/LibraryContext";
import { useSpotify } from "@/context/SpotifyContext";
import { useSpotifyPlaylists } from "@/hooks/useSpotifyPlaylists";
import { LIBRARY_IMPORT_OPEN_KEY } from "@/lib/constants";
import type { Genre, Track } from "@/types/domain";
import { GENRE_LABELS } from "@/types/domain";

const TABS: Genre[] = ["tango", "vals", "milonga", "cortina"];

export default function LibraryPage() {
  const {
    tracks,
    tracksByGenre,
    upsertTracks,
    deleteTracks,
    linkLocalFolder,
    importLocalFolderToGenre,
    supportsLocal,
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
  const [orchestraEdit, setOrchestraEdit] = useState<Record<string, string>>({});
  const [yearEdit, setYearEdit] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "warn">("ok");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // null until localStorage preference is read — avoids hide animation on remount
  const [importOpen, setImportOpen] = useState<boolean | null>(null);
  const [importCanAnimate, setImportCanAnimate] = useState(false);

  useEffect(() => {
    let open = true;
    try {
      const stored = localStorage.getItem(LIBRARY_IMPORT_OPEN_KEY);
      if (stored === "0") open = false;
      else if (stored === "1") open = true;
    } catch {
      /* ignore */
    }
    setImportOpen(open);
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setImportCanAnimate(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  const isImportOpen = importOpen === true;

  const setImportOpenPersist = (open: boolean) => {
    setImportCanAnimate(true);
    setImportOpen(open);
    try {
      localStorage.setItem(LIBRARY_IMPORT_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const list = tracksByGenre(genre);
  const hasSelection = selectedIds.size > 0;
  const allSelected = list.length > 0 && selectedIds.size === list.length;

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

  const saveYear = async (track: Track) => {
    const raw = yearEdit[track.id] ?? (track.year != null ? String(track.year) : "");
    const trimmed = raw.trim();
    let year: number | null = null;
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 1800 || n > 2100) return;
      year = Math.round(n);
    }
    if (year === track.year) return;
    await upsertTracks([
      {
        ...track,
        year,
        updatedAt: new Date().toISOString(),
      },
    ]);
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
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
        <button
          type="button"
          onClick={() => setImportOpenPersist(!isImportOpen)}
          className="pill inline-flex items-center gap-1.5 border border-border bg-surface/70 px-3.5 py-2 text-sm text-muted transition hover:border-accent hover:text-accent"
          aria-expanded={isImportOpen}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 shrink-0 ${
              importCanAnimate ? "transition-transform duration-300 ease-out" : ""
            } ${isImportOpen ? "" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.5 8 5.5l5 5" />
          </svg>
          {isImportOpen ? "Hide import tools" : "Show import tools"}
        </button>
      </div>

      <LibraryImportPanel
        genre={genre}
        isOpen={isImportOpen}
        canAnimate={importCanAnimate}
        tracks={tracks}
        supportsLocal={supportsLocal}
        folderLinked={folderLinked}
        playlists={playlists}
        loadingPlaylists={loadingPlaylists}
        playlistsError={playlistsError}
        importPlaylistTracks={importPlaylistTracks}
        getValidToken={getValidToken}
        upsertTracks={upsertTracks}
        linkLocalFolder={linkLocalFolder}
        importLocalFolderToGenre={importLocalFolderToGenre}
        onMessage={(msg, tone) => {
          setMessage(msg);
          setMessageTone(tone);
        }}
      />

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
                      {track.year != null ? ` · ${track.year}` : ""}
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
                  <input
                    placeholder="Year"
                    inputMode="numeric"
                    title="Recording / album year — used for tanda suggestions"
                    value={
                      yearEdit[track.id] ??
                      (track.year != null ? String(track.year) : "")
                    }
                    onChange={(e) =>
                      setYearEdit((prev) => ({
                        ...prev,
                        [track.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 4),
                      }))
                    }
                    onBlur={() => void saveYear(track)}
                    className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent"
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
          <strong className="font-medium text-foreground/70">Orchestra</strong> and{" "}
          <strong className="font-medium text-foreground/70">Year</strong>{" "}
          help tanda suggestions group by ensemble and era. Spotify imports fill
          these when possible — you can edit anytime. Not required for playback.
        </p>
      </section>
    </AppShell>
  );
}
