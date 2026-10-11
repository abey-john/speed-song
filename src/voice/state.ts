import { Song } from '../data/types';

export const MAX_VOICE_LIVES = 3;
export const MAX_VOICE_DURATION_SEC = 30;

export interface VoiceAttempt {
  buzzedTimeSec: number;
  transcript: string;
  wasCorrect: boolean;
  livesAfter: number;
}

export type VoiceRoundOutcome =
  | { outcome: 'won'; timeSec: number; attempts: VoiceAttempt[]; livesRemaining: number }
  | { outcome: 'missed'; attempts: VoiceAttempt[]; reason: 'out_of_lives' | 'timeout' };

export type VoiceGameState =
  | {
      type: 'ready';
      song: Song;
      selectedPlaylistId: string;
      livesRemaining: number;
    }
  | {
      type: 'playing';
      song: Song;
      selectedPlaylistId: string;
      livesRemaining: number;
      playbackPositionSec: number;
      attempts: VoiceAttempt[];
    }
  | {
      type: 'buzzed';
      song: Song;
      selectedPlaylistId: string;
      livesRemaining: number;
      buzzedTimeSec: number;
      attempts: VoiceAttempt[];
    }
  | {
      type: 'revealed';
      song: Song;
      selectedPlaylistId: string;
      result: VoiceRoundOutcome;
      attempts: VoiceAttempt[];
    };

export function startVoiceRound(song: Song, selectedPlaylistId: string): VoiceGameState {
  return {
    type: 'ready',
    song,
    selectedPlaylistId,
    livesRemaining: MAX_VOICE_LIVES,
  };
}

export function beginVoicePlayback(
  state: Extract<VoiceGameState, { type: 'ready' | 'buzzed' }>,
  resumePositionSec = 0
): VoiceGameState {
  const attempts = state.type === 'buzzed' ? state.attempts : [];
  return {
    type: 'playing',
    song: state.song,
    selectedPlaylistId: state.selectedPlaylistId,
    livesRemaining: state.livesRemaining,
    playbackPositionSec: resumePositionSec,
    attempts,
  };
}

export function buzzInVoice(
  state: Extract<VoiceGameState, { type: 'playing' }>,
  currentTimeSec: number
): VoiceGameState {
  const clampedTime = Math.min(currentTimeSec, MAX_VOICE_DURATION_SEC);
  return {
    type: 'buzzed',
    song: state.song,
    selectedPlaylistId: state.selectedPlaylistId,
    livesRemaining: state.livesRemaining,
    buzzedTimeSec: Number(clampedTime.toFixed(2)),
    attempts: state.attempts,
  };
}

export function resolveVoiceGuess(
  state: Extract<VoiceGameState, { type: 'buzzed' }>,
  transcript: string,
  isCorrect: boolean
): VoiceGameState {
  const nextLives = isCorrect ? state.livesRemaining : state.livesRemaining - 1;
  const newAttempt: VoiceAttempt = {
    buzzedTimeSec: state.buzzedTimeSec,
    transcript: transcript || '(No speech detected)',
    wasCorrect: isCorrect,
    livesAfter: Math.max(0, nextLives),
  };
  const updatedAttempts = [...state.attempts, newAttempt];

  if (isCorrect) {
    return {
      type: 'revealed',
      song: state.song,
      selectedPlaylistId: state.selectedPlaylistId,
      result: {
        outcome: 'won',
        timeSec: state.buzzedTimeSec,
        attempts: updatedAttempts,
        livesRemaining: state.livesRemaining,
      },
      attempts: updatedAttempts,
    };
  }

  if (nextLives <= 0) {
    return {
      type: 'revealed',
      song: state.song,
      selectedPlaylistId: state.selectedPlaylistId,
      result: {
        outcome: 'missed',
        attempts: updatedAttempts,
        reason: 'out_of_lives',
      },
      attempts: updatedAttempts,
    };
  }

  // Lives remain -> transition to buzzed with updated lives and attempts, ready to resume
  return {
    type: 'buzzed',
    song: state.song,
    selectedPlaylistId: state.selectedPlaylistId,
    livesRemaining: nextLives,
    buzzedTimeSec: state.buzzedTimeSec,
    attempts: updatedAttempts,
  };
}

export function expireVoiceTimeout(
  state: Extract<VoiceGameState, { type: 'playing' | 'buzzed' }>
): VoiceGameState {
  return {
    type: 'revealed',
    song: state.song,
    selectedPlaylistId: state.selectedPlaylistId,
    result: {
      outcome: 'missed',
      attempts: state.attempts,
      reason: 'timeout',
    },
    attempts: state.attempts,
  };
}
