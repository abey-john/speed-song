import { describe, it, expect } from 'vitest';
import { normalize, getBaseTitle, createLabel, artistsMatch, createNormalizedLabelKey } from './normalize';

describe('normalize utility', () => {
  it('strips punctuation, whitespace, and lowercases', () => {
    expect(normalize('Hello, World! 123')).toBe('helloworld123');
    expect(normalize("Don't Stop Believin'")).toBe('dontstopbelievin');
    expect(normalize('  Spaces & Symbols *#%  ')).toBe('spacessymbols');
  });

  it('extracts base title correctly', () => {
    expect(getBaseTitle('Starboy (feat. Daft Punk)')).toBe('Starboy');
    expect(getBaseTitle('Blinding Lights - Remastered')).toBe('Blinding Lights');
    expect(getBaseTitle('In Your Eyes [Deluxe Edition]')).toBe('In Your Eyes');
    expect(getBaseTitle('Title: Subtitle')).toBe('Title');
    expect(getBaseTitle('Regular Song')).toBe('Regular Song');
  });

  it('formats user label correctly', () => {
    expect(createLabel('Starboy', 'The Weeknd')).toBe('Starboy — The Weeknd');
  });

  it('matches artists permissively', () => {
    expect(artistsMatch('The Weeknd', 'The Weeknd, Daft Punk')).toBe(true);
    expect(artistsMatch('Daft Punk', 'Daft Punk')).toBe(true);
    expect(artistsMatch('Taylor Swift', 'Taylor Swift')).toBe(true);
    expect(artistsMatch('Drake', 'Kendrick Lamar')).toBe(false);
  });

  it('generates consistent normalized label keys', () => {
    expect(createNormalizedLabelKey('Song', 'Artist')).toBe(
      createNormalizedLabelKey('song!', 'artist.')
    );
  });
});
