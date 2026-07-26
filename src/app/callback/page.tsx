"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSpotify } from "@/context/SpotifyContext";
import {
  getSpotifyRedirectUri,
  redirectLocalhostToLoopbackIfNeeded,
} from "@/lib/spotifyRedirect";

/** Survives React Strict Mode remounts so the auth code is exchanged once. */
let exchangeInFlightForCode: string | null = null;

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens } = useSpotify();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (redirectLocalhostToLoopbackIfNeeded()) return;

    const code = searchParams.get("code");
    const codeVerifier = sessionStorage.getItem("spotify_code_verifier");

    if (!code || !codeVerifier) {
      const msg = code
        ? "Session expired. Log in again from the same site URL."
        : "Missing authorization code. Please try logging in again.";
      queueMicrotask(() => setError(msg));
      return;
    }

    if (exchangeInFlightForCode === code) return;

    let redirectUri: string;
    try {
      redirectUri = getSpotifyRedirectUri();
    } catch {
      queueMicrotask(() => setError("Server configuration error."));
      return;
    }

    exchangeInFlightForCode = code;
    fetch("/api/auth/callback", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier, redirectUri }),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          access_token?: string;
          expires_in?: number;
          error?: string;
        };
        if (!res.ok || !data.access_token) {
          throw new Error(data.error || "Failed to complete login.");
        }
        sessionStorage.removeItem("spotify_code_verifier");
        setTokens(data.access_token, undefined, data.expires_in);
        router.replace("/library");
      })
      .catch((err) => {
        exchangeInFlightForCode = null;
        setError(err instanceof Error ? err.message : "Failed to complete login.");
      });
  }, [searchParams, setTokens, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="mb-4 text-bad">{error}</p>
        <a href="/login" className="text-accent hover:underline">
          Try again
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-muted">Completing login…</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
