"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeCodeForToken } from "@/lib/auth";
import { useSpotify } from "@/context/SpotifyContext";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens } = useSpotify();
  const [error, setError] = useState<string | null>(null);

  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;

    const code = searchParams.get("code");
    const codeVerifier = sessionStorage.getItem("spotify_code_verifier");

    if (!code || !codeVerifier) {
      const msg = code
        ? "Session expired. Log in again using the same host (127.0.0.1)."
        : "Missing authorization code. Please try logging in again.";
      queueMicrotask(() => setError(msg));
      return;
    }

    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      queueMicrotask(() => setError("Server configuration error."));
      return;
    }

    exchanged.current = true;
    exchangeCodeForToken(code, redirectUri, codeVerifier, clientId)
      .then((data) => {
        sessionStorage.removeItem("spotify_code_verifier");
        setTokens(data.access_token, data.refresh_token, data.expires_in);
        router.replace("/library");
      })
      .catch((err) => {
        exchanged.current = false;
        setError(err.message || "Failed to complete login.");
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
