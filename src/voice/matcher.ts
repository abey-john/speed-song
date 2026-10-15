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

/**
 * Calculates Levenshtein distance between two strings using single-row dynamic programming.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const bLen = b.length;
  const aLen = a.length;
  const v0: number[] = new Array<number>(bLen + 1);
  const v1: number[] = new Array<number>(bLen + 1);

  for (let i = 0; i <= bLen; i++) v0[i] = i;

  for (let i = 0; i < aLen; i++) {
    v1[0] = i + 1;
    const aChar = a[i]!;
    for (let j = 0; j < bLen; j++) {
      const cost = aChar === b[j] ? 0 : 1;
      const v1j = v1[j]!;
      const v0j1 = v0[j + 1]!;
      const v0j = v0[j]!;
      v1[j + 1] = Math.min(v1j + 1, v0j1 + 1, v0j + cost);
    }
    for (let j = 0; j <= bLen; j++) v0[j] = v1[j]!;
  }
  return v0[bLen] ?? 0;
}

/**
 * Standard Metaphone phonetic algorithm implementation.
 * Encodes words based on English phonetic pronunciation rules.
 */
export function metaphone(word: string): string {
  if (!word) return '';
  let str = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!str) return '';

  // Drop silent initial letters in kn, gn, pn, wr, ae
  if (/^(kn|gn|pn|wr|ae)/.test(str)) {
    str = str.slice(1);
  } else if (str.startsWith('x')) {
    str = 's' + str.slice(1);
  } else if (str.startsWith('wh')) {
    str = 'w' + str.slice(2);
  }

  let code = '';
  const len = str.length;

  for (let i = 0; i < len; i++) {
    const c = str[i]!;
    const next = str[i + 1] || '';
    const prev = str[i - 1] || '';

    // Ignore duplicate letters (except c)
    if (c === prev && c !== 'c') continue;

    // Vowel at start kept, interior vowels dropped
    if (i === 0 && 'aeiou'.includes(c)) {
      code += c;
      continue;
    }

    switch (c) {
      case 'b':
        // Silent b at end after m: "dumb", "comb"
        if (i === len - 1 && prev === 'm') break;
        code += 'b';
        break;
      case 'c':
        if (next === 'h') {
          code += 'x';
          i++;
        } else if (next === 'i' && str[i + 2] === 'a') {
          code += 'x';
          i += 2;
        } else if (next && 'eiy'.includes(next)) {
          code += 's';
        } else {
          code += 'k';
        }
        break;
      case 'd': {
        const afterNext = str[i + 2];
        if (next === 'g' && afterNext && 'eiy'.includes(afterNext)) {
          code += 'j';
          i += 2;
        } else {
          code += 't';
        }
        break;
      }
      case 'f':
        code += 'f';
        break;
      case 'g':
        if (next === 'h' && i === len - 2) break; // silent gh at end
        if (next && 'eiy'.includes(next)) {
          code += 'j';
        } else {
          code += 'k';
        }
        break;
      case 'h':
        // h after vowel and not before vowel is silent
        if (prev && 'aeiou'.includes(prev) && (!next || !'aeiou'.includes(next))) break;
        code += 'h';
        break;
      case 'j':
        code += 'j';
        break;
      case 'k':
        if (prev !== 'c') code += 'k';
        break;
      case 'l':
        code += 'l';
        break;
      case 'm':
        code += 'm';
        break;
      case 'n':
        code += 'n';
        break;
      case 'p':
        if (next === 'h') {
          code += 'f';
          i++;
        } else {
          code += 'p';
        }
        break;
      case 'q':
        code += 'k';
        break;
      case 'r':
        code += 'r';
        break;
      case 's':
        if (next === 'h') {
          code += 'x';
          i++;
        } else if (next === 'i' && (str[i + 2] === 'a' || str[i + 2] === 'o')) {
          code += 'x';
          i += 2;
        } else {
          code += 's';
        }
        break;
      case 't':
        if (next === 'i' && (str[i + 2] === 'a' || str[i + 2] === 'o')) {
          code += 'x';
          i += 2;
        } else if (next === 'h') {
          code += '0';
          i++;
        } else if (next === 'c' && str[i + 2] === 'h') {
          // tch -> ch
          break;
        } else {
          code += 't';
        }
        break;
      case 'v':
        code += 'f';
        break;
      case 'w':
      case 'y':
        if (next && 'aeiou'.includes(next)) {
          code += c;
        }
        break;
      case 'x':
        code += 'ks';
        break;
      case 'z':
        code += 's';
        break;
    }
  }

  return code.toUpperCase();
}

/**
 * Canonicalizes common slang, spoken contractions, and music title abbreviations.
 */
