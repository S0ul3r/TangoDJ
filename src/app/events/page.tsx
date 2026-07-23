"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayback } from "@/context/PlaybackContext";
import {
  autoGenerateNight,
  pickUnusedCortina,
  validateQueue,
} from "@/lib/domain/sequencing";
import type {
  EventQueueItem,
  MilongaEvent,
  TandaGenre,
} from "@/types/domain";

const AUTO_CORTINA_KEY = "tangodj.autoAddCortina";

function readAutoCortina(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(AUTO_CORTINA_KEY);
  if (raw === null) return true;
  return raw === "1";
}

export default function EventsPage() {
  const router = useRouter();
  const { tracks, tandas, events, upsertEvent, deleteEvent, tracksByGenre } =
    useLibrary();
  const { loadEventQueue } = usePlayback();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("Tonight");
  const [items, setItems] = useState<EventQueueItem[]>([]);
  const [maxTandas, setMaxTandas] = useState(12);
  const [autoAddCortina, setAutoAddCortina] = useState(readAutoCortina);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

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

  const setAutoCortina = (on: boolean) => {
    setAutoAddCortina(on);
    localStorage.setItem(AUTO_CORTINA_KEY, on ? "1" : "0");
  };

  const startNew = () => {
    setEditingId(null);
    setName("Tonight");
    setItems([]);
  };

  const loadSaved = (event: MilongaEvent) => {
    setEditingId(event.id);
    setName(event.name);
    setItems(event.items.map((i) => ({ ...i })));
  };

  const appendTrailingCortinaIfNeeded = (
    queue: EventQueueItem[]
  ): EventQueueItem[] => {
    if (!autoAddCortina) return queue;
    const next = [...queue];
    const last = next[next.length - 1];
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
    setItems((prev) => {
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
        } else if (cortinas.length > 0) {
          queueMicrotask(() =>
            showNotice(
              "Tanda added, but no unused cortina left to auto-attach."
            )
          );
        }
      }
      return next;
    });
  };

  const addCortina = (trackId: string) => {
    const last = items[items.length - 1];
    if (last?.type === "cortina") {
      showNotice(
        "Cannot add cortina: the queue already ends with a cortina. Add a tanda first (pattern is tanda → cortina)."
      );
      return;
    }
    if (items.length === 0) {
      showNotice("Cannot add cortina: the queue should start with a tanda.");
      return;
    }
    if (items.some((i) => i.type === "cortina" && i.trackId === trackId)) {
      showNotice(
        "Cannot add cortina: that song is already used in this event."
      );
      return;
    }
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: "cortina", trackId },
    ]);
  };

  const removeAt = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setItems((prev) => {
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
    setItems(generated);
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
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertEvent(event);
    setEditingId(event.id);
  };

  const sendToDj = () => {
    loadEventQueue(items);
    router.push("/dj");
  };

  const labelFor = (item: EventQueueItem) => {
    if (item.type === "tanda") {
      const t = item.tandaId ? tandasById.get(item.tandaId) : null;
      return t
        ? `Tanda · ${t.name} (${t.genre})`
        : "Tanda · missing";
    }
    const track = item.trackId ? tracksById.get(item.trackId) : null;
    return track ? `Cortina · ${track.name}` : "Cortina · missing";
  };

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {notice ? (
          <p className="text-sm text-warn">{notice}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={startNew}
          className="text-sm text-muted hover:text-foreground"
        >
          New event
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
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

          <ul className="mb-4 min-h-[200px]">
            {items.length === 0 && (
              <li className="text-sm text-muted">Queue is empty.</li>
            )}
            {items.map((item, index) => (
              <li key={item.id} className="list-none">
                <div
                  className={`queue-drop-gap ${
                    dropIndex === index && dragIndex !== null ? "is-active" : ""
                  }`}
                  onDragOver={onDragOverGap(index)}
                  onDrop={onDropGap(index)}
                />
                <div
                  draggable
                  onDragStart={onDragStart(index)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    setDropIndex(e.clientY < mid ? index : index + 1);
                  }}
                  className={`queue-row flex items-center gap-1 rounded bg-surface-2 px-3 py-1.5 text-sm ${
                    dragIndex === index ? "is-dragging" : ""
                  }`}
                >
                  <span
                    className="mr-1 select-none text-muted"
                    title="Drag to reorder"
                    aria-hidden
                  >
                    ⋮⋮
                  </span>
                  <span className="w-6 text-xs text-muted">{index + 1}</span>
                  <span
                    className={`flex-1 truncate ${
                      item.type === "cortina" ? "text-muted" : "font-medium"
                    }`}
                  >
                    {labelFor(item)}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded text-base text-muted hover:bg-surface hover:text-foreground"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded text-base text-muted hover:bg-surface hover:text-foreground"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    className="flex h-7 w-7 items-center justify-center rounded text-lg text-bad hover:bg-surface"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
            {items.length > 0 && (
              <div
                className={`queue-drop-gap ${
                  dropIndex === items.length && dragIndex !== null
                    ? "is-active"
                    : ""
                }`}
                onDragOver={onDragOverGap(items.length)}
                onDrop={onDropGap(items.length)}
              />
            )}
          </ul>

          <div
            className={`mb-4 rounded border px-3 py-2 text-sm ${
              validation.ok
                ? "border-good/40 bg-good/10 text-good"
                : "border-bad/40 bg-bad/10 text-bad"
            }`}
          >
            {validation.ok
              ? validation.issues.length
                ? `OK with notes: ${validation.issues[0].message}`
                : "Queue looks good."
              : validation.issues[0]?.message ?? "Invalid queue"}
            {validation.issues.length > 1 && (
              <ul className="mt-1 list-disc pl-4 text-xs opacity-90">
                {validation.issues.slice(1, 4).map((issue, i) => (
                  <li key={`${issue.code}-${i}`}>{issue.message}</li>
                ))}
              </ul>
            )}
          </div>

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
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {cortinas.map((c) => {
                const used = usedCortinaIds.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => addCortina(c.id)}
                      disabled={used}
                      className="flex w-full items-center gap-2 rounded bg-surface px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft text-xs font-semibold text-accent">
                        +
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {used && (
                        <span className="shrink-0 text-[10px] text-muted">
                          used
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
    </AppShell>
  );
}
