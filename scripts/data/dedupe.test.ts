import { describe, it, expect } from 'vitest';
import { deduplicateSongs } from './dedupe';

describe('deduplicateSongs', () => {
  it('removes duplicate songs with matching title and artist', () => {
    const list = [
      { id: '1', title: 'Starboy', artist: 'The Weeknd' },
      { id: '2', title: 'Starboy', artist: 'The Weeknd' },
      { id: '3', title: 'Blinding Lights', artist: 'The Weeknd' },
    ];

    const deduped = deduplicateSongs(list);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((s) => s.id === '1')).toBeDefined();
    expect(deduped.find((s) => s.id === '2')).toBeUndefined();
  });

  it('normalizes differences in punctuation or casing when identifying duplicates', () => {
    const list = [
      { id: '1', title: 'Viva La Vida', artist: 'Coldplay' },
      { id: '2', title: 'Viva la Vida!', artist: 'Coldplay' },
    ];

    const deduped = deduplicateSongs(list);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe('1');
  });

  it('sorts alphabetically by title then artist', () => {
    const list = [
      { id: '3', title: 'Yellow', artist: 'Coldplay' },
      { id: '1', title: 'All of Me', artist: 'John Legend' },
      { id: '2', title: 'Fix You', artist: 'Coldplay' },
    ];

    const sorted = deduplicateSongs(list);
    expect(sorted.map((s) => s.title)).toEqual(['All of Me', 'Fix You', 'Yellow']);
  });
});
