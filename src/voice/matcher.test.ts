import { describe, it, expect } from 'vitest';
import { cleanSpokenTranscript, evaluateVoiceGuess, matchesTitle, matchesArtist } from './matcher';
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
});
