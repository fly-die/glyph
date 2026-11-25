import { describe, expect, it } from 'vitest';
import { CHARSET, glyphName } from './charset';

describe('glyphName', () => {
  it('gives every character a valid, unique PostScript glyph name', () => {
    const names = CHARSET.map(glyphName);
    for (const name of names) expect(name).toMatch(/^[A-Za-z][A-Za-z0-9._]{0,62}$/);
    expect(new Set(names).size).toBe(CHARSET.length);
  });
});
