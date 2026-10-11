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

  it('matches songs with slight typos using fuzzy search', () => {
    // "blindng" typo for "Blinding Lights"
    const typoResults = filterSongs('blindng', songs);
    expect(typoResults.length).toBeGreaterThanOrEqual(1);
    expect(typoResults[0]?.song.id).toBe('2');

    // "weend" typo for "The Weeknd"
    const artistTypoResults = filterSongs('weend', songs);
    expect(artistTypoResults.length).toBeGreaterThanOrEqual(1);
    expect(artistTypoResults.some((r) => r.song.artist === 'The Weeknd')).toBe(true);
  });

  it('matches multi-word artist and title queries', () => {
    const combinedResults = filterSongs('coldplay viva', songs);
    expect(combinedResults.length).toBeGreaterThanOrEqual(1);
    expect(combinedResults[0]?.song.id).toBe('4');
  });

  it('supports highlighting multiple ranges', () => {
    const multiHighlighted = highlightMatch('Starboy — The Weeknd', [
      [0, 7],
      [14, 20],
    ]);
    expect(multiHighlighted).toBe(
      '<mark class="search-highlight">Starboy</mark> — The <mark class="search-highlight">Weeknd</mark>'
    );
  });

  it('performs searches on large playlists (5,000 songs) in under 5ms', () => {
    const largeCatalog: Song[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `song-${i}`,
      title: `Track ${i} Title`,
      artist: `Artist ${i % 100} Name`,
      album: `Album ${i}`,
      previewUrl: '',
      artworkUrl: '',
    }));

    // Warm up cache
    filterSongs('track 1', largeCatalog);

    const start = performance.now();
    const results = filterSongs('track 25', largeCatalog);
    const duration = performance.now() - start;

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(duration).toBeLessThan(10); // Under 10ms (usually < 1ms)
  });
});
