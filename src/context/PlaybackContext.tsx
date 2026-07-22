"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSpotify } from "@/context/SpotifyContext";
import { useLibrary } from "@/context/LibraryContext";
import { useConnectDevices } from "@/hooks/useConnectDevices";
import {
  QueueController,
  type NowPlayingInfo,
  type QueueControllerStatus,
} from "@/lib/playback/queueController";
import { transferPlayback } from "@/lib/playback/spotifyConnect";
import type { EventQueueItem, Track } from "@/types/domain";

interface PlaybackContextType {
  devices: ReturnType<typeof useConnectDevices>["devices"];
  deviceId: string | null;
  setDeviceId: (id: string | null) => void;
  refreshDevices: () => Promise<void>;
  status: QueueControllerStatus;
  error: string | null;
  nowPlaying: NowPlayingInfo | null;
  loadEventQueue: (items: EventQueueItem[]) => void;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  skipTrack: () => Promise<void>;
  nextQueueItem: () => Promise<void>;
  jumpTo: (queueIndex: number) => Promise<void>;
  activeQueue: EventQueueItem[];
}

const PlaybackContext = createContext<PlaybackContextType | null>(null);

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const { getValidToken } = useSpotify();
  const { tracks, tandas, getLocalFile } = useLibrary();
  const {
    devices,
    deviceId,
    setDeviceId,
    refreshDevices,
    error: deviceError,
  } = useConnectDevices();

  const [status, setStatus] = useState<QueueControllerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null);
  const [activeQueue, setActiveQueue] = useState<EventQueueItem[]>([]);

  const deviceIdRef = useRef<string | null>(null);
  const controllerRef = useRef<QueueController | null>(null);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    if (deviceError) setError(deviceError);
  }, [deviceError]);

  useEffect(() => {
    const controller = new QueueController({
      getAccessToken: getValidToken,
      getDeviceId: () => deviceIdRef.current,
      resolveLocalFile: (track: Track) => getLocalFile(track),
      onChange: () => {
        setStatus(controller.getStatus());
        setError(controller.getError());
        setNowPlaying(controller.getNowPlaying());
      },
      onError: (msg) => setError(msg),
    });
    controllerRef.current = controller;
    return () => controller.destroy();
  }, [getLocalFile, getValidToken]);

  const loadEventQueue = useCallback(
    (items: EventQueueItem[]) => {
      setActiveQueue(items);
      controllerRef.current?.loadQueue(items, tandas, tracks);
      setStatus(controllerRef.current?.getStatus() ?? "idle");
      setNowPlaying(controllerRef.current?.getNowPlaying() ?? null);
    },
    [tandas, tracks]
  );

  useEffect(() => {
    controllerRef.current?.updateLibrary(tandas, tracks);
    setNowPlaying(controllerRef.current?.getNowPlaying() ?? null);
  }, [tracks, tandas]);

  const play = useCallback(async () => {
    const token = await getValidToken();
    const id = deviceIdRef.current;
    if (token && id) {
      try {
        await transferPlayback(token, id, false);
      } catch {
        /* device may already be active */
      }
    }
    await controllerRef.current?.play();
  }, [getValidToken]);

  const pause = useCallback(async () => {
    await controllerRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    await controllerRef.current?.resume();
  }, []);

  const togglePlayPause = useCallback(async () => {
    await controllerRef.current?.togglePlayPause();
  }, []);

  const skipTrack = useCallback(async () => {
    await controllerRef.current?.skipTrack();
  }, []);

  const nextQueueItem = useCallback(async () => {
    await controllerRef.current?.nextQueueItem();
  }, []);

  const jumpTo = useCallback(async (queueIndex: number) => {
    await controllerRef.current?.jumpTo(queueIndex, 0);
  }, []);

  const value = useMemo(
    () => ({
      devices,
      deviceId,
      setDeviceId,
      refreshDevices,
      status,
      error,
      nowPlaying,
      loadEventQueue,
      play,
      pause,
      resume,
      togglePlayPause,
      skipTrack,
      nextQueueItem,
      jumpTo,
      activeQueue,
    }),
    [
      devices,
      deviceId,
      setDeviceId,
      refreshDevices,
      status,
      error,
      nowPlaying,
      loadEventQueue,
      play,
      pause,
      resume,
      togglePlayPause,
      skipTrack,
      nextQueueItem,
      jumpTo,
      activeQueue,
    ]
  );

  return (
    <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
}
