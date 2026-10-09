import { describe, it, expect } from 'vitest';
import { isCacheValid } from './cache';

describe('isCacheValid', () => {
  const now = new Date('2026-10-08T12:00:00Z').getTime();

  it('returns false for undefined entry', () => {
    expect(isCacheValid(undefined, now)).toBe(false);
  });

  it('returns true for fresh successful entry (< 30 days)', () => {
    const entry = {
      previewUrl: 'https://audio.example.com/song.m4a',
      resolvedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    };
    expect(isCacheValid(entry, now)).toBe(true);
  });

  it('returns false for expired successful entry (> 30 days)', () => {
    const entry = {
      previewUrl: 'https://audio.example.com/song.m4a',
      resolvedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(), // 31 days ago
    };
    expect(isCacheValid(entry, now)).toBe(false);
  });

  it('returns true for recently failed entry (< 7 days)', () => {
    const entry = {
      failed: true,
      resolvedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    };
    expect(isCacheValid(entry, now)).toBe(true);
  });

  it('returns false for old failed entry (> 7 days) to allow re-resolution', () => {
    const entry = {
      failed: true,
      resolvedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
    };
    expect(isCacheValid(entry, now)).toBe(false);
  });
});
