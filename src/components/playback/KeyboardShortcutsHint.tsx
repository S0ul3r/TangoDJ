const SHORTCUTS = [
  { keys: ["Space"], label: "play/pause" },
  { keys: ["←", "→"], label: "song" },
  { keys: ["⇧←", "⇧→"], label: "tanda" },
] as const;

function Kbd({ children }: Readonly<{ children: string }>) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-none text-foreground">
      {children}
    </kbd>
  );
}

/** Compact keycap strip for DJ booth shortcuts — sits under transport. */
export function KeyboardShortcutsHint({
  className = "",
}: Readonly<{ className?: string }>) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted ${className}`.trim()}
      role="note"
      aria-label="Keyboard shortcuts"
    >
      <span className="sr-only">Keyboard shortcuts:</span>
      {SHORTCUTS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1">
            {item.keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
