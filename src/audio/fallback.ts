export class HtmlAudioFallbackPlayer {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: number | null = null;
  private generation = 0;

  public play(url: string, durationSec: number, onEnded?: () => void): void {
    this.stop();
    const currentGen = this.generation;

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
          this.stop();
          if (onEnded) onEnded();
        }, durationSec * 1000);
      })
      .catch((err) => {
        if (this.generation === currentGen) {
          console.warn('[fallback-audio] Play error:', err);
          if (onEnded) onEnded();
        }
      });
  }

  public stop(): void {
    this.generation++;
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
