"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface SpotifyContextType {
  accessToken: string | null;
  /** Always null — refresh lives in an httpOnly cookie. Kept for API compatibility. */
  refreshToken: string | null;
  setTokens: (access: string, refresh?: string, expiresIn?: number) => void;
  logout: () => void;
  isAuthenticated: boolean;
  /** False until the initial cookie/localStorage session probe finishes. */
  authReady: boolean;
  getValidToken: () => Promise<string | null>;
}

const SpotifyContext = createContext<SpotifyContextType | null>(null);

/** Legacy localStorage keys — cleared after cookie migration. */
const LEGACY_TOKEN_KEY = "spotify_access_token";
const LEGACY_REFRESH_KEY = "spotify_refresh_token";
const LEGACY_EXPIRES_KEY = "spotify_expires_at";

const BUFFER_MS = 60 * 1000;

function clearLegacyStorage() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
    localStorage.removeItem(LEGACY_EXPIRES_KEY);
  } catch {
    /* ignore */
  }
}

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [authReady, setAuthReady] = useState(false);
  const accessRef = useRef<string | null>(null);
  const expiresAtRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  accessRef.current = accessToken;
  expiresAtRef.current = expiresAt;

  const applyAccess = useCallback((access: string, expiresIn: number) => {
    setAccessToken(access);
    setExpiresAt(Date.now() + expiresIn * 1000);
  }, []);

  const setTokens = useCallback(
    (access: string, _refresh?: string, expiresIn?: number) => {
      applyAccess(access, expiresIn ?? 3600);
    },
    [applyAccess]
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setExpiresAt(0);
    clearLegacyStorage();
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  }, []);

  const refreshFromServer = useCallback(async (): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    refreshPromiseRef.current = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!res.ok) {
          setAccessToken(null);
          setExpiresAt(0);
          return null;
        }
        const data = (await res.json()) as {
          access_token: string;
          expires_in: number;
        };
        applyAccess(data.access_token, data.expires_in);
        return data.access_token;
      } catch {
        setAccessToken(null);
        setExpiresAt(0);
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [applyAccess]);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    const current = accessRef.current;
    const exp = expiresAtRef.current;
    if (current && Date.now() < exp - BUFFER_MS) return current;
    return refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            access_token: string;
            expires_in: number;
          };
          if (!cancelled) {
            applyAccess(data.access_token, data.expires_in);
            clearLegacyStorage();
          }
          return;
        }

        let legacyRefresh: string | null = null;
        try {
          legacyRefresh = localStorage.getItem(LEGACY_REFRESH_KEY);
        } catch {
          legacyRefresh = null;
        }

        if (legacyRefresh) {
          const adopt = await fetch("/api/auth/adopt", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: legacyRefresh }),
          });
          if (adopt.ok) {
            const data = (await adopt.json()) as {
              access_token: string;
              expires_in: number;
            };
            if (!cancelled) {
              applyAccess(data.access_token, data.expires_in);
              clearLegacyStorage();
            }
            return;
          }
          clearLegacyStorage();
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyAccess]);

  return (
    <SpotifyContext.Provider
      value={{
        accessToken,
        refreshToken: null,
        setTokens,
        logout,
        isAuthenticated: !!accessToken,
        authReady,
        getValidToken,
      }}
    >
      {children}
    </SpotifyContext.Provider>
  );
}

export function useSpotify() {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used within SpotifyProvider");
  return ctx;
}
