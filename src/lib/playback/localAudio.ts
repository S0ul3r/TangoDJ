/**
 * HTML5 Audio wrapper for local MP3 playback
 */

type EndedHandler = () => void;
type ErrorHandler = (message: string) => void;

export class LocalAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private onEnded: EndedHandler | null = null;
  private onError: ErrorHandler | null = null;
  private volume = 1;

  setEndedHandler(handler: EndedHandler | null) {
    this.onEnded = handler;
  }

  setErrorHandler(handler: ErrorHandler | null) {
    this.onError = handler;
  }

  async playFile(file: File | Blob): Promise<void> {
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

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
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
