"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getDevices,
  pickPreferredDevice,
} from "@/lib/playback/spotifyConnect";
import { LAST_DEVICE_KEY } from "@/lib/constants";
import type { SpotifyDevice } from "@/types/domain";
import { useSpotify } from "@/context/SpotifyContext";

export function useConnectDevices() {
  const { getValidToken } = useSpotify();
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [deviceId, setDeviceIdState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LAST_DEVICE_KEY);
    if (stored) setDeviceIdState(stored);
  }, []);

  const setDeviceId = useCallback((id: string | null) => {
    setDeviceIdState(id);
    if (id) localStorage.setItem(LAST_DEVICE_KEY, id);
  }, []);

  const refreshDevices = useCallback(async () => {
    const token = await getValidToken();
    if (!token) return;
    try {
      const list = await getDevices(token);
      setDevices(list);
      setError(null);
      setDeviceIdState((current) => {
        if (current && list.some((d) => d.id === current)) return current;
        const preferred = pickPreferredDevice(
          list,
          localStorage.getItem(LAST_DEVICE_KEY)
        );
        if (preferred) {
          localStorage.setItem(LAST_DEVICE_KEY, preferred.id);
          return preferred.id;
        }
        return current;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list devices");
    }
  }, [getValidToken]);

  return { devices, deviceId, setDeviceId, refreshDevices, error };
}
