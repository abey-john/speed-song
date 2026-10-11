export const STATS_STORAGE_KEY = 'snippet-game:stats:v1';

export type BucketKey = '0.1' | '0.5' | '1' | '3' | '5' | '10' | '15' | '30' | 'missed';

export interface GameStats {
  version: 1;
  played: number;
  buckets: Record<BucketKey, number>;
}

let inMemoryStatsFallback: GameStats | null = null;

export function createEmptyStats(): GameStats {
  return {
    version: 1,
    played: 0,
    buckets: {
      '0.1': 0,
      '0.5': 0,
      '1': 0,
      '3': 0,
      '5': 0,
      '10': 0,
      '15': 0,
      '30': 0,
      missed: 0,
    },
  };
}

export function isValidStats(obj: unknown): obj is GameStats {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Partial<GameStats>;
  if (s.version !== 1 || typeof s.played !== 'number' || !s.buckets || typeof s.buckets !== 'object') {
    return false;
  }
  const keys: BucketKey[] = ['0.1', '0.5', '1', '3', '5', '10', '15', '30', 'missed'];
  return keys.every((k) => typeof (s.buckets as Record<string, unknown>)?.[k] === 'number');
}

export function clearInMemoryFallback(): void {
  inMemoryStatsFallback = null;
}

export function loadStats(storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null): GameStats {
  if (storage) {
    try {
      const raw = storage.getItem(STATS_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (isValidStats(parsed)) {
          return parsed;
        }
        // Corruption or invalid schema -> reset to empty
        const empty = createEmptyStats();
        storage.setItem(STATS_STORAGE_KEY, JSON.stringify(empty));
        return empty;
      }
    } catch {
      // JSON parse error -> reset to empty
      const empty = createEmptyStats();
      try {
        storage.setItem(STATS_STORAGE_KEY, JSON.stringify(empty));
      } catch {}
      return empty;
    }
  }

  if (!inMemoryStatsFallback) {
    inMemoryStatsFallback = createEmptyStats();
  }
  return inMemoryStatsFallback;
}

export function saveStats(stats: GameStats, storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null): void {
  inMemoryStatsFallback = stats;
  if (storage) {
    try {
      storage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch {
      // Storage quota or privacy mode blocked
    }
  }
}

export function recordRoundOutcome(
  stats: GameStats,
  outcome: 'missed' | BucketKey
): GameStats {
  const nextBuckets = { ...stats.buckets };
  nextBuckets[outcome] = (nextBuckets[outcome] || 0) + 1;

  return {
    version: 1,
    played: stats.played + 1,
    buckets: nextBuckets,
  };
}

export function resetStats(storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null): GameStats {
  const empty = createEmptyStats();
  saveStats(empty, storage);
  return empty;
}

export function calculateWinPercentage(stats: GameStats): number {
  if (stats.played === 0) return 0;
  const solved = stats.played - (stats.buckets.missed || 0);
  return Math.round((solved / stats.played) * 100);
}
