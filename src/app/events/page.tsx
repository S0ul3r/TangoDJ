"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EventQueueList } from "@/components/events/EventQueueList";
import { QueueValidationBanner } from "@/components/events/QueueValidationBanner";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayback } from "@/context/PlaybackContext";
import { buildSetlistLines, labelForQueueItem } from "@/lib/domain/eventLabels";
import {
  autoGenerateNight,
  pickUnusedCortina,
  validateQueue,
} from "@/lib/domain/sequencing";
import type {
  EventQueueItem,
  MilongaEvent,
  SectionMarkerKind,
  TandaGenre,
} from "@/types/domain";
import { SECTION_MARKER_LABELS } from "@/types/domain";

const AUTO_CORTINA_KEY = "tangodj.autoAddCortina";
const HISTORY_LIMIT = 40;

function readAutoCortina(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(AUTO_CORTINA_KEY);
  if (raw === null) return true;
  return raw === "1";
}

function lastNonMarker(queue: EventQueueItem[]): EventQueueItem | undefined {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].type !== "marker") return queue[i];
  }
  return undefined;
}

export default function EventsPage() {
  const router = useRouter();
  const { tracks, tandas, events, upsertEvent, deleteEvent, tracksByGenre } =
    useLibrary();
  const { loadEventQueue } = usePlayback();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [name, setName] = useState("Tonight");
  const [items, setItems] = useState<EventQueueItem[]>([]);
  const [history, setHistory] = useState<EventQueueItem[][]>([]);
  const [maxTandas, setMaxTandas] = useState(12);
  const [autoAddCortina, setAutoAddCortina] = useState(readAutoCortina);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const tracksById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t])),
    [tracks]
  );
  const tandasById = useMemo(
    () => new Map(tandas.map((t) => [t.id, t])),
    [tandas]
  );

  const validation = validateQueue(items, tandasById, tracksById);
  const cortinas = tracksByGenre("cortina");

  const usedTandaIds = useMemo(
    () =>
      new Set(
        items
          .filter((i) => i.type === "tanda" && i.tandaId)
          .map((i) => i.tandaId as string)
      ),
    [items]
  );

  const usedCortinaIds = useMemo(
    () =>
      new Set(
        items
          .filter((i) => i.type === "cortina" && i.trackId)
          .map((i) => i.trackId as string)
      ),
    [items]
  );

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const commitItems = useCallback(
    (updater: (prev: EventQueueItem[]) => EventQueueItem[]) => {
      setItems((prev) => {
        setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), prev]);
        return updater(prev);
      });
    },
    []
  );

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setItems(prev);
      return h.slice(0, -1);
    });
  };

  const setAutoCortina = (on: boolean) => {
    setAutoAddCortina(on);
    localStorage.setItem(AUTO_CORTINA_KEY, on ? "1" : "0");
  };

  const startNew = () => {
    setEditingId(null);
    setShareToken(null);
    setName("Tonight");
    setHistory([]);
    setItems([]);
  };

  const loadSaved = (event: MilongaEvent) => {
    setEditingId(event.id);
    setShareToken(event.shareToken ?? null);
    setName(event.name);
    commitItems(() => event.items.map((i) => ({ ...i })));
  };

  const appendTrailingCortinaIfNeeded = (
    queue: EventQueueItem[]
  ): EventQueueItem[] => {
    if (!autoAddCortina) return queue;
    const next = [...queue];
    const last = lastNonMarker(next);
    if (last?.type === "tanda") {
      const cortina = pickUnusedCortina(cortinas, next);
      if (cortina) {
        next.push({
          id: crypto.randomUUID(),
          type: "cortina",
          trackId: cortina.id,
        });
      }
    }
    return next;
  };

  const addTanda = (tandaId: string) => {
    commitItems((prev) => {
      const next = appendTrailingCortinaIfNeeded([...prev]);
      next.push({ id: crypto.randomUUID(), type: "tanda", tandaId });
      if (autoAddCortina) {
        const cortina = pickUnusedCortina(cortinas, next);
        if (cortina) {
          next.push({
            id: crypto.randomUUID(),
            type: "cortina",
            trackId: cortina.id,
          });
        } else if (cortinas.length === 0) {
          queueMicrotask(() =>
            showNotice("Tanda added — add cortinas in Library to auto-attach.")
          );
        }
      }
      return next;
    });
  };

  const addCortina = (trackId: string) => {
    const last = lastNonMarker(items);
    if (last?.type === "cortina") {
      showNotice(
        "Cannot add cortina: the queue already ends with a cortina. Add a tanda first (pattern is tanda → cortina)."
      );
      return;
    }
    if (!last) {
      showNotice("Cannot add cortina: the queue should start with a tanda.");
      return;
    }
    commitItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: "cortina", trackId },
    ]);
  };

  const addMarker = (kind: SectionMarkerKind) => {
    commitItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "marker",
        markerKind: kind,
        label: SECTION_MARKER_LABELS[kind],
      },
    ]);
  };

  const removeAt = (index: number) => {
    commitItems((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    commitItems((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    commitItems((prev) => {
      if (from >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      const insertAt = from < to ? to - 1 : to;
      next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, moved);
      return next;
    });
  };

  const autoFill = () => {
    const generated = autoGenerateNight(tandas, cortinas, { maxTandas });
    commitItems(() => generated);
  };

  const save = async () => {
    const now = new Date().toISOString();
    const existing = editingId
      ? events.find((e) => e.id === editingId)
      : undefined;
    const event: MilongaEvent = {
      id: editingId ?? crypto.randomUUID(),
      name: name.trim() || "Untitled milonga",
      items,
      shareToken: shareToken ?? existing?.shareToken ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const saved = await upsertEvent(event);
    setEditingId(saved.id);
    if (saved.shareToken) setShareToken(saved.shareToken);
    showNotice("Event saved.");
  };

  const ensureShareAndCopy = async () => {
    if (!editingId) {
      showNotice("Save the event first to create a share link.");
      return;
    }
    let token = shareToken;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "").slice(0, 22);
      const now = new Date().toISOString();
      const existing = events.find((e) => e.id === editingId);
      const saved = await upsertEvent({
        id: editingId,
        name: name.trim() || "Untitled milonga",
        items,
        shareToken: token,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      token = saved.shareToken ?? token;
      setShareToken(token);
    }
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotice("Share link copied.");
    } catch {
      showNotice(url);
    }
  };

  const exportPdf = () => {
    window.print();
  };

  const sendToDj = () => {
    loadEventQueue(items);
    router.push("/dj");
  };

  const labelFor = (item: EventQueueItem) =>
    labelForQueueItem(item, tandasById, tracksById);

  const setlistLines = useMemo(
    () => buildSetlistLines(items, tandasById, tracksById),
    [items, tandasById, tracksById]
  );

  const tandasByGenre = (g: TandaGenre) =>
    tandas.filter((t) => t.genre === g);

  const onDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const onDragOverGap = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  };

  const onDropGap = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isFinite(from)) reorder(from, index);
    setDragIndex(null);
    setDropIndex(null);
  };

  const onDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {notice ? (
          <p className="text-sm text-warn">{notice}</p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            className="text-sm text-muted hover:text-foreground disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={startNew}
            className="text-sm text-muted hover:text-foreground"
          >
            New event
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] print:hidden">
        <section className="rounded border border-border bg-surface/50 p-4">
          <label className="mb-1 block text-xs text-muted">Event name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-xs text-muted">Auto-generate</label>
            <input
              type="number"
              min={4}
              max={24}
              value={maxTandas}
              onChange={(e) => setMaxTandas(Number(e.target.value) || 12)}
              className="w-16 rounded border border-border bg-surface-2 px-2 py-1 text-sm"
            />
            <span className="text-xs text-muted">tandas</span>
            <button
              type="button"
              onClick={autoFill}
              className="rounded border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
            >
              Fill from pool
            </button>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={autoAddCortina}
                onChange={(e) => setAutoCortina(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Auto-add cortina with tanda
            </label>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <span className="self-center text-xs text-muted">Sections:</span>
            {(
              ["first_half", "snack", "second_half"] as SectionMarkerKind[]
            ).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => addMarker(kind)}
                className="rounded border border-dashed border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
              >
                + {SECTION_MARKER_LABELS[kind]}
              </button>
            ))}
          </div>

          <EventQueueList
            items={items}
            labelFor={labelFor}
            dragIndex={dragIndex}
            dropIndex={dropIndex}
            onDragStart={onDragStart}
            onDragOverGap={onDragOverGap}
            onDropGap={onDropGap}
            onDragEnd={onDragEnd}
            onSetDropIndex={setDropIndex}
            onMove={move}
            onRemove={removeAt}
          />

          <QueueValidationBanner validation={validation} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Save event
            </button>
            <button
              type="button"
              onClick={sendToDj}
              disabled={items.length === 0}
              className="rounded border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-40"
            >
              Load in DJ view
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={items.length === 0}
              className="rounded border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-40"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={() => void ensureShareAndCopy()}
              className="rounded border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent"
            >
              Copy share link
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Add tanda
            </h2>
            {(["tango", "vals", "milonga"] as TandaGenre[]).map((g) => (
              <div key={g} className="mb-3">
                <p className="mb-1 text-xs uppercase text-muted">{g}</p>
                <ul className="space-y-1">
                  {tandasByGenre(g).map((t) => {
                    const alreadyIn = usedTandaIds.has(t.id);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => addTanda(t.id)}
                          className="flex w-full items-center gap-2 rounded bg-surface px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft text-xs font-semibold text-accent">
                            +
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {t.name}
                          </span>
                          {alreadyIn && (
                            <span
                              className="shrink-0 text-[10px] uppercase tracking-wide text-warn"
                              title="This tanda is already in the event"
                            >
                              ⚠ in event
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {tandasByGenre(g).length === 0 && (
                    <li className="text-xs text-muted">None</li>
                  )}
                </ul>
              </div>
            ))}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Add cortina
            </h2>
            <p className="mb-2 text-[11px] text-muted">
              Auto-add rotates unused cortinas first, then least-used.
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {cortinas.map((c) => {
                const used = usedCortinaIds.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => addCortina(c.id)}
                      className="flex w-full items-center gap-2 rounded bg-surface px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft text-xs font-semibold text-accent">
                        +
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {used && (
                        <span className="shrink-0 text-[10px] text-muted">
                          in event
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {cortinas.length === 0 && (
                <li className="text-xs text-muted">Add cortinas in Library.</li>
              )}
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Saved events
            </h2>
            <ul className="space-y-2">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-surface/40 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => loadSaved(event)}
                    className="min-w-0 flex-1 text-left text-sm hover:text-accent"
                  >
                    <span className="block truncate font-medium">
                      {event.name}
                    </span>
                    <span className="text-xs text-muted">
                      {event.items.length} items
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteEvent(event.id)}
                    className="text-xs text-bad"
                  >
                    Delete
                  </button>
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-sm text-muted">No saved nights yet.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>

      {/* Printable setlist — visible only when printing */}
      <div
        ref={printRef}
        className="hidden print:block print:bg-white print:p-8 print:text-black"
      >
        <h1 className="mb-1 text-2xl font-semibold">{name || "Milonga"}</h1>
        <p className="mb-6 text-sm opacity-70">
          Setlist · {setlistLines.filter((l) => l.kind === "tanda").length}{" "}
          tandas
        </p>
        <ul className="space-y-1 text-sm leading-relaxed">
          {setlistLines.map((line, i) => (
            <li
              key={`${line.kind}-${i}`}
              className={
                line.kind === "marker"
                  ? "mt-4 border-t border-black/20 pt-3 text-xs font-semibold uppercase tracking-wide"
                  : line.kind === "tanda"
                    ? "mt-2 font-semibold"
                    : line.kind === "cortina"
                      ? "italic opacity-70"
                      : ""
              }
            >
              {line.text}
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
