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

  useEffect(() => {
    if (loading) {
      console.debug("[TangoDJ] Syncing library with Supabase…");
    } else if (syncError) {
      console.warn(
        "[TangoDJ] Cloud sync unavailable — using offline cache:",
        syncError
      );
    }
  }, [loading, syncError]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Redirecting…
      </div>
    );
  }

  const offlineTitle = syncError
    ? `Cloud sync unavailable — using offline cache${
        cacheSavedAt
          ? ` (saved ${new Date(cacheSavedAt).toLocaleString()})`
          : ""
      }. ${syncError}`
    : undefined;

  const lockViewport = pathname === "/tandas";

  return (
    <div
      className={
        lockViewport
          ? "flex h-dvh flex-col overflow-hidden"
          : "min-h-screen"
      }
    >
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />

      <header className="sticky top-0 z-40 shrink-0 border-b border-border/70 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 xl:px-6">
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
              <span className="hidden text-xs text-muted sm:inline">
                milonga desk
              </span>
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
            {syncError && (
              <span
                className="ml-1 hidden items-center gap-1.5 px-2 text-xs text-warn sm:inline-flex"
                title={offlineTitle}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-warn"
                  aria-hidden
                />
                Offline
              </span>
            )}
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
      </header>
      <main
        className={
          lockViewport
            ? "mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-4 py-3 animate-fade-up xl:px-6"
            : "mx-auto max-w-[1600px] px-4 py-4 animate-fade-up xl:px-6"
        }
      >
        {children}
      </main>
    </div>
  );
}
