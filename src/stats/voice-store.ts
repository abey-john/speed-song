export const VOICE_STATS_STORAGE_KEY = 'snippet-game:voice-stats:v1';

export type VoiceBracketKey =
  | '< 1.0s'
  | '1.0s – 3.0s'
  | '3.0s – 5.0s'
  | '5.0s – 10.0s'
  | '10.0s – 20.0s'
  | '20.0s – 30.0s'
  | 'missed';

export interface VoiceGameStats {
  version: 1;
  played: number;
  won: number;
  fastestTimeSec: number | null;
  totalWinTimeSec: number;
  brackets: Record<VoiceBracketKey, number>;
}

let inMemoryVoiceStatsFallback: VoiceGameStats | null = null;

export function createEmptyVoiceStats(): VoiceGameStats {
  return {
    version: 1,
    played: 0,
    won: 0,
    fastestTimeSec: null,
    totalWinTimeSec: 0,
    brackets: {
      '< 1.0s': 0,
      '1.0s – 3.0s': 0,
      '3.0s – 5.0s': 0,
      '5.0s – 10.0s': 0,
      '10.0s – 20.0s': 0,
      '20.0s – 30.0s': 0,
      missed: 0,
    },
  };
}

export function isValidVoiceStats(obj: unknown): obj is VoiceGameStats {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Partial<VoiceGameStats>;
  if (
    s.version !== 1 ||
    typeof s.played !== 'number' ||
    typeof s.won !== 'number' ||
    !s.brackets ||
    typeof s.brackets !== 'object'
  ) {
    return false;
  }
  const keys: VoiceBracketKey[] = [
    '< 1.0s',
    '1.0s – 3.0s',
    '3.0s – 5.0s',
    '5.0s – 10.0s',
    '10.0s – 20.0s',
    '20.0s – 30.0s',
    'missed',
  ];
  return keys.every((k) => typeof (s.brackets as Record<string, unknown>)?.[k] === 'number');
}

export function clearInMemoryVoiceFallback(): void {
  inMemoryVoiceStatsFallback = null;
}

export function loadVoiceStats(
  storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null
): VoiceGameStats {
  if (storage) {
    try {
      const raw = storage.getItem(VOICE_STATS_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (isValidVoiceStats(parsed)) {
          return parsed;
        }
        const empty = createEmptyVoiceStats();
        storage.setItem(VOICE_STATS_STORAGE_KEY, JSON.stringify(empty));
        return empty;
      }
    } catch {
      const empty = createEmptyVoiceStats();
      try {
        storage.setItem(VOICE_STATS_STORAGE_KEY, JSON.stringify(empty));
      } catch {}
      return empty;
    }
  }

  if (!inMemoryVoiceStatsFallback) {
    inMemoryVoiceStatsFallback = createEmptyVoiceStats();
  }
  return inMemoryVoiceStatsFallback;
}

export function saveVoiceStats(
  stats: VoiceGameStats,
  storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null
): void {
  inMemoryVoiceStatsFallback = stats;
  if (storage) {
    try {
      storage.setItem(VOICE_STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch {}
  }
}

export function getTimeBracketKey(timeSec: number): VoiceBracketKey {
  if (timeSec < 1.0) return '< 1.0s';
  if (timeSec < 3.0) return '1.0s – 3.0s';
  if (timeSec < 5.0) return '3.0s – 5.0s';
  if (timeSec < 10.0) return '5.0s – 10.0s';
  if (timeSec < 20.0) return '10.0s – 20.0s';
  return '20.0s – 30.0s';
}

export function recordVoiceRoundOutcome(
  stats: VoiceGameStats,
  outcome: { won: true; timeSec: number } | { won: false }
): VoiceGameStats {
  const nextBrackets = { ...stats.brackets };

  if (!outcome.won) {
    nextBrackets.missed = (nextBrackets.missed || 0) + 1;
    return {
      ...stats,
      played: stats.played + 1,
      brackets: nextBrackets,
    };
  }

  const bracketKey = getTimeBracketKey(outcome.timeSec);
  nextBrackets[bracketKey] = (nextBrackets[bracketKey] || 0) + 1;

  const nextWon = stats.won + 1;
  const nextTotalTime = stats.totalWinTimeSec + outcome.timeSec;
  const currentFastest = stats.fastestTimeSec;
  const nextFastest = currentFastest === null ? outcome.timeSec : Math.min(currentFastest, outcome.timeSec);

  return {
    version: 1,
    played: stats.played + 1,
    won: nextWon,
    fastestTimeSec: Number(nextFastest.toFixed(2)),
    totalWinTimeSec: Number(nextTotalTime.toFixed(2)),
    brackets: nextBrackets,
  };
}

export function resetVoiceStats(
  storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null
): VoiceGameStats {
  const empty = createEmptyVoiceStats();
  saveVoiceStats(empty, storage);
  return empty;
}

export function calculateVoiceWinPercentage(stats: VoiceGameStats): number {
  if (stats.played === 0) return 0;
  return Math.round((stats.won / stats.played) * 100);
}

export function calculateVoiceAverageWinTime(stats: VoiceGameStats): number | null {
  if (stats.won === 0) return null;
  return Number((stats.totalWinTimeSec / stats.won).toFixed(2));
}
