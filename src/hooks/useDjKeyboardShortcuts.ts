"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

interface DjKeyboardHandlers {
  togglePlayPause: () => void;
  skipTrack: () => void;
  previousTrack: () => void;
  nextQueueItem: () => void;
  previousQueueItem: () => void;
}

/** Space / arrows for DJ transport. Ignored while typing in form fields. */
export function useDjKeyboardShortcuts(handlers: DjKeyboardHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlers.togglePlayPause();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) handlers.nextQueueItem();
          else handlers.skipTrack();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) handlers.previousQueueItem();
          else handlers.previousTrack();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
