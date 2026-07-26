/**
 * HTML5 Audio wrapper for local MP3 playback, with optional warm/preload.
 */

type EndedHandler = () => void;
type ErrorHandler = (message: string) => void;

export class LocalAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private onEnded: EndedHandler | null = null;
  private onError: ErrorHandler | null = null;
  private volume = 1;

  /** Paused element kept ready for the next local track. */
  private warmAudio: HTMLAudioElement | null = null;
  private warmUrl: string | null = null;
  private warmKey: string | null = null;

  setEndedHandler(handler: EndedHandler | null) {
    this.onEnded = handler;
  }

  setErrorHandler(handler: ErrorHandler | null) {
    this.onError = handler;
  }

  /** Resolve a File/Blob into a paused, buffering Audio element. */
  async warmFile(key: string, file: File | Blob): Promise<void> {
    if (!key || this.warmKey === key) return;
    this.clearWarm();
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    this.warmAudio = audio;
    this.warmUrl = url;
    this.warmKey = key;
    audio.preload = "auto";
    audio.src = url;
    audio.volume = 0;
    try {
      audio.load();
    } catch {
      this.clearWarm();
    }
  }

  clearWarm(): void {
    if (this.warmAudio) {
      this.warmAudio.pause();
      this.warmAudio.removeAttribute("src");
      this.warmAudio.load();
      this.warmAudio = null;
    }
    if (this.warmUrl) {
      URL.revokeObjectURL(this.warmUrl);
      this.warmUrl = null;
    }
    this.warmKey = null;
  }

  async playFile(file: File | Blob, warmKey?: string | null): Promise<void> {
    // Promote preloaded element when keys match
    if (warmKey && this.warmKey === warmKey && this.warmAudio && this.warmUrl) {
      this.stopActiveOnly();
      this.audio = this.warmAudio;
      this.objectUrl = this.warmUrl;
      this.warmAudio = null;
      this.warmUrl = null;
      this.warmKey = null;
      this.audio.volume = this.volume;
      this.audio.onended = () => this.onEnded?.();
      this.audio.onerror = () => this.onError?.("Failed to play local audio file.");
      try {
        this.audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      await this.audio.play();
      return;
    }

    this.stop();
    const audio = new Audio();
    this.audio = audio;
    this.objectUrl = URL.createObjectURL(file);
    audio.src = this.objectUrl;
    audio.volume = this.volume;
    audio.onended = () => this.onEnded?.();
    audio.onerror = () => this.onError?.("Failed to play local audio file.");
    await audio.play();
  }

  pause(): void {
    this.audio?.pause();
  }

  async resume(): Promise<void> {
    await this.audio?.play();
  }

  seek(seconds: number): void {
    if (!this.audio || !Number.isFinite(seconds)) return;
    this.audio.currentTime = Math.max(0, seconds);
  }

  setVolume(level: number): void {
    this.volume = Math.min(1, Math.max(0, level));
    if (this.audio) this.audio.volume = this.volume;
  }

  private stopActiveOnly(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  stop(): void {
    this.stopActiveOnly();
    this.clearWarm();
  }

  get currentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  get paused(): boolean {
    return this.audio?.paused ?? true;
  }
}
