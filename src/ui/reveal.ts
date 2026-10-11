import { Song } from '../data/types';
import { RevealResult } from '../game/state';

const preloadedImages = new Map<string, HTMLImageElement>();

/**
 * Preloads artwork offscreen so it displays instantly when reveal triggers.
 */
export function preloadArtwork(url: string): void {
  if (!url || preloadedImages.has(url)) return;
  const img = new Image();
  img.src = url;
  preloadedImages.set(url, img);
}

export interface RevealCallbacks {
  onNextRound: () => void;
  onToggleFullPreview: () => void;
}

export type UniversalRevealResult =
  | RevealResult
  | { outcome: 'won'; timeSec: number }
  | { outcome: 'missed'; reason?: string };

export function renderReveal(
  song: Song,
  result: UniversalRevealResult,
  isPlayingFullPreview: boolean,
  callbacks: RevealCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'reveal-card';

  const isSuccess = result.outcome === 'guessed' || result.outcome === 'won';
  let outcomeText = 'Missed!';
  if (result.outcome === 'guessed') {
    outcomeText = `Guessed at ${result.durationSec}s!`;
  } else if (result.outcome === 'won') {
    outcomeText = `🎙️ Buzzed at ${result.timeSec.toFixed(2)}s!`;
  }
  const outcomeClass = isSuccess ? 'outcome-success' : 'outcome-missed';

  container.innerHTML = `
    <div class="reveal-badge-banner ${outcomeClass}">
      <span class="outcome-icon">${isSuccess ? '🎉' : '❌'}</span>
      <span class="outcome-text">${outcomeText}</span>
    </div>

    <div class="reveal-art-container">
      ${
        song.artworkUrl
          ? `<img src="${song.artworkUrl}" alt="${escapeHtml(song.title)} album artwork" class="reveal-artwork" loading="eager" />`
          : `<div class="reveal-artwork-placeholder" aria-label="No artwork available">🎵</div>`
      }
    </div>

    <div class="reveal-info">
      <h2 class="reveal-title">${escapeHtml(song.title)}</h2>
      <p class="reveal-artist">${escapeHtml(song.artist)}</p>
      ${song.album ? `<p class="reveal-album">${escapeHtml(song.album)}</p>` : ''}
    </div>

    <div class="reveal-actions">
      <button type="button" class="btn-full-preview" id="btn-full-preview">
        <span class="btn-icon">${isPlayingFullPreview ? '⏹️' : '▶️'}</span>
        ${isPlayingFullPreview ? 'Stop Preview' : 'Play Full Preview'}
      </button>

      <button type="button" class="btn-next-round" id="btn-next-round">
        Next Song &rarr;
      </button>
    </div>
  `;

  // Image error handling fallback
  const img = container.querySelector<HTMLImageElement>('.reveal-artwork');
  if (img) {
    img.addEventListener('error', () => {
      const parent = img.parentElement;
      if (parent) {
        parent.innerHTML = `<div class="reveal-artwork-placeholder">🎵</div>`;
      }
    });
  }

  // Next round
  const nextBtn = container.querySelector<HTMLButtonElement>('#btn-next-round');
  if (nextBtn) {
    nextBtn.addEventListener('click', callbacks.onNextRound);
  }

  // Full preview toggle
  const previewBtn = container.querySelector<HTMLButtonElement>('#btn-full-preview');
  if (previewBtn) {
    previewBtn.addEventListener('click', callbacks.onToggleFullPreview);
  }

  return container;
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
