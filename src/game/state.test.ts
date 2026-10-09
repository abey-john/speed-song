import { describe, it, expect } from 'vitest';
import { createInitialState, startRound, submitGuess, submitSkip } from './state';
import { Song, INTERVALS } from '../data/types';

const sampleSong: Song = {
  id: 'target-123',
  title: 'Starboy',
  artist: 'The Weeknd',
  album: 'Starboy',
  previewUrl: 'https://example.com/audio.m4a',
  artworkUrl: 'https://example.com/art.jpg',
};

describe('Game State Transitions', () => {
  it('starts in idle state', () => {
    const state = createInitialState();
    expect(state.type).toBe('idle');
  });

  it('starts round at step 0 with empty wrong guesses', () => {
    const state = startRound(sampleSong, 'playlist-1');
    expect(state.type).toBe('guessing');
    if (state.type === 'guessing') {
      expect(state.step).toBe(0);
      expect(state.wrongGuesses).toHaveLength(0);
      expect(state.song.id).toBe('target-123');
    }
  });

  it('reveals successfully on correct guess at step 0', () => {
    const guessing = startRound(sampleSong, 'playlist-1');
    if (guessing.type !== 'guessing') throw new Error('Expected guessing state');

    const nextState = submitGuess(guessing, 'target-123', 'Starboy — The Weeknd');
    expect(nextState.type).toBe('revealed');
    if (nextState.type === 'revealed') {
      expect(nextState.result.outcome).toBe('guessed');
      if (nextState.result.outcome === 'guessed') {
        expect(nextState.result.stepIndex).toBe(0);
        expect(nextState.result.durationSec).toBe(0.1);
      }
    }
  });

  it('advances step and records wrong guess on incorrect guess', () => {
    const guessing = startRound(sampleSong, 'playlist-1');
    if (guessing.type !== 'guessing') throw new Error('Expected guessing state');

    const nextState = submitGuess(guessing, 'wrong-456', 'Wrong Song — Other Artist');
    expect(nextState.type).toBe('guessing');
    if (nextState.type === 'guessing') {
      expect(nextState.step).toBe(1);
      expect(nextState.wrongGuesses).toHaveLength(1);
      expect(nextState.wrongGuesses[0]?.guessLabel).toBe('Wrong Song — Other Artist');
      expect(nextState.wrongGuesses[0]?.wasSkipped).toBe(false);
    }
  });

  it('advances step on skip', () => {
    const guessing = startRound(sampleSong, 'playlist-1');
    if (guessing.type !== 'guessing') throw new Error('Expected guessing state');

    const nextState = submitSkip(guessing);
    expect(nextState.type).toBe('guessing');
    if (nextState.type === 'guessing') {
      expect(nextState.step).toBe(1);
      expect(nextState.wrongGuesses).toHaveLength(1);
      expect(nextState.wrongGuesses[0]?.wasSkipped).toBe(true);
    }
  });

  it('transitions to revealed missed outcome on wrong guess at last step (30s)', () => {
    let current = startRound(sampleSong, 'playlist-1');

    // Advance 7 times to reach step 7 (30s interval)
    for (let i = 0; i < INTERVALS.length - 1; i++) {
      if (current.type !== 'guessing') throw new Error('Expected guessing');
      current = submitSkip(current);
    }

    expect(current.type).toBe('guessing');
    if (current.type === 'guessing') {
      expect(current.step).toBe(7);
      const finalState = submitGuess(current, 'wrong-999', 'Missed Guess');
      expect(finalState.type).toBe('revealed');
      if (finalState.type === 'revealed') {
        expect(finalState.result.outcome).toBe('missed');
        expect(finalState.wrongGuesses).toHaveLength(8);
      }
    }
  });
});
