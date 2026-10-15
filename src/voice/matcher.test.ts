import { describe, it, expect } from 'vitest';
import {
  cleanSpokenTranscript,
  evaluateVoiceGuess,
  matchesTitle,
  matchesArtist,
  doubleMetaphone,
  isTokenFuzzyMatch,
  canonicalizeContractions,
  isSpaceCollapsedFuzzyMatch,
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

  describe('Phonetic and Fuzzy Utilities', () => {

    it('generates consistent Metaphone codes for homophones', () => {
      expect(doubleMetaphone('munny')).toEqual(doubleMetaphone('money'));
      expect(doubleMetaphone('jennie')).toEqual(doubleMetaphone('jenny'));
      expect(doubleMetaphone('morale')).toEqual(doubleMetaphone('morel'));
      expect(doubleMetaphone('phil')).toEqual(doubleMetaphone('fill'));
    });

    it('canonicalizes universal English abbreviations and numbers', () => {
      expect(canonicalizeContractions('mr')).toBe('mister');
      expect(canonicalizeContractions('dr')).toBe('doctor');
      expect(canonicalizeContractions('st')).toBe('saint');
      expect(canonicalizeContractions('five')).toBe('5');
    });

    it('matches space-collapsed phrases with Fuse.js without hardcoded dictionaries', () => {
      expect(isSpaceCollapsedFuzzyMatch('wanttobe', 'wannabe')).toBe(true);
      expect(isSpaceCollapsedFuzzyMatch('givemeshelter', 'gimmeshelter')).toBe(true);
      expect(isSpaceCollapsedFuzzyMatch('whattosay', 'whatchasay')).toBe(true);
      expect(isSpaceCollapsedFuzzyMatch('itsgoingtobeme', 'itsgonnabeme')).toBe(true);
      expect(isSpaceCollapsedFuzzyMatch('igottafeeling', 'igotafeeling')).toBe(true);
      expect(isSpaceCollapsedFuzzyMatch('machinehead', 'machinehead')).toBe(true);

      // Must reject false positives
      expect(isSpaceCollapsedFuzzyMatch('bad', 'mad')).toBe(false);
      expect(isSpaceCollapsedFuzzyMatch('hello', 'yellow')).toBe(false);
      expect(isSpaceCollapsedFuzzyMatch('letitbe', 'letitgo')).toBe(false);
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

    it('matches Roman numerals, number words, and digits interchangeably', () => {
      const songRoman: Song = {
        id: 'star-part-2',
        title: 'Starboy Part II',
        artist: 'The Weeknd',
        album: 'Starboy',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('Starboy Part 2', songRoman).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Starboy Part Two', songRoman).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Starboy Part II', songRoman).isCorrect).toBe(true);

      const songMambo: Song = {
        id: 'mambo-5',
        title: 'Mambo No. 5',
        artist: 'Lou Bega',
        album: 'A Little Bit of Mambo',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('Mambo Number 5', songMambo).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Mambo Number Five', songMambo).isCorrect).toBe(true);

      const songBlur: Song = {
        id: 'song-2',
        title: 'Song 2',
        artist: 'Blur',
        album: 'Blur',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('Song Two', songBlur).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('Song 2', songBlur).isCorrect).toBe(true);
    });

    it('prevents false positive substring matches on short common words', () => {
      const songOne: Song = {
        id: 'u2-one',
        title: 'One',
        artist: 'U2',
        album: 'Achtung Baby',
        previewUrl: '',
        artworkUrl: '',
      };
      expect(evaluateVoiceGuess('One', songOne).isCorrect).toBe(true);
      // "Someone Like You" contains the letters "one", but MUST NOT match the song "One"
      expect(evaluateVoiceGuess('Someone like you', songOne).isCorrect).toBe(false);
    });

    it('rejects partial title guesses so players are not marked correct prematurely', () => {
      const songBeastie: Song = {
        id: 'no-sleep',
        title: 'No Sleep Till Brooklyn',
        artist: 'Beastie Boys',
        album: 'Licensed to Ill',
        previewUrl: '',
        artworkUrl: '',
      };
      // Saying only the first 2 words MUST NOT mark correct
      expect(evaluateVoiceGuess('No Sleep', songBeastie).isCorrect).toBe(false);
      // Saying full title marks correct
      expect(evaluateVoiceGuess('No Sleep Till Brooklyn', songBeastie).isCorrect).toBe(true);
      expect(evaluateVoiceGuess('No Sleep Til Brooklyn', songBeastie).isCorrect).toBe(true);

      const songFOB: Song = {
        id: 'fob',
        title: 'My Songs Know What You Did In The Dark (Light Em Up)',
        artist: 'Fall Out Boy',
        album: 'Save Rock and Roll',
        previewUrl: '',
        artworkUrl: '',
      };
      // Saying only "My Songs" MUST NOT mark correct
      expect(evaluateVoiceGuess('My Songs', songFOB).isCorrect).toBe(false);
      // Saying base title marks correct
      expect(evaluateVoiceGuess('My Songs Know What You Did In The Dark', songFOB).isCorrect).toBe(true);
    });
  });
});
