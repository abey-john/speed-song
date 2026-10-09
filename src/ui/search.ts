import { Song } from '../data/types';
import { createLabel } from '../../scripts/data/normalize';

export interface SearchMatch {
  song: Song;
  label: string;
  matchedIndices?: [number, number]; // [start, end]
}

/**
 * Normalizes text for search by stripping diacritics and lowercasing.
 */
export function normalizeSearchString(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Filters playlist songs matching the query, excluding already guessed songs.
 * Returns at most maxResults (default 8).
 */
export function filterSongs(
  query: string,
  allSongs: Song[],
  excludedSongIds: Set<string> = new Set(),
  maxResults = 8
): SearchMatch[] {
  const normQuery = normalizeSearchString(query);
  if (!normQuery) return [];

  const results: SearchMatch[] = [];

  for (const song of allSongs) {
    if (excludedSongIds.has(song.id)) continue;

    const label = createLabel(song.title, song.artist);
    const normLabel = normalizeSearchString(label);

    const matchIdx = normLabel.indexOf(normQuery);
    if (matchIdx !== -1) {
      results.push({
        song,
        label,
        matchedIndices: [matchIdx, matchIdx + normQuery.length],
      });

      if (results.length >= maxResults) break;
    }
  }

  return results;
}

/**
 * Highlights matching portion of text safely using HTML spans.
 */
export function highlightMatch(text: string, indices?: [number, number]): string {
  if (!indices) return escapeHtml(text);
  const [start, end] = indices;
  const before = escapeHtml(text.slice(0, start));
  const match = escapeHtml(text.slice(start, end));
  const after = escapeHtml(text.slice(end));
  return `${before}<mark class="search-highlight">${match}</mark>${after}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
