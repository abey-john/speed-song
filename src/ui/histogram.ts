import { GameStats, BucketKey, calculateWinPercentage } from '../stats/store';
import {
  VoiceGameStats,
  VoiceBracketKey,
  calculateVoiceWinPercentage,
  calculateVoiceAverageWinTime,
} from '../stats/voice-store';

export interface HistogramCallbacks {
  onReset: () => void;
  onResetVoice?: () => void;
  onClose: () => void;
}

export function renderStatsModal(
  stats: GameStats,
  voiceStats: VoiceGameStats,
  callbacks: HistogramCallbacks,
  activeTab: 'classic' | 'voice' = 'classic'
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'stats-modal-backdrop';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'stats-title');

  let currentTab: 'classic' | 'voice' = activeTab;

  function renderContent(): void {
    const isClassic = currentTab === 'classic';

    let bodyHtml = '';

    if (isClassic) {
      const winRate = calculateWinPercentage(stats);
      const buckets: { key: BucketKey; label: string }[] = [
        { key: '0.1', label: '0.1s' },
        { key: '0.5', label: '0.5s' },
        { key: '1', label: '1s' },
        { key: '3', label: '3s' },
        { key: '5', label: '5s' },
        { key: '10', label: '10s' },
        { key: '15', label: '15s' },
        { key: '30', label: '30s' },
        { key: 'missed', label: 'Miss' },
      ];

      let maxCount = 0;
      for (const b of buckets) {
        const val = stats.buckets[b.key] || 0;
        if (val > maxCount) maxCount = val;
      }
      const scaleMax = Math.max(maxCount, 1);

      bodyHtml = `
        <div class="stats-summary-grid">
          <div class="stat-metric-card">
            <span class="metric-value">${stats.played}</span>
            <span class="metric-label">Played</span>
          </div>
          <div class="stat-metric-card">
            <span class="metric-value">${winRate}%</span>
            <span class="metric-label">Win Rate</span>
          </div>
        </div>

        <h3 class="histogram-title">Snippet Guess Distribution</h3>
        <div class="histogram-bars" role="region" aria-label="Classic Guess Distribution Histogram">
          ${buckets
            .map((b) => {
              const count = stats.buckets[b.key] || 0;
              const pct = Math.max((count / scaleMax) * 100, 6);
              const isMiss = b.key === 'missed';
              return `
              <div class="histogram-row">
                <span class="row-label">${b.label}</span>
                <div class="row-bar-track">
                  <div class="row-bar-fill ${isMiss ? 'is-miss' : ''}" style="width: ${count > 0 ? pct : 0}%">
                    <span class="row-bar-count">${count}</span>
                  </div>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
    } else {
      // Voice Buzzer Stats (Option 1: Speed & Reaction Brackets)
      const voiceWinRate = calculateVoiceWinPercentage(voiceStats);
      const fastestTime = voiceStats.fastestTimeSec !== null ? `${voiceStats.fastestTimeSec}s` : '—';
      const avgTime = calculateVoiceAverageWinTime(voiceStats);
      const avgTimeStr = avgTime !== null ? `${avgTime}s` : '—';

      const voiceBrackets: { key: VoiceBracketKey; label: string }[] = [
        { key: '< 1.0s', label: '< 1.0s' },
        { key: '1.0s – 3.0s', label: '1–3s' },
        { key: '3.0s – 5.0s', label: '3–5s' },
        { key: '5.0s – 10.0s', label: '5–10s' },
        { key: '10.0s – 20.0s', label: '10–20s' },
        { key: '20.0s – 30.0s', label: '20–30s' },
        { key: 'missed', label: 'Miss' },
      ];

      let maxCount = 0;
      for (const b of voiceBrackets) {
        const val = voiceStats.brackets[b.key] || 0;
        if (val > maxCount) maxCount = val;
      }
      const scaleMax = Math.max(maxCount, 1);

      bodyHtml = `
        <div class="stats-summary-grid voice-stats-grid">
          <div class="stat-metric-card">
            <span class="metric-value">${voiceStats.played}</span>
            <span class="metric-label">Played</span>
          </div>
          <div class="stat-metric-card">
            <span class="metric-value">${voiceWinRate}%</span>
            <span class="metric-label">Win Rate</span>
          </div>
          <div class="stat-metric-card highlight-card">
            <span class="metric-value font-accent">${fastestTime}</span>
            <span class="metric-label">⚡ Fastest Buzz</span>
          </div>
          <div class="stat-metric-card">
            <span class="metric-value">${avgTimeStr}</span>
            <span class="metric-label">Avg Win Time</span>
          </div>
        </div>

        <h3 class="histogram-title">Buzzer Reaction Distribution</h3>
        <div class="histogram-bars" role="region" aria-label="Voice Buzzer Speed Distribution Histogram">
          ${voiceBrackets
            .map((b) => {
              const count = voiceStats.brackets[b.key] || 0;
              const pct = Math.max((count / scaleMax) * 100, 6);
              const isMiss = b.key === 'missed';
              return `
              <div class="histogram-row">
                <span class="row-label">${b.label}</span>
                <div class="row-bar-track">
                  <div class="row-bar-fill voice-bar-fill ${isMiss ? 'is-miss' : ''}" style="width: ${count > 0 ? pct : 0}%">
                    <span class="row-bar-count">${count}</span>
                  </div>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="stats-modal-content">
        <div class="stats-header">
          <h2 id="stats-title">Performance Stats</h2>
          <button type="button" class="btn-close" aria-label="Close stats modal">&times;</button>
        </div>

        <!-- Mode Tabs -->
        <div class="stats-tab-bar" role="tablist">
          <button
            type="button"
            class="stats-tab-btn ${isClassic ? 'is-active' : ''}"
            id="tab-btn-classic"
            role="tab"
            aria-selected="${isClassic}"
          >
            🎵 Classic
          </button>
          <button
            type="button"
            class="stats-tab-btn ${!isClassic ? 'is-active' : ''}"
            id="tab-btn-voice"
            role="tab"
            aria-selected="${!isClassic}"
          >
            🎙️ Voice Buzzer
          </button>
        </div>

        ${bodyHtml}

        <div class="stats-actions">
          <button type="button" class="btn-reset-stats" id="btn-reset-stats">Reset ${isClassic ? 'Classic' : 'Voice'} Stats</button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents(): void {
    const closeBtn = container.querySelector<HTMLButtonElement>('.btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => callbacks.onClose());
    }

    const tabClassic = container.querySelector<HTMLButtonElement>('#tab-btn-classic');
    const tabVoice = container.querySelector<HTMLButtonElement>('#tab-btn-voice');

    if (tabClassic) {
      tabClassic.addEventListener('click', () => {
        if (currentTab !== 'classic') {
          currentTab = 'classic';
          renderContent();
        }
      });
    }

    if (tabVoice) {
      tabVoice.addEventListener('click', () => {
        if (currentTab !== 'voice') {
          currentTab = 'voice';
          renderContent();
        }
      });
    }

    const resetBtn = container.querySelector<HTMLButtonElement>('#btn-reset-stats');
    let confirmPending = false;
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirmPending) {
          confirmPending = true;
          resetBtn.textContent = 'Click again to confirm reset';
          resetBtn.classList.add('confirm-state');
          setTimeout(() => {
            confirmPending = false;
            resetBtn.textContent = `Reset ${currentTab === 'classic' ? 'Classic' : 'Voice'} Stats`;
            resetBtn.classList.remove('confirm-state');
          }, 3000);
        } else {
          if (currentTab === 'classic') {
            callbacks.onReset();
          } else {
            callbacks.onResetVoice?.();
          }
        }
      });
    }
  }

  container.addEventListener('click', (e) => {
    if (e.target === container) {
      callbacks.onClose();
    }
  });

  renderContent();
  return container;
}
