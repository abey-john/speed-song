import Fuse from 'fuse.js';
import { doubleMetaphone } from 'double-metaphone';
export { doubleMetaphone };
import { Song } from '../data/types';
import { normalizeSearchString } from '../ui/search';
import { isSamePrimaryArtist, getBaseTitle } from '../../scripts/data/normalize';

export interface VoiceMatchResult {
  isCorrect: boolean;
  matchedTitle: boolean;
  matchedArtist: boolean;
  confidence: number;
  transcript: string;
}

export const VOICE_STOP_WORDS = new Set([
  // English articles and prepositions
  'the',
  'a',
  'an',
  'of',
  // French articles & connectors
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  // Spanish / Italian / Portuguese articles
  'el',
  'los',
  'las',
  'il',
  'lo',
  'gli',
  // German articles
  'der',
  'die',
  'das',
  'dem',
  'den',
  'ein',
  'eine',
]);

const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

/**
 * Parses valid Roman numerals into their integer values algorithmically (1 to 3999).
 */
export function parseRomanNumeral(token: string): number | null {
  const s = token.toLowerCase();
  if (!s || !/^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(s)) {
    return null;
  }
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_VALUES[s[i]!] || 0;
    const next = ROMAN_VALUES[s[i + 1]!] || 0;
    if (next > cur) {
      total += next - cur;
      i++;
    } else {
      total += cur;
    }
  }
  return total > 0 ? total : null;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

/**
 * Normalizes number words, digits, and Roman numerals to standard decimal digits.
 */
export function normalizeNumbers(text: string): string {
  const tokens = text.split(/\s+/);
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const prev = i > 0 ? tokens[i - 1]! : '';

    // Standard number words: "five" -> "5"
    if (tok.toLowerCase() in NUMBER_WORDS) {
      result.push(String(NUMBER_WORDS[tok.toLowerCase()]));
      continue;
    }

    // Roman numerals: "ii" -> "2", "iv" -> "4"
    // For single "i", only convert if preceded by part/act/volume/etc to avoid colliding with pronoun "I"
    const isSingleI = tok.toLowerCase() === 'i';
    const isContextualI = isSingleI && /^(part|pt|volume|vol|act|chapter|no|number)$/i.test(prev);

    if (!isSingleI || isContextualI) {
      const romanVal = parseRomanNumeral(tok);
      if (romanVal !== null && romanVal <= 100) {
        result.push(String(romanVal));
        continue;
      }
    }

    result.push(tok);
  }

  return result.join(' ');
}

/**
 * Universal linguistic contraction expansions and number canonicalization.
 */
