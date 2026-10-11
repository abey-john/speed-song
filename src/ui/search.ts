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
  normTitle: string;
  normArtist: string;
  normLabel: string;
  song: Song;
}

interface CachedSearchData {
  items: SearchableSong[];
  fuse: Fuse<SearchableSong>;
}

let cachedSongsRef: Song[] | null = null;
let cachedData: CachedSearchData | null = null;

const FUSE_OPTIONS: IFuseOptions<SearchableSong> = {
  keys: ['label'],
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
  includeScore: true,
  shouldSort: true,
};

export function getSearchData(allSongs: Song[]): CachedSearchData {
  if (cachedData && cachedSongsRef === allSongs) {
    return cachedData;
  }

  const items: SearchableSong[] = allSongs.map((song) => {
    const label = createLabel(song.title, song.artist);
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      label,
      normTitle: normalizeSearchString(song.title),
      normArtist: normalizeSearchString(song.artist),
      normLabel: normalizeSearchString(label),
      song,
    };
  });

  const fuseIndex = Fuse.createIndex(['label'], items);
  const fuse = new Fuse(items, FUSE_OPTIONS, fuseIndex);

  cachedSongsRef = allSongs;
  cachedData = { items, fuse };
  return cachedData;
}

export function getOrCreateFuse(allSongs: Song[]): Fuse<SearchableSong> {
  return getSearchData(allSongs).fuse;
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
 * Finds all occurrences of each token in normText.
 */
function findTokenRanges(normText: string, tokens: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const t of tokens) {
    if (!t) continue;
    let pos = 0;
    while ((pos = normText.indexOf(t, pos)) !== -1) {
      ranges.push([pos, pos + t.length]);
      pos += t.length;
    }
  }
  return ranges;
}

/**
 * Finds all occurrences of the full query in normText.
 */
function findQueryRanges(normText: string, query: string): [number, number][] {
  const ranges: [number, number][] = [];
  let pos = 0;
  while ((pos = normText.indexOf(query, pos)) !== -1) {
    ranges.push([pos, pos + query.length]);
    pos += query.length;
  }
  return ranges;
}

/**
 * Filters and ranks playlist songs matching the query using high-performance
 * hybrid search: sub-millisecond exact/token fast-path, falling back to
 * Fuse.js fuzzy index for typo tolerance.
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

  const { items, fuse } = getSearchData(allSongs);
  const normQuery = normalizeSearchString(trimmed);
  const tokens = normQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  // --- Fast-Path: Sub-millisecond substring & token matching ---
  const b1: SearchableSong[] = []; // Title starts with query
  const b2: SearchableSong[] = []; // Artist starts with query
  const b3: SearchableSong[] = []; // Full query substring in label
  const b4: SearchableSong[] = []; // All tokens present in label (multi-word)

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (excludedSongIds.has(it.id)) continue;

    if (it.normTitle.startsWith(normQuery)) {
      b1.push(it);
    } else if (it.normArtist.startsWith(normQuery)) {
      b2.push(it);
    } else if (it.normLabel.includes(normQuery)) {
      b3.push(it);
    } else if (tokens.length > 1) {
      let allMatch = true;
      for (let t = 0; t < tokens.length; t++) {
        if (!it.normLabel.includes(tokens[t]!)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        b4.push(it);
      }
    }

    // Stop early if top prefix matches already satisfy maxResults
    if (b1.length + b2.length >= maxResults * 2) {
      break;
    }
  }

  const fastMatches = [...b1, ...b2, ...b3, ...b4].slice(0, maxResults);

  if (fastMatches.length > 0) {
    return fastMatches.map((it) => {
      let ranges: [number, number][];
      if (it.normLabel.includes(normQuery)) {
        ranges = findQueryRanges(it.normLabel, normQuery);
      } else {
        ranges = findTokenRanges(it.normLabel, tokens);
      }
      return {
        song: it.song,
        label: it.label,
        matchedIndices: ranges.length === 1 ? ranges[0] : ranges,
      };
    });
  }

  // --- Fallback: Fuse.js fuzzy Bitap search for typos ---
  let searchResults = fuse.search(trimmed, { limit: maxResults });

  if (searchResults.length === 0 && tokens.length > 1) {
    const andExpressions: Expression[] = tokens.map((t) => ({
      label: t,
    }));
    searchResults = fuse.search({ $and: andExpressions }, { limit: maxResults });
  }

  const results: SearchMatch[] = [];

  for (const res of searchResults) {
    if (excludedSongIds.has(res.item.id)) continue;

    const labelRanges: [number, number][] = [];
    if (res.matches) {
      for (const m of res.matches) {
        if (!m.indices) continue;
        for (const [start, end] of m.indices) {
          labelRanges.push([start, end + 1]);
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
