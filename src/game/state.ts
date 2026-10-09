import { Song, INTERVALS, IntervalStep } from '../data/types';

export interface WrongGuess {
  guessId?: string;
  guessLabel?: string;
  stepIndex: number;
  durationSec: IntervalStep;
  wasSkipped: boolean;
}

export type RevealResult =
  | { outcome: 'guessed'; stepIndex: number; durationSec: IntervalStep }
  | { outcome: 'missed' };

export type GameState =
  | { type: 'idle'; selectedPlaylistId: string | null }
  | { type: 'loading'; selectedPlaylistId: string }
  | {
      type: 'guessing';
      song: Song;
      step: number; // 0 to 7
      wrongGuesses: WrongGuess[];
      selectedPlaylistId: string;
    }
  | {
      type: 'revealed';
      song: Song;
      result: RevealResult;
      wrongGuesses: WrongGuess[];
      selectedPlaylistId: string;
    };

export function createInitialState(selectedPlaylistId: string | null = null): GameState {
  return { type: 'idle', selectedPlaylistId };
}

export function startRound(song: Song, selectedPlaylistId: string): GameState {
  return {
    type: 'guessing',
    song,
    step: 0,
    wrongGuesses: [],
    selectedPlaylistId,
  };
}

export function submitGuess(
  currentState: Extract<GameState, { type: 'guessing' }>,
  guessedSongId: string,
  guessedSongLabel: string
): GameState {
  const isCorrect = guessedSongId === currentState.song.id;
  const currentDuration = INTERVALS[currentState.step] ?? 30;

  if (isCorrect) {
    return {
      type: 'revealed',
      song: currentState.song,
      result: {
        outcome: 'guessed',
        stepIndex: currentState.step,
        durationSec: currentDuration,
      },
      wrongGuesses: currentState.wrongGuesses,
      selectedPlaylistId: currentState.selectedPlaylistId,
    };
  }

  const newWrongGuess: WrongGuess = {
    guessId: guessedSongId,
    guessLabel: guessedSongLabel,
    stepIndex: currentState.step,
    durationSec: currentDuration,
    wasSkipped: false,
  };

  const nextStep = currentState.step + 1;
  const isGameOver = nextStep >= INTERVALS.length;

  if (isGameOver) {
    return {
      type: 'revealed',
      song: currentState.song,
      result: { outcome: 'missed' },
      wrongGuesses: [...currentState.wrongGuesses, newWrongGuess],
      selectedPlaylistId: currentState.selectedPlaylistId,
    };
  }

  return {
    ...currentState,
    step: nextStep,
    wrongGuesses: [...currentState.wrongGuesses, newWrongGuess],
  };
}

export function submitSkip(currentState: Extract<GameState, { type: 'guessing' }>): GameState {
  const currentDuration = INTERVALS[currentState.step] ?? 30;

  const newWrongGuess: WrongGuess = {
    stepIndex: currentState.step,
    durationSec: currentDuration,
    wasSkipped: true,
  };

  const nextStep = currentState.step + 1;
  const isGameOver = nextStep >= INTERVALS.length;

  if (isGameOver) {
    return {
      type: 'revealed',
      song: currentState.song,
      result: { outcome: 'missed' },
      wrongGuesses: [...currentState.wrongGuesses, newWrongGuess],
      selectedPlaylistId: currentState.selectedPlaylistId,
    };
  }

  return {
    ...currentState,
    step: nextStep,
    wrongGuesses: [...currentState.wrongGuesses, newWrongGuess],
  };
}