export function canonicalizeContractions(text: string): string {
  let s = text.toLowerCase();

  // Universal English abbreviations
  s = s.replace(/\bmr\b/g, 'mister');
  s = s.replace(/\bmrs\b/g, 'missus');
  s = s.replace(/\bms\b/g, 'miss');
  s = s.replace(/\bdr\b/g, 'doctor');
  s = s.replace(/\bst\b/g, 'saint');
  s = s.replace(/\bpt\b/g, 'part');
  s = s.replace(/\bvol\b/g, 'volume');
  s = s.replace(/\blil\b/g, 'little');
  s = s.replace(/\b(no|num|nr)\b/g, 'number');

  // Normalize numbers, digit words, and Roman numerals algorithmically
  s = normalizeNumbers(s);

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Checks whether haystack contains needle as a whole word/phrase to prevent short word false positives
 * (e.g. "someone" incorrectly matching the song title "One").
 */
export function hasWholePhraseMatch(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  if (needle.length >= 6) {
    return haystack.includes(needle);
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
}

/**
 * Checks whether two individual tokens match with phonetic (Double Metaphone) and fuzzy (Fuse.js) tolerance.
 */
export function isTokenFuzzyMatch(tokenA: string, tokenB: string): boolean {
  if (tokenA === tokenB) return true;
  if (!tokenA || !tokenB) return false;

  const minLen = Math.min(tokenA.length, tokenB.length);
  const maxLen = Math.max(tokenA.length, tokenB.length);

  // Short words (<= 3 chars, e.g. "in", "to", "at", "bad") must match exactly
  if (minLen <= 3) {
    return false;
  }

  // Length difference cannot exceed 2
  if (maxLen - minLen > 2) {
    return false;
  }

  // Official Double Metaphone library handles phonetic homophones
  const [primA, altA] = doubleMetaphone(tokenA);
  const [primB, altB] = doubleMetaphone(tokenB);

  const phoneticMatch = Boolean(
    (primA && primB && primA === primB) ||
    (primA && altB && primA === altB) ||
    (altA && primB && altA === primB) ||
    (altA && altB && altA === altB)
  );

  if (phoneticMatch) {
    return true;
  }

  // For short words of length <= 4, avoid loose edit matches without identical start and phonetics
  if (minLen <= 4) {
    return false;
  }

  // Fuzzy edit distance check using existing Fuse.js library
  if (tokenA[0] !== tokenB[0]) {
    return false;
  }

  const fuse = new Fuse([tokenB], { threshold: 0.35, ignoreLocation: true, includeScore: true });
  const results = fuse.search(tokenA);
  return results.length > 0;
}

/**
 * Cleans text without stripping conversational filler (preserves legitimate title words like "it's").
 */
export function cleanText(text: string): string {
  let cleaned = normalizeSearchString(text);
  cleaned = cleaned.replace(/['"’]/g, ''); // remove apostrophes without space (it's -> its)
  cleaned = cleaned.replace(/[-–—,.:;!?()[\]{}]/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Strips conversational filler words and common connector phrases from spoken transcripts.
 */
export function cleanSpokenTranscript(transcript: string): string {
  let cleaned = normalizeSearchString(transcript);

  // Strip conversational filler prefixes (before stripping apostrophes)
  cleaned = cleaned.replace(
    /^(it is|it's|its|i think it's|i think its|i think|this is|that is|that's|the song is|song is|song's|i know it|i believe it's|i believe)\s+/i,
    ''
  );

  // Remove common punctuation and symbols
  cleaned = cleaned.replace(/['"’]/g, ''); // remove apostrophes without space (it's -> its)
  cleaned = cleaned.replace(/[-–—,.:;!?()[\]{}]/g, ' ');

  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Checks whether the spoken text contains the song's title or base title.
 */
export function matchesTitle(spokenClean: string, targetTitle: string): boolean {
  if (!spokenClean || !targetTitle) return false;

  const rawFull = cleanText(targetTitle);
  const rawBase = cleanText(getBaseTitle(targetTitle));
  const strippedFull = cleanSpokenTranscript(targetTitle);
  const strippedBase = cleanSpokenTranscript(getBaseTitle(targetTitle));

  const candidates = Array.from(new Set([rawFull, rawBase, strippedFull, strippedBase].filter(Boolean)));
  for (const candidate of candidates) {
    if (checkSingleTitleMatch(spokenClean, candidate)) {
      return true;
    }
  }

  return false;
}

/**
 * Matches space-collapsed phrases using Fuse.js (threshold <= 0.38).
 * Handles compound words (e.g. "machine head" <-> "machinehead") and
 * phonetic/slang splits (e.g. "want to be" <-> "wannabe", "give me shelter" <-> "gimme shelter")
 * without hardcoding any word dictionaries.
 */
export function isSpaceCollapsedFuzzyMatch(spokenNoSpace: string, normNoSpace: string): boolean {
  if (normNoSpace.length < 6 || spokenNoSpace.length < 6) return false;
  if (normNoSpace[0] !== spokenNoSpace[0]) return false;
  if (Math.abs(normNoSpace.length - spokenNoSpace.length) > 3) return false;

  // Last character must match to avoid false positive suffix substitutions (e.g. "let it be" vs "let it go")
  if (normNoSpace.slice(-1) !== spokenNoSpace.slice(-1)) {
    return false;
  }

  const fuse = new Fuse([normNoSpace], {
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
  });
  const res = fuse.search(spokenNoSpace);
  return res.length > 0;
}

/**
 * Checks sliding windows of spoken tokens against a target space-collapsed string.
 * This ensures that phrases like "i love want to be" match "wannabe" even when extra words were spoken.
 */
export function checkSpaceCollapsedWindows(spokenTokens: string[], normNoSpace: string): boolean {
  if (normNoSpace.length < 6) return false;
  for (let start = 0; start < spokenTokens.length; start++) {
    let windowStr = '';
    for (let end = start; end < spokenTokens.length; end++) {
      windowStr += spokenTokens[end];
      if (windowStr.length > normNoSpace.length + 3) break;
      if (isSpaceCollapsedFuzzyMatch(windowStr, normNoSpace)) {
        return true;
      }
    }
  }
  return false;
}

export function checkSingleTitleMatch(spokenClean: string, normTitle: string): boolean {
  if (!normTitle || !spokenClean) return false;

  // 1. Direct phrase match with whole-word boundary safety
  if (hasWholePhraseMatch(spokenClean, normTitle)) {
    return true;
  }

  // 2. Canonicalized contractions phrase match
  const spokenCanon = canonicalizeContractions(spokenClean);
  const normCanon = canonicalizeContractions(normTitle);

  if (hasWholePhraseMatch(spokenCanon, normCanon)) {
    return true;
  }

  // 3. Space-collapsed match (handles compound words like "machinehead" <-> "machine head"
  // and speech-to-text word splitting like "wannabe" <-> "want to be", "gimme" <-> "give me")
  const spokenNoSpace = spokenCanon.replace(/\s+/g, '');
  const normNoSpace = normCanon.replace(/\s+/g, '');
  if (normNoSpace.length >= 4 && spokenNoSpace.includes(normNoSpace)) {
    return true;
  }
  if (isSpaceCollapsedFuzzyMatch(spokenNoSpace, normNoSpace)) {
    return true;
  }

  const spokenTokens = spokenCanon.split(/\s+/).filter((t) => t.length > 0);
  if (checkSpaceCollapsedWindows(spokenTokens, normNoSpace)) {
    return true;
  }

  // 4. Token-level fuzzy & phonetic check
  const titleTokens = normCanon
    .split(/\s+/)
    .filter((t) => t.length > 1 && !VOICE_STOP_WORDS.has(t));

  if (titleTokens.length === 0) {
    return spokenNoSpace.includes(normNoSpace);
  }

  const validSpokenTokens = spokenTokens.filter((t) => t.length > 1);
  if (validSpokenTokens.length === 0) {
    return false;
  }

  // If the user spoke fewer tokens than a multi-token title requires, reject premature match
  if (validSpokenTokens.length < Math.min(titleTokens.length, 3)) {
    return false;
  }

  let matches = 0;
  for (const tToken of titleTokens) {
    const hasMatch = validSpokenTokens.some((sToken) => isTokenFuzzyMatch(sToken, tToken));
    if (hasMatch) {
      matches++;
    }
  }

  // For titles up to 3 non-stop tokens, all non-stop tokens must be spoken (1.0).
  // For long titles (4+ tokens), at least 85% of tokens must match (permits at most 1 minor dropped token).
  const requiredRatio = titleTokens.length <= 3 ? 1.0 : 0.85;
  return matches / titleTokens.length >= requiredRatio;
}

/**
 * Checks whether the spoken text contains the song's primary artist or featured artists.
 */
export function matchesArtist(spokenClean: string, targetArtist: string): boolean {
  if (!targetArtist || !spokenClean) return false;

  const fullClean = cleanSpokenTranscript(targetArtist);
  if (spokenClean.includes(fullClean)) {
    return true;
  }

  const spokenCanon = canonicalizeContractions(spokenClean);
  const spokenNoSpace = spokenCanon.replace(/\s+/g, '');

  // Split target artist into distinct contributing artists before stripping punctuation
  const artistParts = targetArtist
    .split(/[,&]|\b(?:feat|ft|featuring|with|and)\b/i)
    .map((p) => cleanSpokenTranscript(p))
    .filter(Boolean);

  for (const part of artistParts) {
    if (part && spokenClean.includes(part)) {
      return true;
    }

    const partCanon = canonicalizeContractions(part);
    if (partCanon && spokenCanon.includes(partCanon)) {
      return true;
    }

    const partNoSpace = partCanon.replace(/\s+/g, '');
    if (partNoSpace.length >= 4 && spokenNoSpace.includes(partNoSpace)) {
      return true;
    }

    // Also check part without leading "the" (e.g. "weeknd" matching "the weeknd")
    const withoutThe = part.replace(/^the\s+/, '').trim();
    if (withoutThe && withoutThe.length > 2 && spokenClean.includes(withoutThe)) {
      return true;
    }

    // Check normalize.ts primary artist helper
    const spokenWords = spokenClean.split(/\s+/).filter((w) => w.length > 2 && w !== 'the');
    for (const word of spokenWords) {
      if (isSamePrimaryArtist(part, word)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Evaluates whether a spoken guess names the song.
 * Artist name is optional and not required to win.
 */
export function evaluateVoiceGuess(transcript: string, song: Song): VoiceMatchResult {
  const cleaned = cleanSpokenTranscript(transcript);
  if (!cleaned) {
    return {
      isCorrect: false,
      matchedTitle: false,
      matchedArtist: false,
      confidence: 0,
      transcript,
    };
  }

  const titleMatch = matchesTitle(cleaned, song.title);
  const artistMatch = matchesArtist(cleaned, song.artist);
  // Only song title is required in voice mode
  const isCorrect = titleMatch;

  let confidence = 0;
  if (titleMatch) confidence += 0.8;
  if (artistMatch) confidence += 0.2;

  return {
    isCorrect,
    matchedTitle: titleMatch,
    matchedArtist: artistMatch,
    confidence,
    transcript,
  };
}
