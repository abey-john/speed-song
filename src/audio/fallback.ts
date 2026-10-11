export class HtmlAudioFallbackPlayer {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: number | null = null;
  private generation = 0;
  private activeOnEnded?: () => void;
  private activeDuration = 0;

  public play(url: string, durationSec: number, onEnded?: () => void): void {
    this.stop();
    const currentGen = this.generation;
    this.activeDuration = durationSec;
    this.activeOnEnded = onEnded;

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    this.audio = audio;

    audio
      .play()
      .then(() => {
        if (this.generation !== currentGen) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          return;
        }
        this.stopTimer = window.setTimeout(() => {
          if (this.generation === currentGen) {
            const cb = this.activeOnEnded;
            this.stop();
            if (cb) cb();
          }
        }, durationSec * 1000);
      })
      .catch((err) => {
        if (this.generation === currentGen) {
          console.warn('[fallback-audio] Play error:', err);
          if (onEnded) onEnded();
        }
      });
  }

  public extendDuration(newDurationSec: number, onEnded?: () => void): boolean {
    if (!this.audio || this.stopTimer === null) return false;
    const currentGen = this.generation;
    this.activeDuration = newDurationSec;
    if (onEnded) this.activeOnEnded = onEnded;

    window.clearTimeout(this.stopTimer);
    const playedSec = this.audio.currentTime || 0;
    const remainingMs = Math.max(0, (newDurationSec - playedSec) * 1000);

    this.stopTimer = window.setTimeout(() => {
      if (this.generation === currentGen) {
        const cb = this.activeOnEnded;
        this.stop();
        if (cb) cb();
      }
    }, remainingMs);

    return true;
  }

  public getCurrentTime(): number {
    return this.audio ? this.audio.currentTime : 0;
  }

  public getActiveDuration(): number {
    return this.activeDuration;
  }

  public isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  public stop(): void {
    this.generation++;
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.activeOnEnded = undefined;
    this.activeDuration = 0;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
  }
}

