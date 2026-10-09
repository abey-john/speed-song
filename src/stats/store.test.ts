import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadStats,
  saveStats,
  recordRoundOutcome,
  resetStats,
  calculateWinPercentage,
  createEmptyStats,
  clearInMemoryFallback,
  STATS_STORAGE_KEY,
} from './store';

describe('src/stats/store', () => {
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
    clearInMemoryFallback();
  });

  it('loads empty stats when storage is empty', () => {
    const stats = loadStats(mockStorage);
    expect(stats.played).toBe(0);
    expect(stats.buckets['0.1']).toBe(0);
    expect(stats.buckets.missed).toBe(0);
  });

  it('records correct guess and calculates percentage', () => {
    let stats = createEmptyStats();
    stats = recordRoundOutcome(stats, '0.5');
    stats = recordRoundOutcome(stats, '3');
    stats = recordRoundOutcome(stats, 'missed');

    expect(stats.played).toBe(3);
    expect(stats.buckets['0.5']).toBe(1);
    expect(stats.buckets['3']).toBe(1);
    expect(stats.buckets.missed).toBe(1);
    expect(calculateWinPercentage(stats)).toBe(67);
  });

  it('persists and reloads stats from storage', () => {
    let stats = createEmptyStats();
    stats = recordRoundOutcome(stats, '0.1');
    saveStats(stats, mockStorage);

    const loaded = loadStats(mockStorage);
    expect(loaded.played).toBe(1);
    expect(loaded.buckets['0.1']).toBe(1);
  });

  it('handles corrupted JSON in storage gracefully', () => {
    mockStorage.setItem(STATS_STORAGE_KEY, '{ invalid json');
    const stats = loadStats(mockStorage);
    expect(stats.played).toBe(0);
  });

  it('handles unknown version or schema in storage gracefully', () => {
    mockStorage.setItem(STATS_STORAGE_KEY, JSON.stringify({ version: 99, foo: 'bar' }));
    const stats = loadStats(mockStorage);
    expect(stats.played).toBe(0);
  });

  it('resets stats cleanly', () => {
    let stats = createEmptyStats();
    stats = recordRoundOutcome(stats, '10');
    saveStats(stats, mockStorage);

    const reset = resetStats(mockStorage);
    expect(reset.played).toBe(0);
    expect(reset.buckets['10']).toBe(0);
    expect(loadStats(mockStorage).played).toBe(0);
  });
});
