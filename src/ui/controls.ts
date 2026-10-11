import { INTERVALS, IntervalStep, Song } from '../data/types';
import { WrongGuess } from '../game/state';
import { filterSongs, highlightMatch } from './search';
import { createLabel } from '../../scripts/data/normalize';

const MAX_TIMELINE_SEC = 15;

export interface GameControlsCallbacks {
  onPlaySnippet: () => void;
  onSkip: () => void;
  onSubmitGuess: (song: Song) => void;
  getCurrentPlaybackTime?: () => number;
}

export class GameControls {
  private container: HTMLElement;
  private callbacks: GameControlsCallbacks;
  private currentStep = 0;
  private wrongGuesses: WrongGuess[] = [];
  private availableSongs: Song[] = [];
  private selectedSong: Song | null = null;
  private activeSuggestionIndex = -1;
  private currentSuggestions: Song[] = [];
  private isPlaying = false;
  private animFrameId: number | null = null;

  constructor(callbacks: GameControlsCallbacks) {
    this.container = document.createElement('div');
    this.container.className = 'game-controls-container';
    this.callbacks = callbacks;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public update(options: {
    step: number;
    wrongGuesses: WrongGuess[];
    availableSongs: Song[];
    isPlaying: boolean;
  }): void {
    this.currentStep = options.step;
    this.wrongGuesses = options.wrongGuesses;
    this.availableSongs = options.availableSongs;
    this.selectedSong = null;
    this.activeSuggestionIndex = -1;
    this.currentSuggestions = [];

    this.render(options.isPlaying);
    this.setPlayingState(options.isPlaying);
  }

  public setPlayingState(isPlaying: boolean): void {
    this.isPlaying = isPlaying;
    const currentDuration: IntervalStep = INTERVALS[this.currentStep] ?? 15;
    const playBtn = this.container.querySelector<HTMLButtonElement>('#btn-play-snippet');

    if (playBtn) {
      if (isPlaying) {
        playBtn.classList.add('is-playing');
        playBtn.innerHTML = `
          <span class="btn-icon" aria-hidden="true">⏸</span>
          <span>Pause (${currentDuration}s)</span>
        `;
        playBtn.setAttribute('aria-label', `Pause snippet at ${currentDuration} seconds`);
      } else {
        playBtn.classList.remove('is-playing');
        playBtn.innerHTML = `
          <span class="btn-icon" aria-hidden="true">▶</span>
          <span>Play Snippet (${currentDuration}s)</span>
        `;
        playBtn.setAttribute('aria-label', `Play snippet of ${currentDuration} seconds`);
      }
    }

    if (isPlaying) {
      this.startAnimation();
    } else {
      this.stopAnimation();
      this.resetProgressPosition();
    }
  }

  private startAnimation(): void {
    this.stopAnimation();
    const updateFrame = () => {
      if (!this.isPlaying) return;
      const getPos = this.callbacks.getCurrentPlaybackTime;
      const currentTime = getPos ? getPos() : 0;
      this.updateProgressPosition(currentTime);
      this.animFrameId = requestAnimationFrame(updateFrame);
    };
    this.animFrameId = requestAnimationFrame(updateFrame);
  }

  private stopAnimation(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private updateProgressPosition(currentTimeSec: number): void {
    const currentDuration: IntervalStep = INTERVALS[this.currentStep] ?? 15;
    const clampedTime = Math.min(currentTimeSec, currentDuration);
    const pct = Math.min(100, (clampedTime / MAX_TIMELINE_SEC) * 100);

    const fillEl = this.container.querySelector<HTMLElement>('#timeline-fill');
    const playheadEl = this.container.querySelector<HTMLElement>('#timeline-playhead');
    const timeCurrentEl = this.container.querySelector<HTMLElement>('#time-current');

    if (fillEl) fillEl.style.width = `${pct}%`;
    if (playheadEl) playheadEl.style.left = `${pct}%`;
    if (timeCurrentEl) {
      timeCurrentEl.textContent = `${clampedTime.toFixed(1)}s`;
    }
  }

  private resetProgressPosition(): void {
    const fillEl = this.container.querySelector<HTMLElement>('#timeline-fill');
    const playheadEl = this.container.querySelector<HTMLElement>('#timeline-playhead');
    const timeCurrentEl = this.container.querySelector<HTMLElement>('#time-current');

    if (fillEl) fillEl.style.width = '0%';
    if (playheadEl) playheadEl.style.left = '0%';
    if (timeCurrentEl) timeCurrentEl.textContent = '0.0s';
  }

  private render(isPlaying: boolean): void {
    const currentDuration: IntervalStep = INTERVALS[this.currentStep] ?? 15;
    const unlockedPct = Math.min(100, (currentDuration / MAX_TIMELINE_SEC) * 100);
    this.container.innerHTML = `
      <!-- Continuous Linear Timeline (0 to 15s) -->
      <div class="timeline-container" role="region" aria-label="Audio timeline up to ${currentDuration}s">
        <div class="timeline-meta">
          <div class="timeline-time" aria-live="off">
            <span class="time-current" id="time-current">0.0s</span>
            <span class="time-sep">/</span>
            <span class="time-max" id="time-max">${currentDuration}s</span>
          </div>
        </div>

        <div class="timeline-track-wrap">
          <div class="timeline-track" id="timeline-track">
            <!-- Unlocked Window -->
            <div
              class="timeline-unlocked-zone"
              id="timeline-unlocked"
              style="width: ${unlockedPct}%"
              title="Unlocked up to ${currentDuration}s"
            ></div>

            <!-- Active Playback Fill -->
            <div class="timeline-progress-fill" id="timeline-fill" style="width: 0%"></div>

            <!-- Playhead Handle -->
            <div class="timeline-playhead" id="timeline-playhead" style="left: 0%"></div>

            <!-- Interval Ticks: 0.1s, 0.5s, 1s, 3s, 5s, 10s, 15s -->
            ${INTERVALS.map((duration) => {
              const tickPct = (duration / MAX_TIMELINE_SEC) * 100;
              const isUnlocked = duration <= currentDuration;
              return `
                <div
                  class="timeline-tick ${isUnlocked ? 'is-unlocked' : ''}"
                  style="left: ${tickPct}%"
                  title="${duration}s milestone"
                ></div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Milestone Markers Underneath -->
        <div class="timeline-labels" aria-hidden="true">
          <span class="timeline-label" style="left: 0%">0s</span>
          <span class="timeline-label" style="left: ${(1 / MAX_TIMELINE_SEC) * 100}%">1s</span>
          <span class="timeline-label" style="left: ${(3 / MAX_TIMELINE_SEC) * 100}%">3s</span>
          <span class="timeline-label" style="left: ${(5 / MAX_TIMELINE_SEC) * 100}%">5s</span>
          <span class="timeline-label" style="left: ${(10 / MAX_TIMELINE_SEC) * 100}%">10s</span>
          <span class="timeline-label" style="left: 100%">15s</span>
        </div>
      </div>

      <!-- Playback and Skip Buttons -->
      <div class="playback-controls">
        <button
          type="button"
          class="btn-play ${isPlaying ? 'is-playing' : ''}"
          id="btn-play-snippet"
          aria-label="${isPlaying ? `Pause snippet at ${currentDuration} seconds` : `Play snippet of ${currentDuration} seconds`}"
        >
          <span class="btn-icon" aria-hidden="true">${isPlaying ? '⏸' : '▶'}</span>
          <span>${isPlaying ? `Pause (${currentDuration}s)` : `Play Snippet (${currentDuration}s)`}</span>
        </button>

        <button type="button" class="btn-skip" id="btn-skip" aria-label="Skip to next snippet duration">
          Skip (+next)
        </button>
      </div>

      <!-- Wrong Guesses History -->
      <div class="wrong-guesses-list" role="region" aria-live="polite" aria-label="Previous guesses">
        ${this.wrongGuesses
          .map((wg) => `
            <div class="wrong-guess-pill ${wg.wasSkipped ? 'was-skipped' : 'was-incorrect'}">
              <span class="wrong-step-badge">${wg.durationSec}s</span>
              <span class="wrong-label">${wg.wasSkipped ? 'Skipped' : escapeHtml(wg.guessLabel || '')}</span>
              <span class="wrong-icon">${wg.wasSkipped ? '⏭' : '✕'}</span>
            </div>
          `)
          .join('')}
      </div>

      <!-- Combobox Search Input -->
      <div class="combobox-wrapper">
        <div class="search-input-group">
          <input
            type="text"
            id="song-search-input"
            role="combobox"
            aria-expanded="false"
            aria-autocomplete="list"
            aria-controls="search-suggestions-list"
            placeholder="Search song title or artist..."
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="btn-submit-guess" id="btn-submit-guess" disabled>
            Submit
          </button>
        </div>

        <ul
          id="search-suggestions-list"
          class="suggestions-list"
          role="listbox"
          aria-label="Song suggestions"
          style="display: none;"
        ></ul>
      </div>

      <!-- Hidden ARIA Live Announcer -->
      <div id="aria-announcer" class="sr-only" aria-live="assertive"></div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const playBtn = this.container.querySelector<HTMLButtonElement>('#btn-play-snippet');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.callbacks.onPlaySnippet());
    }

    const skipBtn = this.container.querySelector<HTMLButtonElement>('#btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.callbacks.onSkip());
    }

    const input = this.container.querySelector<HTMLInputElement>('#song-search-input');
    const listbox = this.container.querySelector<HTMLUListElement>('#search-suggestions-list');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('#btn-submit-guess');

    if (!input || !listbox || !submitBtn) return;

    submitBtn.addEventListener('click', () => {
      if (this.selectedSong) {
        this.callbacks.onSubmitGuess(this.selectedSong);
      }
    });

    const excludedIds = new Set(this.wrongGuesses.map((wg) => wg.guessId).filter((id): id is string => Boolean(id)));

    input.addEventListener('input', () => {
      const q = input.value;
      this.selectedSong = null;
      submitBtn.disabled = true;

      if (!q.trim()) {
        listbox.style.display = 'none';
        input.setAttribute('aria-expanded', 'false');
        this.currentSuggestions = [];
        return;
      }

      const matches = filterSongs(q, this.availableSongs, excludedIds, 8);
      this.currentSuggestions = matches.map((m) => m.song);
      this.activeSuggestionIndex = -1;

      if (matches.length === 0) {
        listbox.innerHTML = `<li class="no-suggestions">No songs matching "${escapeHtml(q)}"</li>`;
        listbox.style.display = 'block';
        input.setAttribute('aria-expanded', 'true');
        return;
      }

      listbox.innerHTML = matches
        .map(
          (m, idx) => `
          <li
            id="suggestion-option-${idx}"
            role="option"
            aria-selected="false"
            class="suggestion-item"
            data-index="${idx}"
          >
            ${highlightMatch(m.label, m.matchedIndices)}
          </li>
        `
        )
        .join('');

      listbox.style.display = 'block';
      input.setAttribute('aria-expanded', 'true');
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      const count = this.currentSuggestions.length;
      if (count === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeSuggestionIndex = (this.activeSuggestionIndex + 1) % count;
        this.updateActiveSuggestion(listbox, input);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeSuggestionIndex = (this.activeSuggestionIndex - 1 + count) % count;
        this.updateActiveSuggestion(listbox, input);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.activeSuggestionIndex >= 0 && this.activeSuggestionIndex < count) {
          this.pickSuggestion(this.activeSuggestionIndex, input, listbox, submitBtn);
        } else if (this.selectedSong) {
          this.callbacks.onSubmitGuess(this.selectedSong);
        }
      } else if (e.key === 'Escape') {
        listbox.style.display = 'none';
        input.setAttribute('aria-expanded', 'false');
      }
    });

    // Click selection
    listbox.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLLIElement>('.suggestion-item');
      if (item && item.dataset.index) {
        const idx = parseInt(item.dataset.index, 10);
        this.pickSuggestion(idx, input, listbox, submitBtn);
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        listbox.style.display = 'none';
        input.setAttribute('aria-expanded', 'false');
      }
    });
  }

  private updateActiveSuggestion(listbox: HTMLUListElement, input: HTMLInputElement): void {
    const items = listbox.querySelectorAll<HTMLLIElement>('.suggestion-item');
    items.forEach((item, idx) => {
      const isSelected = idx === this.activeSuggestionIndex;
      item.classList.toggle('active', isSelected);
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        input.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private pickSuggestion(
    idx: number,
    input: HTMLInputElement,
    listbox: HTMLUListElement,
    submitBtn: HTMLButtonElement
  ): void {
    const song = this.currentSuggestions[idx];
    if (song) {
      this.selectedSong = song;
      input.value = createLabel(song.title, song.artist);
      submitBtn.disabled = false;
      listbox.style.display = 'none';
      input.setAttribute('aria-expanded', 'false');
      input.focus();
    }
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
