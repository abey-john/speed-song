import { GameStats, BucketKey, calculateWinPercentage } from '../stats/store';

export interface HistogramCallbacks {
  onReset: () => void;
  onClose: () => void;
}

export function renderStatsModal(stats: GameStats, callbacks: HistogramCallbacks): HTMLElement {
  const container = document.createElement('div');
  container.className = 'stats-modal-backdrop';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'stats-title');

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

  // Find maximum bucket count to scale bar widths
  let maxCount = 0;
  for (const b of buckets) {
    const val = stats.buckets[b.key] || 0;
    if (val > maxCount) maxCount = val;
  }
  const scaleMax = Math.max(maxCount, 1);

  container.innerHTML = `
    <div class="stats-modal-content">
      <div class="stats-header">
        <h2 id="stats-title">Performance Stats</h2>
        <button type="button" class="btn-close" aria-label="Close stats modal">&times;</button>
      </div>

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

      <h3 class="histogram-title">Guess Distribution</h3>
      <div class="histogram-bars" role="region" aria-label="Guess Distribution Histogram">
        ${buckets
          .map((b) => {
            const count = stats.buckets[b.key] || 0;
            const pct = Math.max((count / scaleMax) * 100, 6); // min width for text
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

      <div class="stats-actions">
        <button type="button" class="btn-reset-stats" id="btn-reset-stats">Reset Stats</button>
      </div>
    </div>
  `;

  // Close handlers
  const closeBtn = container.querySelector<HTMLButtonElement>('.btn-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      callbacks.onClose();
    });
  }

  container.addEventListener('click', (e) => {
    if (e.target === container) {
      callbacks.onClose();
    }
  });

  // Reset confirmation step
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
          resetBtn.textContent = 'Reset Stats';
          resetBtn.classList.remove('confirm-state');
        }, 3000);
      } else {
        callbacks.onReset();
      }
    });
  }

  return container;
}
