import { VoiceGameState, MAX_VOICE_DURATION_SEC } from '../voice/state';
import { isSpeechRecognitionSupported } from '../voice/recognition';

export interface VoiceControlsCallbacks {
  onBeginClip: () => void;
  onBuzzIn: () => void;
  onResumePlayback: () => void;
  onSubmitEarly?: () => void;
  onGiveUp?: () => void;
  getCurrentPlaybackTime?: () => number;
}

export class VoiceControls {
  private container: HTMLElement;
  private callbacks: VoiceControlsCallbacks;
  private state: VoiceGameState | null = null;
  private animFrameId: number | null = null;
  private liveTranscript = '';
  private countdownIntervalId: number | null = null;

  constructor(callbacks: VoiceControlsCallbacks) {
    this.container = document.createElement('div');
    this.container.className = 'voice-controls-container';
    this.callbacks = callbacks;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public update(state: VoiceGameState): void {
    this.state = state;
    this.render();

    if (state.type === 'playing') {
      this.startPlaybackAnimation();
    } else {
      this.stopPlaybackAnimation();
    }
  }

  public setListeningState(isListening: boolean, remainingSec = 3.0, interimTranscript = ''): void {
    this.liveTranscript = interimTranscript;

    const micBanner = this.container.querySelector<HTMLElement>('#voice-listening-banner');
    const transcriptEl = this.container.querySelector<HTMLElement>('#voice-live-transcript');
    const timerFillEl = this.container.querySelector<HTMLElement>('#voice-timer-bar-fill');
    const timerTextEl = this.container.querySelector<HTMLElement>('#voice-countdown-num');

    if (micBanner) {
      micBanner.style.display = isListening ? 'flex' : 'none';
    }
    if (transcriptEl) {
      transcriptEl.textContent = interimTranscript ? `"${interimTranscript}"` : 'Listening for song title...';
      transcriptEl.classList.toggle('has-text', Boolean(interimTranscript));
    }
    if (timerFillEl) {
      const pct = Math.max(0, Math.min(100, (remainingSec / 3.0) * 100));
      timerFillEl.style.width = `${pct}%`;
    }
    if (timerTextEl) {
      timerTextEl.textContent = `${remainingSec.toFixed(1)}s`;
    }
  }

  public startCountdownTimer(onTick?: (remaining: number) => void, onComplete?: () => void): void {
    this.stopCountdownTimer();

    const startTime = performance.now();
    this.countdownIntervalId = window.setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const remaining = Math.max(0, 3.0 - elapsed);
      this.setListeningState(true, remaining, this.liveTranscript);
      onTick?.(remaining);

      if (remaining <= 0) {
        this.stopCountdownTimer();
        onComplete?.();
      }
    }, 50);
  }

  public stopCountdownTimer(): void {
    if (this.countdownIntervalId !== null) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
  }

  private startPlaybackAnimation(): void {
    this.stopPlaybackAnimation();
    const updateFrame = () => {
      if (!this.state || this.state.type !== 'playing') return;
      const getPos = this.callbacks.getCurrentPlaybackTime;
      const currentTime = getPos ? getPos() : 0;
      this.updateProgressPosition(currentTime);
      this.animFrameId = requestAnimationFrame(updateFrame);
    };
    this.animFrameId = requestAnimationFrame(updateFrame);
  }

  private stopPlaybackAnimation(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private updateProgressPosition(currentTimeSec: number): void {
    const clampedTime = Math.min(currentTimeSec, MAX_VOICE_DURATION_SEC);
    const pct = Math.min(100, (clampedTime / MAX_VOICE_DURATION_SEC) * 100);

    const fillEl = this.container.querySelector<HTMLElement>('#voice-timeline-fill');
    const playheadEl = this.container.querySelector<HTMLElement>('#voice-timeline-playhead');
    const timeCurrentEl = this.container.querySelector<HTMLElement>('#voice-time-current');

    if (fillEl) fillEl.style.width = `${pct}%`;
    if (playheadEl) playheadEl.style.left = `${pct}%`;
    if (timeCurrentEl) {
      timeCurrentEl.textContent = `${clampedTime.toFixed(1)}s`;
    }
  }

  private render(): void {
    if (!this.state) return;

    const supported = isSpeechRecognitionSupported();

    if (this.state.type === 'ready') {
      this.container.innerHTML = `
        <div class="voice-ready-card">
          <div class="voice-ready-icon-wrap" aria-hidden="true">
            <svg class="voice-mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </div>
          <h2 class="voice-ready-title">Voice Buzzer Mode</h2>
          <p class="voice-ready-desc">
            Audio plays continuously. Hit the <strong>BUZZ</strong> button the second you know the track,
            then speak the <strong>song title</strong> within 3 seconds!
          </p>

          ${!supported
          ? `
            <div class="voice-warning-pill">
              ⚠️ Speech recognition is not currently supported on this browser. This game mode may not work as expected.
            </div>
          `
          : ''
        }

          <div class="voice-lives-preview" aria-label="3 lives per round">
            <span class="voice-life-icon">❤️</span>
            <span class="voice-life-icon">❤️</span>
            <span class="voice-life-icon">❤️</span>
            <span class="voice-lives-text">3 Lives</span>
          </div>

          <button type="button" class="btn-voice-begin" id="btn-voice-begin">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Begin Clip <span class="btn-shortcut-hint">[Spacebar]</span></span>
          </button>
        </div>
      `;
      this.bindReadyEvents();
      return;
    }

    if (this.state.type !== 'playing' && this.state.type !== 'buzzed') {
      return;
    }

    const lives = this.state.livesRemaining;
    const attempts = this.state.attempts;
    const isBuzzed = this.state.type === 'buzzed';
    const buzzedTime = this.state.type === 'buzzed' ? this.state.buzzedTimeSec : 0;

    this.container.innerHTML = `
      <!-- Top Status Row: Time & Lives -->
      <div class="voice-status-row">
        <div class="voice-time-display">
          <span id="voice-time-current">${isBuzzed ? buzzedTime.toFixed(1) : '0.0'}s</span>
          <span class="voice-time-sep">/</span>
          <span class="voice-time-max">30.0s</span>
        </div>

        <div class="voice-lives-bar" aria-label="${lives} lives remaining">
          ${[1, 2, 3]
        .map((i) => {
          const active = i <= lives;
          return `<span class="voice-heart ${active ? 'is-active' : 'is-lost'}">${active ? '❤️' : '💔'}</span>`;
        })
        .join('')}
        </div>
      </div>

      <!-- Linear Progress Track -->
      <div class="timeline-container" role="region" aria-label="Continuous audio timeline">
        <div class="timeline-track-wrap">
          <div class="timeline-track">
            <div class="timeline-progress-fill voice-progress-fill" id="voice-timeline-fill" style="width: 0%"></div>
            <div class="timeline-playhead" id="voice-timeline-playhead" style="left: 0%"></div>
          </div>
        </div>
      </div>

      <!-- Main Action Area -->
      <div class="voice-action-zone">
        <!-- 3s Listening Countdown Banner (shown during buzzed state) -->
        <div class="voice-listening-banner" id="voice-listening-banner" style="display: ${isBuzzed ? 'flex' : 'none'}">
          <div class="voice-listening-header">
            <div class="voice-listening-pulse-ring" aria-hidden="true"></div>
            <span class="voice-listening-label">🎙️ Speak song title!</span>
            <span class="voice-countdown-num" id="voice-countdown-num">3.0s</span>
          </div>

          <div class="voice-timer-bar">
            <div class="voice-timer-bar-fill" id="voice-timer-bar-fill" style="width: 100%"></div>
          </div>

          <div class="voice-live-transcript" id="voice-live-transcript">
            Listening for song title...
          </div>

          <div class="voice-listening-footer">
            <span class="voice-listening-hint">Auto-submits on pause, or press:</span>
            <button type="button" class="btn-voice-submit" id="btn-voice-submit" aria-label="Submit spoken guess now">
              Done [↵]
            </button>
          </div>
        </div>

        <!-- Buzzer Button & Give Up -->
        ${!isBuzzed
        ? `
          <button type="button" class="btn-buzzer" id="btn-buzzer" aria-label="Buzz in to guess song">
            <div class="buzzer-inner">
              <span class="buzzer-icon">⚡</span>
              <span class="buzzer-text">BUZZ IN</span>
              <span class="buzzer-shortcut">[SPACEBAR]</span>
            </div>
          </button>

          <button type="button" class="btn-voice-giveup" id="btn-voice-giveup" aria-label="Give up round">
            <span class="giveup-icon">🏳️</span>
            <span class="giveup-text">Give Up</span>
            <span class="giveup-shortcut">[ESC]</span>
          </button>
        `
        : `
          <div class="buzzer-locked-card">
            <span>Buzzed at <strong>${buzzedTime.toFixed(2)}s</strong></span>
          </div>
        `
      }
      </div>

      <!-- Attempt History Pills -->
      ${attempts.length > 0
        ? `
        <div class="voice-attempts-list" role="region" aria-label="Spoken guess history">
          ${attempts
          .map(
            (att) => `
            <div class="voice-attempt-pill ${att.wasCorrect ? 'is-correct' : 'is-wrong'}">
              <span class="attempt-time">${att.buzzedTimeSec.toFixed(1)}s</span>
              <span class="attempt-transcript">"${escapeHtml(att.transcript)}"</span>
              <span class="attempt-icon">${att.wasCorrect ? '✓' : '✕'}</span>
            </div>
          `
          )
          .join('')}
        </div>
      `
        : ''
      }
    `;

    this.bindActionEvents();
  }

  private bindReadyEvents(): void {
    const beginBtn = this.container.querySelector<HTMLButtonElement>('#btn-voice-begin');
    if (beginBtn) {
      beginBtn.addEventListener('click', () => this.callbacks.onBeginClip());
    }

    const handleReadyKeydown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.code === 'Space' && this.state?.type === 'ready') {
        e.preventDefault();
        this.callbacks.onBeginClip();
      }
    };

    window.removeEventListener('keydown', (this as any)._spaceHandler);
    (this as any)._spaceHandler = handleReadyKeydown;
    window.addEventListener('keydown', handleReadyKeydown);
  }

  private bindActionEvents(): void {
    const buzzBtn = this.container.querySelector<HTMLButtonElement>('#btn-buzzer');
    if (buzzBtn) {
      buzzBtn.addEventListener('click', () => this.callbacks.onBuzzIn());
    }

    const giveUpBtn = this.container.querySelector<HTMLButtonElement>('#btn-voice-giveup');
    if (giveUpBtn) {
      giveUpBtn.addEventListener('click', () => {
        this.callbacks.onGiveUp?.();
      });
    }

    const submitBtn = this.container.querySelector<HTMLButtonElement>('#btn-voice-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.callbacks.onSubmitEarly?.();
      });
    }

    // Spacebar, Enter, & Escape listener
    const handleKeydown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.code === 'Space') {
        if (this.state?.type === 'playing') {
          e.preventDefault();
          this.callbacks.onBuzzIn();
        } else if (this.state?.type === 'buzzed') {
          e.preventDefault();
          this.callbacks.onSubmitEarly?.();
        }
      } else if (e.code === 'Enter') {
        if (this.state?.type === 'buzzed') {
          e.preventDefault();
          this.callbacks.onSubmitEarly?.();
        }
      } else if (e.code === 'Escape') {
        if (this.state?.type === 'playing') {
          e.preventDefault();
          this.callbacks.onGiveUp?.();
        }
      }
    };

    window.removeEventListener('keydown', (this as any)._spaceHandler);
    (this as any)._spaceHandler = handleKeydown;
    window.addEventListener('keydown', handleKeydown);
  }
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
