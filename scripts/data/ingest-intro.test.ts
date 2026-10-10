import { describe, it, expect } from 'vitest';
import { buildSearchQueries } from './ingest-intro';

describe('scripts/data/ingest-intro', () => {
  it('builds search queries preferring YouTube Music topic tracks without internal quotes', () => {
    const queries = buildSearchQueries('Banana Pancakes', 'Jack Johnson');
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe('ytsearch5:Jack Johnson Banana Pancakes Topic');
    expect(queries[1]).toBe('ytsearch5:Jack Johnson Banana Pancakes audio');
  });

  it('strips remaster tags and quotes for cleaner topic query matches', () => {
    const queries = buildSearchQueries('Harder, "Better", Faster, Stronger - Remastered 2021', 'Daft Punk');
    expect(queries[0]).toBe('ytsearch5:Daft Punk Harder, Better, Faster, Stronger Topic');
  });
});
