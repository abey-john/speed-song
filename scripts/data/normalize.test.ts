import { describe, it, expect } from 'vitest';
import { normalize, getBaseTitle, createLabel, artistsMatch, createNormalizedLabelKey, titlesMatch } from './normalize';

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
    expect(getBaseTitle('19-2000')).toBe('19-2000');
    expect(getBaseTitle('Spider-Man')).toBe('Spider-Man');
    expect(getBaseTitle("(I Can't Get No) Satisfaction - Mono")).toBe("(I Can't Get No) Satisfaction");
  });

  it('correctly matches and distinguishes song titles with titlesMatch', () => {
    // Exact & variant matches
    expect(titlesMatch('19-2000', '19-2000')).toBe(true);
    expect(titlesMatch('19-2000', '19-2000 (Soulchild Remix)')).toBe(true);
    expect(titlesMatch('Kids', 'Kids')).toBe(true);
    expect(titlesMatch('Kids', 'Kids - Soulwax Remix')).toBe(true);
    expect(titlesMatch("(I Can't Get No) Satisfaction", 'Satisfaction (Mono Version)')).toBe(true);

    // Mismatches MUST return false
    expect(titlesMatch('19-2000', 'On Melancholy Hill')).toBe(false);
    expect(titlesMatch('19-2000', 'Re-Hash')).toBe(false);
    expect(titlesMatch('19-2000', 'Feel Good Inc.')).toBe(false);
    expect(titlesMatch('Hash Pipe', 'Island In The Sun')).toBe(false);
    expect(titlesMatch('De Selby (Part 2)', 'Eat Your Young')).toBe(false);
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
