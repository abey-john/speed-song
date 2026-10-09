export class HtmlAudioFallbackPlayer {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: number | null = null;

  public play(url: string, durationSec: number, onEnded?: () => void): void {
    this.stop();

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    this.audio = audio;

    audio
      .play()
      .then(() => {
        this.stopTimer = window.setTimeout(() => {
          this.stop();
          if (onEnded) onEnded();
        }, durationSec * 1000);
      })
      .catch((err) => {
        console.warn('[fallback-audio] Play error:', err);
        if (onEnded) onEnded();
      });
  }

  public stop(): void {
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
  }
}
