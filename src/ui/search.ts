import Fuse, { type IFuseOptions, type Expression } from 'fuse.js';
import { Song } from '../data/types';
import { createLabel } from '../../scripts/data/normalize';

export interface SearchMatch {
  song: Song;
  label: string;
  matchedIndices?: [number, number] | [number, number][];
  score?: number;
}

export interface SearchableSong {
  id: string;
  title: string;
  artist: string;
  label: string;
  song: Song;
}

let cachedSongsRef: Song[] | null = null;
let cachedFuse: Fuse<SearchableSong> | null = null;

const FUSE_OPTIONS: IFuseOptions<SearchableSong> = {
  keys: [
    { name: 'title', weight: 0.6 },
    { name: 'artist', weight: 0.35 },
    { name: 'label', weight: 0.2 },
  ],
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
  includeScore: true,
  shouldSort: true,
};

export function getOrCreateFuse(allSongs: Song[]): Fuse<SearchableSong> {
  if (cachedFuse && cachedSongsRef === allSongs) {
    return cachedFuse;
  }

  const items: SearchableSong[] = allSongs.map((song) => ({
    id: song.id,
    title: song.title,
    artist: song.artist,
    label: createLabel(song.title, song.artist),
    song,
  }));

  cachedSongsRef = allSongs;
  cachedFuse = new Fuse(items, FUSE_OPTIONS);
  return cachedFuse;
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
 * Filters and ranks playlist songs matching the query using Fuse.js.
 * Returns at most maxResults (default 8).
 */
export function filterSongs(
  query: string,
  allSongs: Song[],
  excludedSongIds: Set<string> = new Set(),
  maxResults = 8
): SearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const fuse = getOrCreateFuse(allSongs);
  let searchResults = fuse.search(trimmed);

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (searchResults.length === 0 && tokens.length > 1) {
    const andExpressions: Expression[] = tokens.map((t) => ({
      $or: [
        { title: t } as Expression,
        { artist: t } as Expression,
        { label: t } as Expression,
      ],
    }));
    searchResults = fuse.search({
      $and: andExpressions,
    });
  }

  const results: SearchMatch[] = [];

  for (const res of searchResults) {
    if (excludedSongIds.has(res.item.id)) continue;

    const labelRanges: [number, number][] = [];
    const titleLen = res.item.title.length;
    const artistOffset = titleLen + 3; // " — " separator is 3 characters

    if (res.matches) {
      for (const m of res.matches) {
        if (!m.indices) continue;
        for (const [start, end] of m.indices) {
          if (m.key === 'title') {
            labelRanges.push([start, end + 1]);
          } else if (m.key === 'artist') {
            labelRanges.push([start + artistOffset, end + 1 + artistOffset]);
          } else if (m.key === 'label') {
            labelRanges.push([start, end + 1]);
          }
        }
      }
    }

    results.push({
      song: res.item.song,
      label: res.item.label,
      matchedIndices: labelRanges.length === 1 ? labelRanges[0] : labelRanges,
      score: res.score,
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

/**
 * Highlights matching portions of text safely using HTML <mark> tags.
 * Supports single ranges [start, end] and multi-ranges [[start, end], ...].
 */
export function highlightMatch(
  text: string,
  indices?: [number, number] | [number, number][]
): string {
  if (!indices) return escapeHtml(text);

  const ranges: [number, number][] = Array.isArray(indices[0])
    ? (indices as [number, number][]).slice()
    : [indices as [number, number]];

  if (ranges.length === 0) return escapeHtml(text);

  ranges.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const r of ranges) {
    if (r[0] >= r[1] || r[0] < 0 || r[1] > text.length) continue;
    if (merged.length === 0) {
      merged.push([r[0], r[1]]);
    } else {
      const prev = merged[merged.length - 1]!;
      if (r[0] <= prev[1]) {
        prev[1] = Math.max(prev[1], r[1]);
      } else {
        merged.push([r[0], r[1]]);
      }
    }
  }

  if (merged.length === 0) return escapeHtml(text);

  let result = '';
  let lastIdx = 0;

  for (const [start, end] of merged) {
    result += escapeHtml(text.slice(lastIdx, start));
    result += `<mark class="search-highlight">${escapeHtml(text.slice(start, end))}</mark>`;
    lastIdx = end;
  }
  result += escapeHtml(text.slice(lastIdx));

  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
