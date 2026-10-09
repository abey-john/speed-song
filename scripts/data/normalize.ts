/**
 * Normalizes text by lowercasing and stripping all non-alphanumeric characters (keeps a-z, 0-9).
 */
export function normalize(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extracts base title before opening parentheses, brackets, hyphens, dashes, colons.
 * E.g. "Song Name (feat. Artist)" -> "Song Name"
 */
export function getBaseTitle(title: string): string {
  const parts = title.split(/[\(\[\-–—:]/);
  return (parts[0] || '').trim();
}

/**
 * Creates user-facing label: `${title} — ${artist}`
 */
export function createLabel(title: string, artist: string): string {
  return `${title.trim()} — ${artist.trim()}`;
}

/**
 * Creates deduplication key from title and artist
 */
export function createNormalizedLabelKey(title: string, artist: string): string {
  return `${normalize(title)}__${normalize(artist)}`;
}

/**
 * Checks if candidate artist matches target artist (substring match in either direction).
 */
export function artistsMatch(targetArtist: string, candidateArtist: string): boolean {
  const normTarget = normalize(targetArtist);
  const normCandidate = normalize(candidateArtist);

  if (!normTarget || !normCandidate) return false;
  return normCandidate.includes(normTarget) || normTarget.includes(normCandidate);
}
