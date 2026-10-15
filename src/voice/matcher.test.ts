import { describe, it, expect } from 'vitest';
import {
  cleanSpokenTranscript,
  evaluateVoiceGuess,
  matchesTitle,
  matchesArtist,
  metaphone,
  levenshteinDistance,
  isTokenFuzzyMatch,
  canonicalizeContractions,
} from './matcher';
import { Song } from '../data/types';

const song1: Song = {
  id: 's1',
  title: 'Starboy',
  artist: 'The Weeknd, Daft Punk',
  album: 'Starboy',
  previewUrl: '',
  artworkUrl: '',
};

const song2: Song = {
  id: 's2',
  title: 'Viva La Vida',
  artist: 'Coldplay',
  album: '',
  previewUrl: '',
  artworkUrl: '',
};

const song3: Song = {
  id: 's3',
  title: 'Café Con Leche',
  artist: 'Pitbull',
  album: '',
  previewUrl: '',
  artworkUrl: '',
};

describe('src/voice/matcher', () => {
  it('cleans conversational filler from spoken transcripts', () => {
    expect(cleanSpokenTranscript("It's Starboy by The Weeknd")).toBe('starboy by the weeknd');
    expect(cleanSpokenTranscript('The song is Viva La Vida')).toBe('viva la vida');
    expect(cleanSpokenTranscript('  Café con leche!  ')).toBe('cafe con leche');
  });

  it('matches song title correctly', () => {
    expect(matchesTitle('starboy by the weeknd', 'Starboy')).toBe(true);
    expect(matchesTitle('viva la vida coldplay', 'Viva La Vida')).toBe(true);
    expect(matchesTitle('random song text', 'Starboy')).toBe(false);
  });

  it('matches primary artist correctly', () => {
    expect(matchesArtist('starboy the weeknd', 'The Weeknd, Daft Punk')).toBe(true);
    expect(matchesArtist('viva la vida coldplay', 'Coldplay')).toBe(true);
    expect(matchesArtist('starboy daft punk', 'The Weeknd, Daft Punk')).toBe(true);
    expect(matchesArtist('starboy taylor swift', 'The Weeknd')).toBe(false);
  });

  it('evaluates full spoken guesses correctly when both title and artist are spoken', () => {
    const res1 = evaluateVoiceGuess('Starboy by The Weeknd', song1);
    expect(res1.isCorrect).toBe(true);
    expect(res1.matchedTitle).toBe(true);
    expect(res1.matchedArtist).toBe(true);

    const res2 = evaluateVoiceGuess('Coldplay Viva La Vida', song2);
    expect(res2.isCorrect).toBe(true);

    const res3 = evaluateVoiceGuess("It's Cafe con leche by Pitbull", song3);
    expect(res3.isCorrect).toBe(true);
  });

  it('accepts guesses where only title is spoken', () => {
    const res = evaluateVoiceGuess('Starboy', song1);
    expect(res.isCorrect).toBe(true);
    expect(res.matchedTitle).toBe(true);
    expect(res.matchedArtist).toBe(false);
  });

  it('rejects guesses where only artist is spoken', () => {
    const res = evaluateVoiceGuess('The Weeknd', song1);
    expect(res.isCorrect).toBe(false);
    expect(res.matchedTitle).toBe(false);
    expect(res.matchedArtist).toBe(true);
  });

  it('accepts guesses where title is correct even if artist is different or extra', () => {
    const res = evaluateVoiceGuess('Starboy by Drake', song1);
    expect(res.isCorrect).toBe(true);
    expect(res.matchedTitle).toBe(true);
  });

  it('matches base title for songs with featured artists in parentheses', () => {
    const songFeat: Song = {
      id: 's4',
      title: 'Sunflower (feat. Swae Lee)',
      artist: 'Post Malone',
      album: '',
      previewUrl: '',
      artworkUrl: '',
    };
    const res = evaluateVoiceGuess('Sunflower', songFeat);
    expect(res.isCorrect).toBe(true);
    expect(res.matchedTitle).toBe(true);
  });

  describe('Phonetic and Levenshtein Utilities', () => {
    it('calculates correct Levenshtein distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('munny', 'money')).toBe(2);
      expect(levenshteinDistance('jennie', 'jenny')).toBe(2);
      expect(levenshteinDistance('morale', 'morel')).toBe(2);
      expect(levenshteinDistance('same', 'same')).toBe(0);
    });

    it('generates consistent Metaphone codes for homophones', () => {
      expect(metaphone('munny')).toBe(metaphone('money'));
      expect(metaphone('jennie')).toBe(metaphone('jenny'));
      expect(metaphone('morale')).toBe(metaphone('morel'));
      expect(metaphone('phil')).toBe(metaphone('fill'));
    });

    it('canonicalizes spoken contractions and slang', () => {
      expect(canonicalizeContractions('wannabe')).toBe('want to be');
      expect(canonicalizeContractions('wanna')).toBe('want to');
      expect(canonicalizeContractions('gonna')).toBe('going to');
      expect(canonicalizeContractions('gotta')).toBe('got to');
      expect(canonicalizeContractions('got a')).toBe('got to');
      expect(canonicalizeContractions('gimme')).toBe('give me');
      expect(canonicalizeContractions('whatcha')).toBe('what to');
      expect(canonicalizeContractions('what to')).toBe('what to');
      expect(canonicalizeContractions('mr')).toBe('mister');
    });

    it('evaluates token fuzzy matches safely without false positives on short words', () => {
      expect(isTokenFuzzyMatch('munny', 'money')).toBe(true);
      expect(isTokenFuzzyMatch('morel', 'morale')).toBe(true);
      expect(isTokenFuzzyMatch('jenny', 'jennie')).toBe(true);
      expect(isTokenFuzzyMatch('champ', 'champs')).toBe(true);
      expect(isTokenFuzzyMatch('elysee', 'elysees')).toBe(true);

      // Short words (<= 3 chars) and unrelated words MUST NOT match
      expect(isTokenFuzzyMatch('cat', 'bat')).toBe(false);
      expect(isTokenFuzzyMatch('bad', 'mad')).toBe(false);
      expect(isTokenFuzzyMatch('star', 'stay')).toBe(false);
      expect(isTokenFuzzyMatch('hello', 'yellow')).toBe(false);
    });
  });

  describe('Bug Report Mishearings & Contractions', () => {
    it('matches "Mr Morale" when recognized as "Mr Morel"', () => {
      const song: Song = {
        id: 'mor',
        title: 'Mr. Morale',
        artist: 'Kendrick Lamar',
        album: 'Mr. Morale & the Big Steppers',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('Mr Morel', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Mr Morale', song).isCorrect).toBe(true);
    });

    it('matches "Wannabe" when recognized as "want to be"', () => {
      const song: Song = {
        id: 'wb',
        title: 'Wannabe',
        artist: 'Spice Girls',
        album: 'Spice',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('want to be', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('wanna be', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('wannabe', song).isCorrect).toBe(true);
    });

    it('matches "Gimme Shelter" when recognized as "Give me shelter"', () => {
      const song: Song = {
        id: 'gs',
        title: 'Gimme Shelter',
        artist: 'The Rolling Stones',
        album: 'Let It Bleed',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('Give me shelter', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Gimme Shelter', song).isCorrect).toBe(true);
    });

    it('matches "Whatcha Say" when recognized as "What to say"', () => {
      const song: Song = {
        id: 'ws',
        title: 'Whatcha Say',
        artist: 'Jason Derulo',
        album: 'Jason Derulo',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('What to say', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Whatcha Say', song).isCorrect).toBe(true);
    });

    it('matches "Munny Right" when recognized as "money right"', () => {
      const song: Song = {
        id: 'mr',
        title: 'Munny Right',
        artist: 'Jon Bellion',
        album: 'The Definition',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('money right', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Munny Right', song).isCorrect).toBe(true);
    });

    it('matches "It\'s Gonna Be Me" when recognized as "it\'s going to be me"', () => {
      const song: Song = {
        id: 'gbm',
        title: "It's Gonna Be Me",
        artist: '*NSYNC',
        album: 'No Strings Attached',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess("it's going to be me", song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('going to be me', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess("it's gonna be me", song).isCorrect).toBe(true);
    });

    it('matches foreign song "Les Champs-Elysées" across accent and article variations', () => {
      const song: Song = {
        id: 'lce',
        title: 'Les Champs-Elysées',
        artist: 'Joe Dassin',
        album: 'Les Champs-Élysées',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('Champs-Elysees', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('champs elysees', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('les champs elysees', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('les champ elysee', song).isCorrect).toBe(true);
    });

    it('matches "I Gotta Feeling" when recognized as "I got a feeling"', () => {
      const song: Song = {
        id: 'igf',
        title: 'I Gotta Feeling',
        artist: 'Black Eyed Peas',
        album: 'The E.N.D.',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('I got a feeling', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('I gotta feeling', song).isCorrect).toBe(true);
    });

    it('matches "Like JENNIE" when recognized as "Like jenny"', () => {
      const song: Song = {
        id: 'lj',
        title: 'Like JENNIE',
        artist: 'Jennie',
        album: 'Single',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('Like jenny', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Like JENNIE', song).isCorrect).toBe(true);
    });

    it('matches "Machinehead" when recognized as "machine head"', () => {
      const song: Song = {
        id: 'mh',
        title: 'Machinehead',
        artist: 'Bush',
        album: 'Sixteen Stone',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('machine head', song).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Machinehead', song).isCorrect).toBe(true);
    });
  });
});
