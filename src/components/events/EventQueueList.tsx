"use client";

import type { EventQueueItem } from "@/types/domain";

interface EventQueueListProps {
  items: EventQueueItem[];
  labelFor: (item: EventQueueItem) => string;
  dragIndex: number | null;
  dropIndex: number | null;
  onDragStart: (index: number) => (e: React.DragEvent) => void;
  onDragOverGap: (index: number) => (e: React.DragEvent) => void;
  onDropGap: (index: number) => (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onSetDropIndex: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
}

export function EventQueueList({
  items,
  labelFor,
  dragIndex,
  dropIndex,
  onDragStart,
  onDragOverGap,
  onDropGap,
  onDragEnd,
  onSetDropIndex,
  onMove,
  onRemove,
}: EventQueueListProps) {
  return (
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
              onSetDropIndex(e.clientY < mid ? index : index + 1);
            }}
            className={`queue-row flex items-center gap-1 rounded px-3 py-1.5 text-sm ${
              item.type === "marker"
                ? "bg-transparent border border-dashed border-border text-muted"
                : "bg-surface-2"
            } ${dragIndex === index ? "is-dragging" : ""}`}
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
                item.type === "cortina" || item.type === "marker"
                  ? "text-muted"
                  : "font-medium"
              }`}
            >
              {labelFor(item)}
            </span>
            <button
              type="button"
              onClick={() => onMove(index, -1)}
              className="flex h-7 w-7 items-center justify-center rounded text-base text-muted hover:bg-surface hover:text-foreground"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMove(index, 1)}
              className="flex h-7 w-7 items-center justify-center rounded text-base text-muted hover:bg-surface hover:text-foreground"
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => onRemove(index)}
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
            dropIndex === items.length && dragIndex !== null ? "is-active" : ""
          }`}
          onDragOver={onDragOverGap(items.length)}
          onDrop={onDropGap(items.length)}
        />
      )}
    </ul>
  );
}
