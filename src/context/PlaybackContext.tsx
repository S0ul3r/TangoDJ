"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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

const CORTINA_STORAGE_KEY = "tangodj.cortinaSeconds";
const GAP_STORAGE_KEY = "tangodj.gapSeconds";

interface PlaybackProgress {
  progressMs: number;
  durationMs: number;
}

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
  previousTrack: () => Promise<void>;
  nextQueueItem: () => Promise<void>;
  previousQueueItem: () => Promise<void>;
  jumpTo: (queueIndex: number) => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  activeQueue: EventQueueItem[];
  cortinaSeconds: number;
  setCortinaSeconds: (seconds: number) => void;
  gapSeconds: number;
  setGapSeconds: (seconds: number) => void;
  volumePercent: number;
  setVolumePercent: (percent: number) => Promise<void>;
  /** Subscribe to progress-only updates (does not re-render usePlayback consumers). */
  subscribeProgress: (listener: () => void) => () => void;
  getProgressSnapshot: () => PlaybackProgress;
}

const PlaybackContext = createContext<PlaybackContextType | null>(null);

function readStoredCortinaSeconds(): number {
  if (typeof window === "undefined") return 45;
  const raw = localStorage.getItem(CORTINA_STORAGE_KEY);
  const n = raw ? Number(raw) : 45;
  if (!Number.isFinite(n)) return 45;
  return Math.min(200, Math.max(10, Math.round(n)));
}

function readStoredGapSeconds(): number {
  if (typeof window === "undefined") return 2;
  const raw = localStorage.getItem(GAP_STORAGE_KEY);
  const n = raw ? Number(raw) : 2;
  if (!Number.isFinite(n)) return 2;
  return Math.min(10, Math.max(0, Math.round(n)));
}

