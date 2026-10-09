import './ui/styles.css';
import { INTERVALS } from './data/types';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-icon" aria-hidden="true">⚡</div>
        <h1 class="brand-title">Speed Song</h1>
      </div>
      <div class="badge">
        <span class="badge-dot"></span>
        Ready
      </div>
    </header>

    <main class="hero-card">
      <span class="badge">Speed Run Mode</span>
      <h2>Guess the song in seconds</h2>
      <p>
        Listen to progressively longer snippets starting at just 0.1s. Guess using the search box or skip to the next interval.
      </p>

      <div class="interval-preview" aria-label="Interval progression preview">
        ${INTERVALS.map(
          (sec, i) => `
          <div class="interval-pill ${i === 0 ? 'active' : ''}">
            <span>${sec}s</span>
          </div>
        `
        ).join('')}
      </div>
    </main>

    <footer class="app-footer">
      <p>
        Playlist data from <a href="https://spotify.com" target="_blank" rel="noopener noreferrer">Spotify</a> &bull;
        Previews and artwork from <a href="https://apple.com" target="_blank" rel="noopener noreferrer">Apple</a>
      </p>
    </footer>
  `;
}
