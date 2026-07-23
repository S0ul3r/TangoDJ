"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSpotify } from "@/context/SpotifyContext";
import { DASHBOARD_LINK } from "@/lib/constants";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated } = useSpotify();

  useEffect(() => {
    if (isAuthenticated) router.replace("/library");
  }, [isAuthenticated, router]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <p className="mb-3 text-sm uppercase tracking-[0.28em] text-accent animate-fade-up">
          Argentine tango · milonga desk
        </p>
        <h1
          className="mb-4 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          TangoDJ
        </h1>
        <p
          className="mb-10 max-w-xl text-lg leading-relaxed text-muted animate-fade-up"
          style={{ animationDelay: "120ms" }}
        >
          Link your tango, vals, and milonga playlists. Build tandas. Run the
          night through Spotify Connect — with local files as a quiet safety net.
        </p>
        <div
          className="flex flex-wrap gap-3 animate-fade-up"
          style={{ animationDelay: "180ms" }}
        >
          <a
            href="/login"
            className="pill bg-accent px-6 py-3 text-sm font-semibold text-background transition hover:bg-accent-hover"
          >
            Sign in with Spotify
          </a>
          <a
            href={DASHBOARD_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="pill border border-border bg-surface/60 px-6 py-3 text-sm text-muted transition hover:border-accent hover:text-foreground"
          >
            Spotify Developer Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
