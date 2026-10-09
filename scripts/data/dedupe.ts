import { createNormalizedLabelKey } from './normalize';

/**
 * Deduplicates songs in a playlist by normalized label (`title + artist`), keeping the first occurrence.
 * Sorts remaining songs by title then artist for deterministic output.
 */
export function deduplicateSongs<T extends { title: string; artist: string }>(songs: T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];

  for (const song of songs) {
    const key = createNormalizedLabelKey(song.title, song.artist);
    if (!seen.has(key)) {
      seen.add(key);
      kept.push(song);
    }
  }

  // Sort by title, then artist (case-insensitive) for minimal diffs
  return kept.sort((a, b) => {
    const titleComp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (titleComp !== 0) return titleComp;
    return a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
  });
}
