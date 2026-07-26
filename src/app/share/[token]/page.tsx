"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ShareRow {
  index: number;
  type: "marker" | "tanda" | "cortina";
  label: string;
  genre?: string | null;
  tracks: { name: string; artists: string; orchestra: string | null }[];
}

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("Milonga");
  const [items, setItems] = useState<ShareRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { token: t } = await params;
      if (cancelled) return;
      setToken(t);
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(t)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Not found");
        if (cancelled) return;
        setName(data.event?.name ?? "Milonga");
        setItems(data.items ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />

      <div className="relative z-10">
        <header className="mb-8 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent">
              Shared setlist
            </p>
            <h1 className="mt-1 text-3xl font-semibold">{name}</h1>
          </div>
          <Link href="/" className="text-sm text-muted hover:text-accent">
            TangoDJ
          </Link>
        </header>

        {loading && <p className="text-sm text-muted">Loading…</p>}
        {error && (
          <p className="rounded border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        {!loading && !error && (
          <ol className="space-y-4">
            {items.map((row) => (
              <li key={`${row.type}-${row.index}`}>
                {row.type === "marker" ? (
                  <p className="border-t border-border pt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {row.label}
                  </p>
                ) : (
                  <div className="rounded border border-border bg-surface/50 px-4 py-3">
                    <p
                      className={`text-sm ${
                        row.type === "cortina"
                          ? "text-muted italic"
                          : "font-medium"
                      }`}
                    >
                      {row.label}
                    </p>
                    {row.tracks.length > 0 && row.type === "tanda" && (
                      <ul className="mt-2 space-y-1 text-sm text-muted">
                        {row.tracks.map((t, i) => (
                          <li key={`${t.name}-${i}`}>
                            {t.name}
                            <span className="opacity-70">
                              {" "}
                              — {t.orchestra || t.artists || "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-sm text-muted">This setlist is empty.</li>
            )}
          </ol>
        )}

        {token && (
          <p className="mt-10 text-[11px] text-muted">Read-only share · {token.slice(0, 8)}…</p>
        )}
      </div>
    </div>
  );
}
