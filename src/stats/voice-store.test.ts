import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyVoiceStats,
  loadVoiceStats,
  saveVoiceStats,
  recordVoiceRoundOutcome,
  resetVoiceStats,
  calculateVoiceWinPercentage,
  calculateVoiceAverageWinTime,
  getTimeBracketKey,
  clearInMemoryVoiceFallback,
} from './voice-store';

describe('src/stats/voice-store', () => {
  let mockStorageData: Record<string, string> = {};

  const mockStorage: Storage = {
    getItem: (key: string) => mockStorageData[key] ?? null,
    setItem: (key: string, val: string) => {
      mockStorageData[key] = val;
    },
    removeItem: (key: string) => {
      delete mockStorageData[key];
    },
    clear: () => {
      mockStorageData = {};
    },
    key: () => null,
    length: 0,
  };

  beforeEach(() => {
    mockStorageData = {};
    clearInMemoryVoiceFallback();
  });

  it('maps buzzer seconds to correct brackets', () => {
    expect(getTimeBracketKey(0.42)).toBe('< 1.0s');
    expect(getTimeBracketKey(1.5)).toBe('1.0s – 3.0s');
    expect(getTimeBracketKey(4.1)).toBe('3.0s – 5.0s');
    expect(getTimeBracketKey(8.2)).toBe('5.0s – 10.0s');
    expect(getTimeBracketKey(15.0)).toBe('10.0s – 20.0s');
    expect(getTimeBracketKey(25.5)).toBe('20.0s – 30.0s');
  });

  it('records wins, fastest times, and calculates averages', () => {
    let stats = createEmptyVoiceStats();
    stats = recordVoiceRoundOutcome(stats, { won: true, timeSec: 2.0 });
    stats = recordVoiceRoundOutcome(stats, { won: true, timeSec: 0.5 });
    stats = recordVoiceRoundOutcome(stats, { won: false });

    expect(stats.played).toBe(3);
    expect(stats.won).toBe(2);
    expect(stats.fastestTimeSec).toBe(0.5);
    expect(stats.brackets['< 1.0s']).toBe(1);
    expect(stats.brackets['1.0s – 3.0s']).toBe(1);
    expect(stats.brackets.missed).toBe(1);
    expect(calculateVoiceWinPercentage(stats)).toBe(67);
    expect(calculateVoiceAverageWinTime(stats)).toBe(1.25);
  });

  it('persists and reloads stats from storage cleanly', () => {
    let stats = createEmptyVoiceStats();
    stats = recordVoiceRoundOutcome(stats, { won: true, timeSec: 0.8 });
    saveVoiceStats(stats, mockStorage);

    const loaded = loadVoiceStats(mockStorage);
    expect(loaded.played).toBe(1);
    expect(loaded.fastestTimeSec).toBe(0.8);
  });

  it('handles reset cleanly', () => {
    let stats = createEmptyVoiceStats();
    stats = recordVoiceRoundOutcome(stats, { won: true, timeSec: 1.2 });
    saveVoiceStats(stats, mockStorage);

    const reset = resetVoiceStats(mockStorage);
    expect(reset.played).toBe(0);
    expect(reset.won).toBe(0);
    expect(reset.fastestTimeSec).toBe(null);
  });
});
