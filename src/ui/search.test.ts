import { describe, it, expect } from 'vitest';
import { filterSongs, highlightMatch, normalizeSearchString } from './search';
import { Song } from '../data/types';

const songs: Song[] = [
  { id: '1', title: 'Starboy', artist: 'The Weeknd', album: '', previewUrl: '', artworkUrl: '' },
  { id: '2', title: 'Blinding Lights', artist: 'The Weeknd', album: '', previewUrl: '', artworkUrl: '' },
  { id: '3', title: 'Save Your Tears', artist: 'The Weeknd', album: '', previewUrl: '', artworkUrl: '' },
  { id: '4', title: 'Viva La Vida', artist: 'Coldplay', album: '', previewUrl: '', artworkUrl: '' },
  { id: '5', title: 'Café Con Leche', artist: 'Pitbull', album: '', previewUrl: '', artworkUrl: '' },
];

describe('src/ui/search', () => {
  it('normalizes diacritics and case', () => {
    expect(normalizeSearchString('Café')).toBe('cafe');
    expect(normalizeSearchString('Beyoncé')).toBe('beyonce');
  });

  it('filters by title or artist substring match', () => {
    const results = filterSongs('weeknd', songs);
    expect(results).toHaveLength(3);

    const titleResults = filterSongs('viva', songs);
    expect(titleResults).toHaveLength(1);
    expect(titleResults[0]?.song.id).toBe('4');
  });

  it('matches diacritic queries against accented characters', () => {
    const results = filterSongs('cafe', songs);
    expect(results).toHaveLength(1);
    expect(results[0]?.song.id).toBe('5');
  });

  it('excludes already guessed song IDs', () => {
    const excluded = new Set(['1']);
    const results = filterSongs('weeknd', songs, excluded);
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.song.id === '1')).toBe(false);
  });

  it('caps matches to maxResults', () => {
    const results = filterSongs('the', songs, new Set(), 2);
    expect(results).toHaveLength(2);
  });

  it('wraps matched portion in highlight mark tag', () => {
    const highlighted = highlightMatch('Starboy — The Weeknd', [0, 7]);
    expect(highlighted).toBe('<mark class="search-highlight">Starboy</mark> — The Weeknd');
  });
});
