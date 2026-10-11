import { detectLeadingSilence } from './silence';
import { HtmlAudioFallbackPlayer } from './fallback';

export interface DecodedTrack {
  buffer: AudioBuffer;
  silenceOffset: number;
  duration: number;
}

export interface AudioDebugInfo {
  engine: 'web-audio' | 'html-fallback';
  audioContextState: string;
  decodedDurationSec?: number;
  leadingSilenceSec?: number;
  lastPlayedDurationSec?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bufferCache = new Map<string, DecodedTrack>();
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;
  private fallbackPlayer = new HtmlAudioFallbackPlayer();
  private lastDebugInfo: AudioDebugInfo = {
    engine: 'web-audio',
    audioContextState: 'uninitialized',
  };
  private isCurrentlyPlaying = false;
  private playGeneration = 0;
  private playbackStartTime = 0;
  private activeDuration = 0;
  private activeOnEnded?: () => void;
  private stopTimer: number | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  /**
   * Unlocks the AudioContext upon initial user interaction (e.g. clicking Start).
   * Essential for iOS Safari and autoplay restrictions.
   */
  public async unlock(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this.lastDebugInfo.audioContextState = ctx.state;
  }

  /**
   * Pre-fetches and decodes a song buffer in the background.
   */
  public async preloadSong(url: string): Promise<DecodedTrack | null> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!;
    }

    try {
      const ctx = this.getContext();
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch audio (${res.status}) from ${url}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      const silenceResult = detectLeadingSilence(buffer);

      const decoded: DecodedTrack = {
        buffer,
        silenceOffset: silenceResult.offsetSeconds,
        duration: buffer.duration,
      };

      // Cap cache size to 6 songs to conserve memory
      if (this.bufferCache.size >= 6) {
        const firstKey = this.bufferCache.keys().next().value;
        if (firstKey) this.bufferCache.delete(firstKey);
      }

      this.bufferCache.set(url, decoded);
      return decoded;
    } catch (err) {
      console.warn(`[audio-engine] Preload/decode failed for ${url}:`, err);
      return null;
    }
  }

  /**
   * Plays a snippet of durationSec using high-precision Web Audio scheduling
   * and a 5ms click-prevention fade-out. Falls back to HTMLAudioElement on failure.
   */
  public async playSnippet(
    url: string,
    durationSec: number,
    onEnded?: () => void
  ): Promise<boolean> {
    this.stop();
    const currentGen = this.playGeneration;

    await this.unlock();
    if (this.playGeneration !== currentGen) return false;

    const ctx = this.getContext();

    // Try Web Audio API first
    try {
      let track = this.bufferCache.get(url);
      if (!track) {
        track = (await this.preloadSong(url)) || undefined;
      }

      if (this.playGeneration !== currentGen) return false;

      if (track) {
        if (this.activeSource) {
          try {
            this.activeSource.stop();
            this.activeSource.disconnect();
          } catch {}
          this.activeSource = null;
          this.activeGain = null;
        }

        const source = ctx.createBufferSource();
        source.buffer = track.buffer;

        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);

        const startTime = ctx.currentTime;
        const stopTime = startTime + durationSec;

        // Apply 5ms micro fade-out at the end to prevent audio click
        const fadeStart = Math.max(startTime, stopTime - 0.005);
        gain.gain.setValueAtTime(1, startTime);
        gain.gain.setValueAtTime(1, fadeStart);
        gain.gain.linearRampToValueAtTime(0, stopTime);

        this.activeSource = source;
        this.activeGain = gain;
        this.playbackStartTime = startTime;
        this.activeDuration = durationSec;
        this.activeOnEnded = onEnded;
        this.isCurrentlyPlaying = true;

        this.lastDebugInfo = {
          engine: 'web-audio',
          audioContextState: ctx.state,
          decodedDurationSec: track.duration,
          leadingSilenceSec: track.silenceOffset,
          lastPlayedDurationSec: durationSec,
        };

        source.onended = () => {
          if (this.activeSource === source && this.playGeneration === currentGen) {
            const cb = this.activeOnEnded;
            this.stop();
            if (cb) cb();
          }
        };

        source.start(startTime, track.silenceOffset);

        const msRemaining = Math.max(0, (stopTime - ctx.currentTime) * 1000);
        this.stopTimer = window.setTimeout(() => {
          if (this.playGeneration === currentGen) {
            const cb = this.activeOnEnded;
            this.stop();
            if (cb) cb();
          }
        }, msRemaining);

        return true;
      }
    } catch (err) {
      console.warn('[audio-engine] Web Audio playback failed, falling back to HTMLAudioElement:', err);
    }

    if (this.playGeneration !== currentGen) return false;

    // Fallback path
    this.lastDebugInfo = {
      engine: 'html-fallback',
      audioContextState: ctx.state,
      lastPlayedDurationSec: durationSec,
    };
    this.isCurrentlyPlaying = true;
    this.activeDuration = durationSec;
    this.activeOnEnded = onEnded;

    this.fallbackPlayer.play(url, durationSec, () => {
      if (this.playGeneration === currentGen) {
        this.isCurrentlyPlaying = false;
        if (onEnded) onEnded();
      }
    });

    return true;
  }

  /**
   * Extends active snippet playback seamlessly to a longer duration without restarting.
   * Returns true if active playback was successfully extended.
   */
  public extendDuration(newDurationSec: number, onEnded?: () => void): boolean {
    if (!this.isCurrentlyPlaying) return false;

    // Web Audio path
    if (this.activeSource && this.ctx && this.activeGain) {
      const currentGen = this.playGeneration;
      const newStopTime = this.playbackStartTime + newDurationSec;

      if (newStopTime <= this.ctx.currentTime) {
        this.stop();
        if (onEnded) onEnded();
        return true;
      }

      if (this.stopTimer !== null) {
        window.clearTimeout(this.stopTimer);
        this.stopTimer = null;
      }

      this.activeDuration = newDurationSec;
      if (onEnded) this.activeOnEnded = onEnded;

      this.activeGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.activeGain.gain.setValueAtTime(1, this.ctx.currentTime);

      const fadeStart = Math.max(this.ctx.currentTime, newStopTime - 0.005);
      this.activeGain.gain.setValueAtTime(1, fadeStart);
      this.activeGain.gain.linearRampToValueAtTime(0, newStopTime);

      const msRemaining = Math.max(0, (newStopTime - this.ctx.currentTime) * 1000);
      this.stopTimer = window.setTimeout(() => {
        if (this.playGeneration === currentGen) {
          const cb = this.activeOnEnded;
          this.stop();
          if (cb) cb();
        }
      }, msRemaining);

      return true;
    }

    // HTML Audio fallback path
    const extended = this.fallbackPlayer.extendDuration(newDurationSec, onEnded);
    if (extended) {
      this.activeDuration = newDurationSec;
      if (onEnded) this.activeOnEnded = onEnded;
    }
    return extended;
  }

  /**
   * Returns current playback position in seconds (0 to activeDuration).
   */
  public getCurrentTime(): number {
    if (!this.isCurrentlyPlaying) return 0;
    if (this.ctx && this.activeSource) {
      const elapsed = this.ctx.currentTime - this.playbackStartTime;
      return Math.max(0, Math.min(elapsed, this.activeDuration));
    }
    if (this.fallbackPlayer.isPlaying()) {
      return this.fallbackPlayer.getCurrentTime();
    }
    return 0;
  }

  /**
   * Returns the active duration of the playing snippet.
   */
  public getActiveDuration(): number {
    return this.activeDuration;
  }

  /**
   * Stops any currently active snippet immediately.
   */
  public stop(): void {
    this.playGeneration++;
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.activeSource) {
      try {
        if (this.ctx && this.activeGain) {
          // Instant 2ms fade out before stop
          this.activeGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.002);
        }
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {}
      this.activeSource = null;
      this.activeGain = null;
    }
    this.fallbackPlayer.stop();
    this.isCurrentlyPlaying = false;
    this.activeOnEnded = undefined;
    this.playbackStartTime = 0;
    this.activeDuration = 0;
  }

  public isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  public getDebugInfo(): AudioDebugInfo {
    return { ...this.lastDebugInfo };
  }
}

export const audioEngine = new AudioEngine();
