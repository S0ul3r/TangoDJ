"use client";

import { usePlayback } from "@/context/PlaybackContext";
import { useEffect } from "react";

export function DevicePicker({ compact = false }: { compact?: boolean }) {
  const { devices, deviceId, setDeviceId, refreshDevices } = usePlayback();

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  return (
    <div className={compact ? "flex flex-col gap-1" : "flex flex-col gap-2"}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs uppercase tracking-wide text-muted">
          Spotify Connect device
        </label>
        <button
          type="button"
          onClick={() => void refreshDevices()}
          className="text-xs text-accent hover:text-accent-hover"
        >
          Refresh
        </button>
      </div>
      {devices.length === 0 ? (
        <p className="rounded border border-border bg-surface px-3 py-2 text-sm text-muted">
          No devices found. Open the Spotify app and press play once, then refresh.
        </p>
      ) : (
        <select
          value={deviceId ?? ""}
          onChange={(e) => setDeviceId(e.target.value || null)}
          className="rounded border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.is_active ? " (active)" : ""} — {d.type}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