const EMPTY_PROGRESS: PlaybackProgress = { progressMs: 0, durationMs: 0 };

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
  const [cortinaSeconds, setCortinaSecondsState] = useState(
    readStoredCortinaSeconds
  );
  const [gapSeconds, setGapSecondsState] = useState(readStoredGapSeconds);
  const [volumePercent, setVolumePercentState] = useState(100);

  const deviceIdRef = useRef<string | null>(null);
  const getValidTokenRef = useRef(getValidToken);
  const getLocalFileRef = useRef(getLocalFile);
  const controllerRef = useRef<QueueController | null>(null);
  const progressListenersRef = useRef(new Set<() => void>());
  const progressSnapshotRef = useRef<PlaybackProgress>(EMPTY_PROGRESS);

  getValidTokenRef.current = getValidToken;
  getLocalFileRef.current = getLocalFile;

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  const syncProgressSnapshot = useCallback(() => {
    const next =
      controllerRef.current?.getProgress() ?? EMPTY_PROGRESS;
    const prev = progressSnapshotRef.current;
    if (
      prev.progressMs === next.progressMs &&
      prev.durationMs === next.durationMs
    ) {
      return;
    }
    progressSnapshotRef.current = next;
  }, []);

  const emitProgress = useCallback(() => {
    syncProgressSnapshot();
    progressListenersRef.current.forEach((listener) => listener());
  }, [syncProgressSnapshot]);

  const syncStructuralState = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    setStatus(controller.getStatus());
    setError(controller.getError());
    setNowPlaying(controller.getNowPlaying());
    setVolumePercentState(controller.getVolumePercent());
    syncProgressSnapshot();
  }, [syncProgressSnapshot]);

  // Create the controller once — deps are read through stable refs.
  useEffect(() => {
    const controller = new QueueController({
      getAccessToken: () => getValidTokenRef.current(),
      getDeviceId: () => deviceIdRef.current,
      resolveLocalFile: (track: Track) => getLocalFileRef.current(track),
      onChange: () => {
        syncStructuralState();
        emitProgress();
      },
      onProgress: () => {
        emitProgress();
      },
      onError: (msg) => setError(msg),
    });
    controller.setCortinaSeconds(readStoredCortinaSeconds());
    controller.setGapSeconds(readStoredGapSeconds());
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [emitProgress, syncStructuralState]);

  const subscribeProgress = useCallback((listener: () => void) => {
    progressListenersRef.current.add(listener);
    return () => {
      progressListenersRef.current.delete(listener);
    };
  }, []);

  const getProgressSnapshot = useCallback(() => progressSnapshotRef.current, []);

  const setCortinaSeconds = useCallback((seconds: number) => {
    const clamped = Math.min(200, Math.max(10, Math.round(seconds)));
    setCortinaSecondsState(clamped);
    localStorage.setItem(CORTINA_STORAGE_KEY, String(clamped));
    controllerRef.current?.setCortinaSeconds(clamped);
  }, []);

  const setGapSeconds = useCallback((seconds: number) => {
    const clamped = Math.min(10, Math.max(0, Math.round(seconds)));
    setGapSecondsState(clamped);
    localStorage.setItem(GAP_STORAGE_KEY, String(clamped));
    controllerRef.current?.setGapSeconds(clamped);
  }, []);

  const setVolumePercent = useCallback(async (percent: number) => {
    setVolumePercentState(Math.min(100, Math.max(0, Math.round(percent))));
    await controllerRef.current?.setVolumePercent(percent);
  }, []);

  const loadEventQueue = useCallback(
    (items: EventQueueItem[]) => {
      setActiveQueue(items);
      controllerRef.current?.loadQueue(items, tandas, tracks);
      syncStructuralState();
      emitProgress();
    },
    [tandas, tracks, syncStructuralState, emitProgress]
  );

  useEffect(() => {
    controllerRef.current?.updateLibrary(tandas, tracks);
    setNowPlaying(controllerRef.current?.getNowPlaying() ?? null);
  }, [tracks, tandas]);

  const play = useCallback(async () => {
    const token = await getValidTokenRef.current();
    const id = deviceIdRef.current;
    if (token && id) {
      try {
        await transferPlayback(token, id, false);
      } catch {
        /* device may already be active */
      }
    }
    await controllerRef.current?.play();
  }, []);

  const togglePlayPause = useCallback(async () => {
    try {
      await controllerRef.current?.togglePlayPause();
    } catch {
      /* QueueController surfaces errors via onError / status */
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      await controllerRef.current?.pause();
    } catch {
      /* ignore */
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      await controllerRef.current?.resume();
    } catch {
      /* ignore */
    }
  }, []);

  const skipTrack = useCallback(async () => {
    await controllerRef.current?.skipTrack();
  }, []);

  const previousTrack = useCallback(async () => {
    await controllerRef.current?.previousTrack();
  }, []);

  const nextQueueItem = useCallback(async () => {
    await controllerRef.current?.nextQueueItem();
  }, []);

  const previousQueueItem = useCallback(async () => {
    await controllerRef.current?.previousQueueItem();
  }, []);

  const jumpTo = useCallback(async (queueIndex: number) => {
    await controllerRef.current?.jumpTo(queueIndex, 0);
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    await controllerRef.current?.seek(positionMs);
  }, []);

  const combinedError = error ?? deviceError;

  const value = useMemo(
    () => ({
      devices,
      deviceId,
      setDeviceId,
      refreshDevices,
      status,
      error: combinedError,
      nowPlaying,
      loadEventQueue,
      play,
      pause,
      resume,
      togglePlayPause,
      skipTrack,
      previousTrack,
      nextQueueItem,
      previousQueueItem,
      jumpTo,
      seek,
      activeQueue,
      cortinaSeconds,
      setCortinaSeconds,
      gapSeconds,
      setGapSeconds,
      volumePercent,
      setVolumePercent,
      subscribeProgress,
      getProgressSnapshot,
    }),
    [
      devices,
      deviceId,
      setDeviceId,
      refreshDevices,
      status,
      combinedError,
      nowPlaying,
      loadEventQueue,
      play,
      pause,
      resume,
      togglePlayPause,
      skipTrack,
      previousTrack,
      nextQueueItem,
      previousQueueItem,
      jumpTo,
      seek,
      activeQueue,
      cortinaSeconds,
      setCortinaSeconds,
      gapSeconds,
      setGapSeconds,
      volumePercent,
      setVolumePercent,
      subscribeProgress,
      getProgressSnapshot,
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

/** Progress-only subscription — isolates ~4Hz seek-bar updates from the rest of the tree. */
export function usePlaybackProgress(): PlaybackProgress {
  const { subscribeProgress, getProgressSnapshot } = usePlayback();
  return useSyncExternalStore(
    subscribeProgress,
    getProgressSnapshot,
    () => EMPTY_PROGRESS
  );
}