export function canonicalizeContractions(text: string): string {
  let s = text.toLowerCase();

  // Multi-word phrase contractions & STT misrecognitions
  s = s.replace(/\bwannabe\b/g, 'want to be');
  s = s.replace(/\bwanna be\b/g, 'want to be');
  s = s.replace(/\bwanna\b/g, 'want to');

  s = s.replace(/\bgonna\b/g, 'going to');

  s = s.replace(/\bgotta\b/g, 'got to');
  s = s.replace(/\bgot a\b/g, 'got to'); // Speech-to-text turns "I gotta" into "I got a"

  s = s.replace(/\bgimme\b/g, 'give me');
  s = s.replace(/\blemme\b/g, 'let me');

  s = s.replace(/\bwhatcha\b/g, 'what to');
  s = s.replace(/\bwhat you\b/g, 'what to');
  s = s.replace(/\bwhat do you\b/g, 'what to');

  s = s.replace(/\bimma\b/g, 'i am going to');
  s = s.replace(/\boutta\b/g, 'out of');
  s = s.replace(/\bkinda\b/g, 'kind of');
  s = s.replace(/\bsorta\b/g, 'sort of');

  // Common title abbreviations
  s = s.replace(/\bmr\b/g, 'mister');
  s = s.replace(/\bmrs\b/g, 'missus');
  s = s.replace(/\bms\b/g, 'miss');
  s = s.replace(/\bdr\b/g, 'doctor');
  s = s.replace(/\bst\b/g, 'saint');
  s = s.replace(/\bpt\b/g, 'part');
  s = s.replace(/\bvol\b/g, 'volume');
  s = s.replace(/\blil\b/g, 'little');

  // 'cause / cuz -> because
  s = s.replace(/\b(cuz|cause)\b/g, 'because');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Checks whether two individual tokens match with phonetic and edit-distance tolerance.
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

  const codeA = metaphone(tokenA);
  const codeB = metaphone(tokenB);

  // Exact phonetic match (e.g. "morel" vs "morale" -> MRL, "money" vs "munny" -> MN, "jenny" vs "jennie" -> JN)
  if (codeA && codeB && codeA === codeB) {
    return true;
  }

  // For short words of length <= 4, avoid loose edit-distance matches without identical starting character
  if (minLen <= 4) {
    return Boolean(tokenA[0] === tokenB[0] && codeA && codeB && codeA === codeB);
  }

  // Edit distance check with anchor: requires either same first letter or same phonetic starting code
  const sameStart = tokenA[0] === tokenB[0] || (codeA && codeB && codeA[0] === codeB[0]);
  if (!sameStart) {
    return false;
  }

  const dist = levenshteinDistance(tokenA, tokenB);
  if (minLen <= 5) {
    return dist <= 1;
  }
  return dist <= 2;
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

export function checkSingleTitleMatch(spokenClean: string, normTitle: string): boolean {
  if (!normTitle || !spokenClean) return false;

  // 1. Direct phrase match
  if (spokenClean.includes(normTitle)) {
    return true;
  }

  // 2. Canonicalized contractions phrase match
  const spokenCanon = canonicalizeContractions(spokenClean);
  const normCanon = canonicalizeContractions(normTitle);

  if (spokenCanon.includes(normCanon)) {
    return true;
  }
  if (normCanon.includes(spokenCanon) && spokenCanon.length >= 4) {
    return true;
  }

  // 3. Space-collapsed match (handles compound words like "machinehead" <-> "machine head")
  const spokenNoSpace = spokenCanon.replace(/\s+/g, '');
  const normNoSpace = normCanon.replace(/\s+/g, '');
  if (normNoSpace.length >= 4 && spokenNoSpace.includes(normNoSpace)) {
    return true;
  }
  if (normNoSpace.length >= 4 && normNoSpace.includes(spokenNoSpace) && spokenNoSpace.length >= 4) {
    return true;
  }

  // 4. Token-level fuzzy & phonetic check
  const titleTokens = normCanon
    .split(/\s+/)
    .filter((t) => t.length > 1 && !VOICE_STOP_WORDS.has(t));

  if (titleTokens.length === 0) {
    return spokenNoSpace.includes(normNoSpace);
  }

  const spokenTokens = spokenCanon.split(/\s+/).filter((t) => t.length > 1);
  if (spokenTokens.length === 0) {
    return false;
  }

  let matches = 0;
  for (const tToken of titleTokens) {
    const hasMatch = spokenTokens.some((sToken) => isTokenFuzzyMatch(sToken, tToken));
    if (hasMatch) {
      matches++;
    }
  }

  // For 1-token and 2-token non-stop titles, all non-stop tokens must match:
  // e.g. "Mr Morale" (tokens: mister, morale) -> 2 / 2 = 1.0
  // e.g. "Munny Right" (tokens: munny, right) -> 2 / 2 = 1.0
  // e.g. "Champs-Elysees" (tokens: champs, elysees) -> 2 / 2 = 1.0
  // For 3+ token titles, at least 70% of tokens must match:
  const requiredRatio = titleTokens.length <= 2 ? 1.0 : 0.7;
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
