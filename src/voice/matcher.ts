import { Song } from '../data/types';
import { normalizeSearchString } from '../ui/search';
import { isSamePrimaryArtist } from '../../scripts/data/normalize';

export interface VoiceMatchResult {
  isCorrect: boolean;
  matchedTitle: boolean;
  matchedArtist: boolean;
  confidence: number;
  transcript: string;
}

/**
 * Strips conversational filler words and common connector phrases from spoken transcripts.
 */
export function cleanSpokenTranscript(transcript: string): string {
  let cleaned = normalizeSearchString(transcript);

  // Strip conversational filler prefixes (before stripping apostrophes)
  cleaned = cleaned.replace(/^(it is|it's|its|i think it's|i think its|this is|the song is|song is)\s+/i, '');

  // Remove common punctuation and symbols
  cleaned = cleaned.replace(/['"’]/g, ''); // remove apostrophes without space (it's -> its)
  cleaned = cleaned.replace(/[-–—,.:;!?()[\]{}]/g, ' ');

  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Checks whether the spoken text contains the song's primary title.
 */
export function matchesTitle(spokenClean: string, targetTitle: string): boolean {
  const normTitle = cleanSpokenTranscript(targetTitle);
  if (!normTitle || !spokenClean) return false;

  // Direct phrase match
  if (spokenClean.includes(normTitle)) {
    return true;
  }

  // Token-level check (ignoring tiny stop words)
  const titleTokens = normTitle.split(/\s+/).filter((t) => t.length > 1 && t !== 'the' && t !== 'a');
  if (titleTokens.length === 0) {
    return spokenClean.includes(normTitle);
  }

  const matches = titleTokens.filter((token) => spokenClean.includes(token));
  // At least 70% of non-trivial title tokens present
  return matches.length / titleTokens.length >= 0.7;
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

  // Split target artist into distinct contributing artists before stripping punctuation
  const artistParts = targetArtist
    .split(/[,&]|\b(?:feat|ft|featuring|with|and)\b/i)
    .map((p) => cleanSpokenTranscript(p))
    .filter(Boolean);

  for (const part of artistParts) {
    if (part && spokenClean.includes(part)) {
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
 * Evaluates whether a spoken guess names both the song and primary artist.
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
  const isCorrect = titleMatch && artistMatch;

  let confidence = 0;
  if (titleMatch) confidence += 0.5;
  if (artistMatch) confidence += 0.5;

  return {
    isCorrect,
    matchedTitle: titleMatch,
    matchedArtist: artistMatch,
    confidence,
    transcript,
  };
}
