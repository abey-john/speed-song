/**
 * Fisher-Yates shuffle algorithm.
 */
function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/**
 * A per-playlist shuffle bag.
 * Draws items without repeat until exhausted, then reshuffles,
 * guaranteeing the last drawn item is never first in the new bag.
 */
export class ShuffleBag<T extends { id: string }> {
  private allItems: T[];
  private currentBag: T[] = [];
  private lastDrawnItem: T | null = null;

  constructor(items: T[]) {
    this.allItems = [...items];
    this.refill();
  }

  private refill(): void {
    if (this.allItems.length === 0) {
      this.currentBag = [];
      return;
    }

    let shuffled = shuffleArray(this.allItems);

    // If more than 1 item, ensure new first != last drawn
    if (shuffled.length > 1 && this.lastDrawnItem && shuffled[0]?.id === this.lastDrawnItem.id) {
      // Swap with a random different position
      const swapIndex = 1 + Math.floor(Math.random() * (shuffled.length - 1));
      const first = shuffled[0]!;
      shuffled[0] = shuffled[swapIndex]!;
      shuffled[swapIndex] = first;
    }

    this.currentBag = shuffled;
  }

  public draw(): T | null {
    if (this.allItems.length === 0) return null;

    if (this.currentBag.length === 0) {
      this.refill();
    }

    const drawn = this.currentBag.shift() || null;
    this.lastDrawnItem = drawn;
    return drawn;
  }

  public remaining(): number {
    return this.currentBag.length;
  }

  public total(): number {
    return this.allItems.length;
  }

  public reset(): void {
    this.lastDrawnItem = null;
    this.refill();
  }
}
