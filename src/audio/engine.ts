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

    await this.unlock();
    const ctx = this.getContext();

    // Try Web Audio API first
    try {
      let track = this.bufferCache.get(url);
      if (!track) {
        track = (await this.preloadSong(url)) || undefined;
      }

      if (track) {
        const source = ctx.createBufferSource();
        source.buffer = track.buffer;

        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);

        const startTime = ctx.currentTime;
        const stopTime = startTime + durationSec;

        // Apply 5ms micro fade-out at the end to prevent audio click
        const fadeStart = Math.max(startTime, stopTime - 0.005);
        gain.gain.setValueAtTime(1, fadeStart);
        gain.gain.linearRampToValueAtTime(0, stopTime);

        this.activeSource = source;
        this.activeGain = gain;
        this.isCurrentlyPlaying = true;

        this.lastDebugInfo = {
          engine: 'web-audio',
          audioContextState: ctx.state,
          decodedDurationSec: track.duration,
          leadingSilenceSec: track.silenceOffset,
          lastPlayedDurationSec: durationSec,
        };

        source.onended = () => {
          this.isCurrentlyPlaying = false;
          this.activeSource = null;
          this.activeGain = null;
          if (onEnded) onEnded();
        };

        source.start(startTime, track.silenceOffset);
        source.stop(stopTime);

        return true;
      }
    } catch (err) {
      console.warn('[audio-engine] Web Audio playback failed, falling back to HTMLAudioElement:', err);
    }

    // Fallback path
    this.lastDebugInfo = {
      engine: 'html-fallback',
      audioContextState: ctx.state,
      lastPlayedDurationSec: durationSec,
    };
    this.isCurrentlyPlaying = true;
    this.fallbackPlayer.play(url, durationSec, () => {
      this.isCurrentlyPlaying = false;
      if (onEnded) onEnded();
    });

    return true;
  }

  /**
   * Stops any currently active snippet immediately.
   */
  public stop(): void {
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
  }

  public isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  public getDebugInfo(): AudioDebugInfo {
    return { ...this.lastDebugInfo };
  }
}

export const audioEngine = new AudioEngine();
