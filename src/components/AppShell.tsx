"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSpotify } from "@/context/SpotifyContext";
import { useLibrary } from "@/context/LibraryContext";

const NAV = [
  { href: "/library", label: "Library" },
  { href: "/tandas", label: "Tandas" },
  { href: "/events", label: "Events" },
  { href: "/dj", label: "DJ" },
  { href: "/remote", label: "Remote" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, logout } = useSpotify();
  const { syncError, loading, cacheSavedAt } = useLibrary();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/library" className="group flex items-center gap-2.5">
            <img
              src="/tango-mark.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain transition group-hover:opacity-90"
            />
            <span className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tracking-tight text-foreground transition group-hover:text-accent">
                TangoDJ
              </span>
              <span className="hidden text-xs text-muted sm:inline">milonga desk</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`pill px-3.5 py-1.5 text-sm transition ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/");
              }}
              className="pill ml-1 px-3.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
            >
              Log out
            </button>
          </nav>
        </div>
        {(loading || syncError) && (
          <div className="border-t border-border/40 px-4 py-1.5 text-center text-xs text-muted">
            {loading && <span>Syncing with Supabase…</span>}
            {!loading && syncError && (
              <span className="text-warn">
                Cloud sync unavailable — using offline cache
                {cacheSavedAt
                  ? ` (saved ${new Date(cacheSavedAt).toLocaleString()})`
                  : ""}
                . {syncError}
              </span>
            )}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 animate-fade-up">{children}</main>
    </div>
  );
}
