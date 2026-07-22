"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generatePKCE, getLoginUrl } from "@/lib/auth";
import { useSpotify } from "@/context/SpotifyContext";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated } = useSpotify();
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  const configError = !clientId || !redirectUri ? "missing_credentials" : null;
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/library");
      return;
    }
    if (configError) return;
    // Prevent React Strict Mode from generating two different PKCE verifiers
    if (startedRef.current) return;
    startedRef.current = true;

    if (typeof window !== "undefined") {
      const redirectHost = new URL(redirectUri!).hostname;
      if (window.location.hostname !== redirectHost) {
        const port = window.location.port || "3000";
        window.location.replace(`http://${redirectHost}:${port}/login`);
        return;
      }
    }

    const initLogin = async () => {
      try {
        const { codeVerifier, codeChallenge } = await generatePKCE();
        sessionStorage.setItem("spotify_code_verifier", codeVerifier);
        const url = getLoginUrl(clientId!, redirectUri!, codeChallenge);
        window.location.assign(url);
      } catch (e) {
        startedRef.current = false;
        setError(
          e instanceof Error
            ? e.message
            : "Could not start Spotify login. Try again."
        );
      }
    };

    void initLogin();
  }, [isAuthenticated, router, configError, clientId, redirectUri]);

  if (configError === "missing_credentials") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="site-bg" aria-hidden />
        <div className="site-bg-veil" aria-hidden />
        <h1 className="mb-6 text-2xl font-semibold">TangoDJ</h1>
        <div className="panel max-w-md p-6 text-left">
          <h2 className="mb-2 font-semibold text-warn">Missing Spotify credentials</h2>
          <p className="mb-4 text-sm text-muted">
            Add <code className="rounded bg-surface-2 px-1">NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code>{" "}
            and{" "}
            <code className="rounded bg-surface-2 px-1">NEXT_PUBLIC_SPOTIFY_REDIRECT_URI</code>{" "}
            to <code className="rounded bg-surface-2 px-1">.env.local</code>
          </p>
          <Link href="/" className="mt-2 inline-block text-accent hover:underline">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <div className="site-bg" aria-hidden />
        <div className="site-bg-veil" aria-hidden />
        <p className="text-bad">{error}</p>
        <button
          type="button"
          className="pill bg-accent px-5 py-2 text-sm font-semibold text-background"
          onClick={() => {
            setError(null);
            startedRef.current = false;
            window.location.reload();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="site-bg" aria-hidden />
      <div className="site-bg-veil" aria-hidden />
      <div className="relative z-10 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-muted">Redirecting to Spotify…</p>
        <p className="mt-2 text-xs text-muted">
          Use <span className="text-foreground">http://127.0.0.1:3000</span> (same as your
          Spotify redirect URI).
        </p>
      </div>
    </div>
  );
}
