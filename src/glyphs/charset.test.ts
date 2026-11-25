import { describe, expect, it } from 'vitest';
import { cellFor, CHARSET, glyphName } from './charset';

describe('glyphName', () => {
  it('gives every character a valid, unique PostScript glyph name', () => {
    const names = CHARSET.map(glyphName);
    for (const name of names) expect(name).toMatch(/^[A-Za-z][A-Za-z0-9._]{0,62}$/);
    expect(new Set(names).size).toBe(CHARSET.length);
  });
});

describe('cellFor', () => {
  it('finds the cell behind a typed character, curly quotes included', () => {
    expect(cellFor('a')).toBe('a');
    expect(cellFor('\u2019')).toBe("'");
    expect(cellFor('\u201c')).toBe('"');
    expect(cellFor('\u00e9')).toBeNull();
  });
});
