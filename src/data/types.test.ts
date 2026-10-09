import { describe, it, expect } from 'vitest';
import { INTERVALS } from './types';

describe('Game Data Contracts', () => {
  it('defines the correct 8-step snippet intervals', () => {
    expect(INTERVALS).toEqual([0.1, 0.5, 1, 3, 5, 10, 15, 30]);
    expect(INTERVALS.length).toBe(8);
  });
});
