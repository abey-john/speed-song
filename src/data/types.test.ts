import { describe, it, expect } from 'vitest';
import { INTERVALS } from './types';

describe('Game Data Contracts', () => {
  it('defines the correct 7-step snippet intervals up to 15s', () => {
    expect(INTERVALS).toEqual([0.1, 0.5, 1, 3, 5, 10, 15]);
    expect(INTERVALS.length).toBe(7);
  });
});
