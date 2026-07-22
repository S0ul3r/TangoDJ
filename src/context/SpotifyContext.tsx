"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { refreshAccessToken } from "@/lib/auth";

interface SpotifyContextType {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (access: string, refresh?: string, expiresIn?: number) => void;
  logout: () => void;
  isAuthenticated: boolean;
  getValidToken: () => Promise<string | null>;
}

const SpotifyContext = createContext<SpotifyContextType | null>(null);

const TOKEN_KEY = "spotify_access_token";
const REFRESH_KEY = "spotify_refresh_token";
const EXPIRES_KEY = "spotify_expires_at";
const BUFFER_MS = 60 * 1000;

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const setTokens = useCallback(
    (access: string, refresh?: string, expiresIn?: number) => {
      setAccessToken(access);
      if (refresh) {
        setRefreshToken(refresh);
        localStorage.setItem(REFRESH_KEY, refresh);
      }
      localStorage.setItem(TOKEN_KEY, access);
      if (expiresIn) {
        localStorage.setItem(
          EXPIRES_KEY,
          String(Date.now() + expiresIn * 1000)
        );
      }
    },
    []
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  }, []);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    const stored = localStorage.getItem(TOKEN_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_KEY);

    if (!stored) return null;

    const expiresAtNum = expiresAt ? parseInt(expiresAt, 10) : 0;
    const needsRefresh = Date.now() >= expiresAtNum - BUFFER_MS;

    if (needsRefresh && refresh) {
      if (refreshPromiseRef.current) return refreshPromiseRef.current;
      const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
      if (!clientId) return stored;

      refreshPromiseRef.current = refreshAccessToken(refresh, clientId)
        .then((data) => {
          setTokens(
            data.access_token,
            data.refresh_token ?? refresh,
            data.expires_in
          );
          refreshPromiseRef.current = null;
          return data.access_token;
        })
        .catch(() => {
          logout();
          refreshPromiseRef.current = null;
          return null;
        });
      return refreshPromiseRef.current;
    }
    return stored;
  }, [setTokens, logout]);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_KEY);
    if (stored) {
      queueMicrotask(() => {
        const expiresAtNum = expiresAt ? parseInt(expiresAt, 10) : 0;
        const isExpired = expiresAtNum && Date.now() >= expiresAtNum && !refresh;
        if (isExpired) {
          setAccessToken(null);
          localStorage.removeItem(TOKEN_KEY);
        } else {
          setAccessToken(stored);
          if (refresh) setRefreshToken(refresh);
        }
      });
    }
  }, []);

  return (
    <SpotifyContext.Provider
      value={{
        accessToken,
        refreshToken,
        setTokens,
        logout,
        isAuthenticated: !!accessToken,
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
