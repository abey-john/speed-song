import { describe, it, expect } from 'vitest';
import { ShuffleBag } from './bag';

describe('ShuffleBag', () => {
  it('draws every item once before repeating', () => {
    const items = [
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
      { id: '3', title: 'C' },
    ];

    const bag = new ShuffleBag(items);
    const drawnIds = [bag.draw()?.id, bag.draw()?.id, bag.draw()?.id];

    expect(drawnIds).toHaveLength(3);
    expect(new Set(drawnIds).size).toBe(3);
    expect(bag.remaining()).toBe(0);

    // Next draw triggers refill
    const fourth = bag.draw();
    expect(fourth).not.toBeNull();
  });

  it('ensures first item in new bag does not immediately repeat the last item drawn', () => {
    const items = [
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
    ];

    const bag = new ShuffleBag(items);
    for (let round = 0; round < 20; round++) {
      bag.draw();
      const second = bag.draw()!;
      const nextRoundFirst = bag.draw()!;

      expect(nextRoundFirst.id).not.toBe(second.id);
    }
  });

  it('handles empty bag gracefully', () => {
    const bag = new ShuffleBag([]);
    expect(bag.draw()).toBeNull();
  });
});
