import './ui/styles.css';
import { loadManifest, loadPlaylist } from './data/loader';
import { Manifest, PlaylistFile, Song, INTERVALS } from './data/types';
import { ShuffleBag } from './game/bag';
import { GameState, startRound, submitGuess, submitSkip } from './game/state';
import { audioEngine } from './audio/engine';
import { GameControls } from './ui/controls';
import { renderReveal, preloadArtwork } from './ui/reveal';
import { loadStats, saveStats, recordRoundOutcome, resetStats } from './stats/store';
import { renderStatsModal } from './ui/histogram';

const LAST_PLAYLIST_KEY = 'speed-song:last-playlist:v1';
const isDebugMode = new URLSearchParams(window.location.search).get('debug') === '1';

class SpeedSongApp {
  private root: HTMLElement;
  private manifest: Manifest | null = null;
  private currentPlaylist: PlaylistFile | null = null;
  private shuffleBag: ShuffleBag<Song> | null = null;
  private nextSong: Song | null = null;
  private state: GameState = { type: 'idle', selectedPlaylistId: null };
  private controls: GameControls;
  private isPlayingFullPreview = false;
  private prefetchTimer: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.controls = new GameControls({
      onPlaySnippet: () => this.handlePlaySnippet(),
      onSkip: () => this.handleSkip(),
      onSubmitGuess: (song: Song) => this.handleGuess(song),
      getCurrentPlaybackTime: () => audioEngine.getCurrentTime(),
    });
  }

  public async init(): Promise<void> {
    this.renderLoading('Loading playlists...');

    try {
      this.manifest = await loadManifest();
      if (this.manifest.playlists.length === 0) {
        this.renderError('No playlists found in manifest.');
        return;
      }

      // Default to compendium, or restore user's explicit saved choice
      const compendium =
        this.manifest.playlists.find((p) => p.name.toLowerCase().trim() === 'compendium') ||
        this.manifest.playlists[0]!;

      const savedId = localStorage.getItem(LAST_PLAYLIST_KEY);
      const isStaleOldDefault = savedId === '3CpV0J5JEMkTYnLlOoEaWs';
      const saved = savedId && !isStaleOldDefault
        ? this.manifest.playlists.find((p) => p.id === savedId)
        : undefined;

      const chosen = saved || compendium;
      await this.selectPlaylist(chosen.id);
    } catch (err) {
      console.error('[app] Init error:', err);
      this.renderError('Failed to load game data. Please refresh or build data.');
    }
  }

  private async selectPlaylist(playlistId: string): Promise<void> {
    if (!this.manifest) return;
    const entry = this.manifest.playlists.find((p) => p.id === playlistId);
    if (!entry) return;

    localStorage.setItem(LAST_PLAYLIST_KEY, playlistId);
    this.renderLoading(`Loading ${entry.name}...`);

    if (this.prefetchTimer !== null) {
      window.clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
    this.nextSong = null;

    try {
      this.currentPlaylist = await loadPlaylist(entry.file);
      this.shuffleBag = new ShuffleBag(this.currentPlaylist.songs);
      this.nextSong = null;
      this.state = { type: 'idle', selectedPlaylistId: playlistId };
      audioEngine.stop();
      this.render();
    } catch (err) {
      console.error('[app] Error loading playlist:', err);
      this.renderError(`Failed to load playlist "${entry.name}".`);
    }
  }

  private async startNewRound(): Promise<void> {
    if (!this.shuffleBag || !this.currentPlaylist) return;

    if (this.prefetchTimer !== null) {
      window.clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }

    audioEngine.stop();
    this.isPlayingFullPreview = false;

    // Pick song, ensuring candidate belongs strictly to current playlist
    const isValidPrefetch =
      this.nextSong && this.currentPlaylist.songs.some((s) => s.id === this.nextSong?.id);
    const song = isValidPrefetch ? this.nextSong! : this.shuffleBag.draw();
    this.nextSong = null;

    if (!song) {
      this.renderError('No songs available in this playlist.');
      return;
    }

    // Preload artwork offscreen
    preloadArtwork(song.artworkUrl);

    // Update state
    this.state = startRound(song, this.currentPlaylist.id);
    this.render();

    // Auto-unlock & auto-play step 0
    const duration = INTERVALS[0] ?? 0.1;
    this.playCurrentStep(duration);

    // Prefetch next song in background after 1s
    this.prefetchTimer = window.setTimeout(() => {
      this.prefetchTimer = null;
      if (this.shuffleBag && this.currentPlaylist) {
        const candidate = this.shuffleBag.draw();
        if (candidate) {
          this.nextSong = candidate;
          if (candidate.previewUrl) {
            audioEngine.preloadSong(candidate.previewUrl);
          }
        }
      }
    }, 1000);
  }

  private async playCurrentStep(durationSec: number): Promise<void> {
    if (this.state.type !== 'guessing') return;
    const url = this.state.song.previewUrl;

    this.controls.setPlayingState(true);
    await audioEngine.playSnippet(url, durationSec, () => {
      this.controls.setPlayingState(false);
      this.updateDebugBar();
    });
    this.updateDebugBar();
  }

  private handlePlaySnippet(): void {
    if (this.state.type !== 'guessing') return;
    if (audioEngine.isPlaying()) {
      audioEngine.stop();
      this.controls.setPlayingState(false);
      this.updateDebugBar();
      return;
    }
    const duration = INTERVALS[this.state.step] ?? 15;
    this.playCurrentStep(duration);
  }

  private handleSkip(): void {
    if (this.state.type !== 'guessing') return;

    const wasPlaying = audioEngine.isPlaying();
    const next = submitSkip(this.state);
    this.state = next;

    if (next.type === 'revealed') {
      audioEngine.stop();
      this.controls.setPlayingState(false);
      this.handleGameOver(next.result);
      return;
    }

    if (next.type === 'guessing') {
      const nextDuration = INTERVALS[next.step] ?? 15;
      if (wasPlaying) {
        const extended = audioEngine.extendDuration(nextDuration, () => {
          this.controls.setPlayingState(false);
          this.updateDebugBar();
        });
        if (extended) {
          this.controls.update({
            step: next.step,
            wrongGuesses: next.wrongGuesses,
            availableSongs: this.currentPlaylist?.songs || [],
            isPlaying: true,
          });
          this.updateDebugBar();
          return;
        }
      }

      this.controls.update({
        step: next.step,
        wrongGuesses: next.wrongGuesses,
        availableSongs: this.currentPlaylist?.songs || [],
        isPlaying: false,
      });
      this.playCurrentStep(nextDuration);
    }
  }

  private handleGuess(guessedSong: Song): void {
    if (this.state.type !== 'guessing') return;

    const wasPlaying = audioEngine.isPlaying();
    const next = submitGuess(this.state, guessedSong.id, `${guessedSong.title} — ${guessedSong.artist}`);
    this.state = next;

    if (next.type === 'revealed') {
      audioEngine.stop();
      this.controls.setPlayingState(false);
      this.handleGameOver(next.result);
      return;
    }

    if (next.type === 'guessing') {
      const nextDuration = INTERVALS[next.step] ?? 15;
      if (wasPlaying) {
        const extended = audioEngine.extendDuration(nextDuration, () => {
          this.controls.setPlayingState(false);
          this.updateDebugBar();
        });
        if (extended) {
          this.controls.update({
            step: next.step,
            wrongGuesses: next.wrongGuesses,
            availableSongs: this.currentPlaylist?.songs || [],
            isPlaying: true,
          });
          this.updateDebugBar();
          return;
        }
      }

      this.controls.update({
        step: next.step,
        wrongGuesses: next.wrongGuesses,
        availableSongs: this.currentPlaylist?.songs || [],
        isPlaying: false,
      });
      this.playCurrentStep(nextDuration);
    }
  }

  private handleGameOver(result: { outcome: 'guessed'; stepIndex: number } | { outcome: 'missed' }): void {
    const stats = loadStats();
    let updatedStats;

    if (result.outcome === 'guessed') {
      const stepKey = String(INTERVALS[result.stepIndex]) as any;
      updatedStats = recordRoundOutcome(stats, stepKey);
    } else {
      updatedStats = recordRoundOutcome(stats, 'missed');
    }

    saveStats(updatedStats);
    this.render();
  }

  private toggleFullPreview(): void {
    if (this.state.type !== 'revealed') return;
    const url = this.state.song.previewUrl;

    if (this.isPlayingFullPreview) {
      audioEngine.stop();
      this.isPlayingFullPreview = false;
      this.render();
    } else {
      this.isPlayingFullPreview = true;
      this.render();
      audioEngine.playSnippet(url, 30, () => {
        this.isPlayingFullPreview = false;
        this.render();
      });
    }
  }

  private openStatsModal(): void {
    const stats = loadStats();
    const modal = renderStatsModal(stats, {
      onClose: () => modal.remove(),
      onReset: () => {
        resetStats();
        modal.remove();
        this.openStatsModal();
      },
    });
    document.body.appendChild(modal);
  }

  private render(): void {
    this.root.innerHTML = '';

    // 1. Header
    const header = document.createElement('header');
    header.className = 'app-header';
    header.innerHTML = `
      <div class="brand">
        <div class="brand-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="lucide-headphones">
            <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>
          </svg>
        </div>
        <h1 class="brand-title">Speed Song</h1>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-header" id="btn-stats" aria-label="View stats">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stats-icon" aria-hidden="true">
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7" />
          </svg>
          <span>Stats</span>
        </button>
      </div>
    `;

    header.querySelector('#btn-stats')?.addEventListener('click', () => this.openStatsModal());
    this.root.appendChild(header);

    // 2. Playlist Selector
    if (this.manifest && this.manifest.playlists.length > 0) {
      const selectorWrap = document.createElement('div');
      selectorWrap.className = 'playlist-select-wrapper';
      selectorWrap.innerHTML = `
        <label for="playlist-select" class="playlist-select-label">Select Playlist</label>
        <select id="playlist-select" class="playlist-select">
          ${this.manifest.playlists
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === this.currentPlaylist?.id ? 'selected' : ''}>
                  ${escapeHtml(p.name)} (${p.songCount} songs)
                </option>`
          )
          .join('')}
        </select>
      `;

      selectorWrap.querySelector('select')?.addEventListener('change', (e) => {
        const id = (e.target as HTMLSelectElement).value;
        this.selectPlaylist(id);
      });

      this.root.appendChild(selectorWrap);
    }

    // 3. Debug bar if ?debug=1
    if (isDebugMode) {
      const debugDiv = document.createElement('div');
      debugDiv.id = 'debug-bar';
      debugDiv.className = 'debug-bar';
      this.root.appendChild(debugDiv);
      this.updateDebugBar();
    }

    // 4. Main Game Container
    const main = document.createElement('main');
    main.id = 'game-main-container';
    this.root.appendChild(main);
    this.renderGameArea();

    // 5. Footer
    const footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.innerHTML = `
      <p>
        Playlist data from <a href="https://spotify.com" target="_blank" rel="noopener noreferrer">Spotify</a> &bull;
        Previews and artwork from <a href="https://apple.com" target="_blank" rel="noopener noreferrer">Apple</a>
      </p>
    `;
    this.root.appendChild(footer);
  }

  private renderGameArea(): void {
    const main = this.root.querySelector('#game-main-container');
    if (!main) return;
    main.innerHTML = '';

    if (this.state.type === 'idle') {
      const card = document.createElement('div');
      card.className = 'hero-card';
      card.innerHTML = `
        <span class="badge">Speed Run Mode</span>
        <h2>Ready to test your ears?</h2>
        <p>
          Guess songs from my playlist <strong>${escapeHtml(this.currentPlaylist?.name || 'your playlist')}</strong> 
          as fast as you can!
        </p>
        <button type="button" class="btn-play" id="btn-start-game">
          Start Game ▶
        </button>
      `;

      card.querySelector('#btn-start-game')?.addEventListener('click', async () => {
        await audioEngine.unlock();
        this.startNewRound();
      });

      main.appendChild(card);
    } else if (this.state.type === 'guessing') {
      this.controls.update({
        step: this.state.step,
        wrongGuesses: this.state.wrongGuesses,
        availableSongs: this.currentPlaylist?.songs || [],
        isPlaying: audioEngine.isPlaying(),
      });
      main.appendChild(this.controls.getElement());
    } else if (this.state.type === 'revealed') {
      const revealEl = renderReveal(
        this.state.song,
        this.state.result,
        this.isPlayingFullPreview,
        {
          onNextRound: () => this.startNewRound(),
          onToggleFullPreview: () => this.toggleFullPreview(),
        }
      );
      main.appendChild(revealEl);
    }
  }

  private updateDebugBar(): void {
    if (!isDebugMode) return;
    const bar = document.getElementById('debug-bar');
    if (!bar) return;
    const info = audioEngine.getDebugInfo();
    bar.innerHTML = `
      <small style="font-family: monospace; color: #8fa0b8; display: block; padding: 4px 8px; background: #1a202c; border-radius: 4px; margin-bottom: 8px;">
        ⚙️ Audio: ${info.engine} | Ctx: ${info.audioContextState} | Silence Trim: ${(info.leadingSilenceSec ?? 0).toFixed(3)}s | Duration: ${(info.decodedDurationSec ?? 0).toFixed(1)}s
      </small>
    `;
  }

  private renderLoading(msg: string): void {
    this.root.innerHTML = `
      <div class="loading-screen" role="status" aria-live="polite">
        <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="loading-icon-audio" aria-hidden="true">
          <path d="M2 10v3" />
          <path d="M6 6v11" />
          <path d="M10 3v18" />
          <path d="M14 8v7" />
          <path d="M18 5v13" />
          <path d="M22 10v3" />
        </svg>
        <p class="loading-text">${escapeHtml(msg)}</p>
      </div>
    `;
  }

  private renderError(msg: string): void {
    this.root.innerHTML = `
      <div class="hero-card" style="margin-top: 40px; text-align: center;">
        <span class="badge" style="color: var(--color-wrong); border-color: var(--color-wrong);">Error</span>
        <h2>Something went wrong</h2>
        <p>${escapeHtml(msg)}</p>
        <button type="button" class="btn-play" onclick="location.reload()">Reload App</button>
      </div>
    `;
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

const appEl = document.querySelector<HTMLDivElement>('#app');
if (appEl) {
  const app = new SpeedSongApp(appEl);
  app.init();
}
