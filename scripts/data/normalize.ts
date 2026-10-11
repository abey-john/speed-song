/**
 * Normalizes text by lowercasing and stripping all non-alphanumeric characters (keeps a-z, 0-9).
 */
export function normalize(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extracts base title before version descriptors, appendages, and subtitle tags.
 * E.g. "Song Name (feat. Artist)" -> "Song Name"
 *      "Song Name - Remastered 2011" -> "Song Name"
 *      "19-2000" -> "19-2000" (preserves compound numbers/words)
 *      "(I Can't Get No) Satisfaction - Mono" -> "(I Can't Get No) Satisfaction"
 */
export function getBaseTitle(title: string): string {
  let cleaned = (title || '').trim();

  // 1. Strip trailing dash subtitles with spaces around: " - Remastered", " – Live", " — 2019"
  cleaned = cleaned.replace(/\s+[-–—:]\s+.*$/i, '');

  // 2. Strip trailing parenthetical / bracketed info like (feat. ...), [Remastered], (Live ...), (Version), (Radio Edit)
  // But DO NOT strip if the title starts with '(' like "(I Can't Get No) Satisfaction"
  if (cleaned.startsWith('(')) {
    // If it starts with '(', only strip trailing brackets/parentheses that come AFTER the initial group:
    // e.g. "(I Can't Get No) Satisfaction (Mono)" -> "(I Can't Get No) Satisfaction"
    cleaned = cleaned.replace(/\s+[\(\[][^\(\)]*[\)\]]$/i, '');
  } else {
    // Standard title: strip trailing (feat. ...), [Remastered ...], etc.
    cleaned = cleaned.replace(/\s*[\(\[][^\(\)]*[\)\]].*$/i, '');
  }

  // 3. If there is still a trailing ": Subtitle", strip it
  cleaned = cleaned.replace(/:\s+.*$/, '');

  const result = cleaned.trim();
  return result || title.trim();
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

const KNOWN_COMMA_ARTISTS = [
  'Tyler, The Creator',
  'Earth, Wind & Fire',
  'Crosby, Stills, Nash & Young',
  'Crosby, Stills & Nash',
  'Emerson, Lake & Palmer',
  'Bell, Biv DeVoe',
  'Blood, Sweat & Tears',
];

/**
 * Extracts the primary artist name (e.g. "Daft Punk, Pharrell Williams" -> "Daft Punk").
 */
export function getPrimaryArtist(artist: string): string {
  const trimmed = (artist || '').trim();
  for (const known of KNOWN_COMMA_ARTISTS) {
    if (trimmed.toLowerCase().startsWith(known.toLowerCase())) {
      return known;
    }
  }
  return trimmed.split(/,\s*/)[0]?.trim() || trimmed;
}

/**
 * Checks whether two artist strings share the exact same primary artist.
 */
export function isSamePrimaryArtist(artistA: string, artistB: string): boolean {
  const primA = normalize(getPrimaryArtist(artistA));
  const primB = normalize(getPrimaryArtist(artistB));
  return Boolean(primA && primB && primA === primB);
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

/**
 * Checks if candidate song title matches target song title.
 * Strictly prevents mismatched song audio from being assigned to another song.
 */
export function titlesMatch(targetTitle: string, candidateTitle: string): boolean {
  const normTarget = normalize(targetTitle);
  const normCandidate = normalize(candidateTitle);

  if (!normTarget || !normCandidate) return false;

  // 1. Exact normalized match: "192000" === "192000"
  if (normTarget === normCandidate) return true;

  // 2. Base title match: "kids" === "kids"
  const baseTarget = normalize(getBaseTitle(targetTitle));
  const baseCandidate = normalize(getBaseTitle(candidateTitle));
  if (baseTarget && baseCandidate && baseTarget === baseCandidate) return true;

  // 3. Base matches other's full or vice versa
  if (baseTarget && baseTarget === normCandidate) return true;
  if (baseCandidate && baseCandidate === normTarget) return true;

  // 4. Base title substring match if base title is substantial (>= 4 characters)
  if (
    baseTarget.length >= 4 &&
    baseCandidate.length >= 4 &&
    (baseTarget.includes(baseCandidate) || baseCandidate.includes(baseTarget))
  ) {
    return true;
  }

  // 5. Full normalized title substring match if shorter string is substantial (>= 4 chars)
  const shorter = normTarget.length < normCandidate.length ? normTarget : normCandidate;
  const longer = normTarget.length < normCandidate.length ? normCandidate : normTarget;

  if (shorter.length >= 4 && longer.includes(shorter)) {
    return true;
  }

  return false;
}
