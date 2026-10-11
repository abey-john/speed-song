import { describe, it, expect } from 'vitest';
import {
  startVoiceRound,
  beginVoicePlayback,
  buzzInVoice,
  resolveVoiceGuess,
  expireVoiceTimeout,
  giveUpVoice,
} from './state';
import { Song } from '../data/types';

const mockSong: Song = {
  id: 'song-voice-1',
  title: 'Starboy',
  artist: 'The Weeknd',
  album: 'Starboy',
  previewUrl: '',
  artworkUrl: '',
};

describe('src/voice/state', () => {
  it('initializes round in ready state with 3 lives', () => {
    const s = startVoiceRound(mockSong, 'p1');
    expect(s.type).toBe('ready');
    if (s.type === 'ready') {
      expect(s.livesRemaining).toBe(3);
    }
  });

  it('transitions to playing state', () => {
    let s = startVoiceRound(mockSong, 'p1');
    if (s.type === 'ready') {
      s = beginVoicePlayback(s, 0);
      expect(s.type).toBe('playing');
      if (s.type === 'playing') {
        expect(s.playbackPositionSec).toBe(0);
        expect(s.livesRemaining).toBe(3);
      }
    }
  });

  it('pauses and records buzzer timestamp when buzzing in', () => {
    let s = startVoiceRound(mockSong, 'p1');
    if (s.type === 'ready') {
      s = beginVoicePlayback(s, 0);
      if (s.type === 'playing') {
        s = buzzInVoice(s, 2.34);
        expect(s.type).toBe('buzzed');
        if (s.type === 'buzzed') {
          expect(s.buzzedTimeSec).toBe(2.34);
          expect(s.livesRemaining).toBe(3);
        }
      }
    }
  });

  it('transitions to won revealed outcome on correct guess', () => {
    let s = startVoiceRound(mockSong, 'p1');
    if (s.type === 'ready') {
      s = beginVoicePlayback(s, 0);
      if (s.type === 'playing') {
        s = buzzInVoice(s, 1.45);
        if (s.type === 'buzzed') {
          s = resolveVoiceGuess(s, 'Starboy by The Weeknd', true);
          expect(s.type).toBe('revealed');
          if (s.type === 'revealed') {
            expect(s.result.outcome).toBe('won');
            if (s.result.outcome === 'won') {
              expect(s.result.timeSec).toBe(1.45);
              expect(s.result.livesRemaining).toBe(3);
            }
          }
        }
      }
    }
  });

  it('deducts lives on wrong guesses and game over after 3 wrong guesses', () => {
    let s = startVoiceRound(mockSong, 'p1');
    if (s.type === 'ready') s = beginVoicePlayback(s, 0);
    if (s.type === 'playing') s = buzzInVoice(s, 1.0);
    if (s.type === 'buzzed') {
      // 1st wrong guess
      s = resolveVoiceGuess(s, 'Wrong 1', false);
      expect(s.type).toBe('buzzed');
      if (s.type === 'buzzed') {
        expect(s.livesRemaining).toBe(2);
        expect(s.attempts).toHaveLength(1);

        // Resume and buzz again
        s = beginVoicePlayback(s, 1.0);
        if (s.type === 'playing') {
          s = buzzInVoice(s, 3.5);
          if (s.type === 'buzzed') {
            // 2nd wrong guess
            s = resolveVoiceGuess(s, 'Wrong 2', false);
            expect(s.type).toBe('buzzed');
            if (s.type === 'buzzed') {
              expect(s.livesRemaining).toBe(1);

              // 3rd wrong guess -> game over
              s = resolveVoiceGuess(s, 'Wrong 3', false);
              expect(s.type).toBe('revealed');
              if (s.type === 'revealed') {
                expect(s.result.outcome).toBe('missed');
                if (s.result.outcome === 'missed') {
                  expect(s.result.reason).toBe('out_of_lives');
                }
              }
            }
          }
        }
      }
    }
  });

  it('transitions to missed on timeout', () => {
    let s = startVoiceRound(mockSong, 'p1');
    if (s.type === 'ready') s = beginVoicePlayback(s, 0);
    if (s.type === 'playing') {
      s = expireVoiceTimeout(s);
      expect(s.type).toBe('revealed');
      if (s.type === 'revealed') {
        expect(s.result.outcome).toBe('missed');
        if (s.result.outcome === 'missed') {
          expect(s.result.reason).toBe('timeout');
        }
      }
    }
  });

  it('transitions to missed on give up', () => {
    let s = startVoiceRound(mockSong, 'p1');
    if (s.type === 'ready') s = beginVoicePlayback(s, 0);
    if (s.type === 'playing') {
      s = giveUpVoice(s);
      expect(s.type).toBe('revealed');
      if (s.type === 'revealed') {
        expect(s.result.outcome).toBe('missed');
        if (s.result.outcome === 'missed') {
          expect(s.result.reason).toBe('give_up');
        }
      }
    }
  });
});
