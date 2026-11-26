import { parse } from 'opentype.js';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../outline';
import { buildFontFile, fontFileName, sanitizeFamilyName } from './build';

function stroke(points: [number, number][], pressure = 0.5): Stroke {
  return points.flatMap(([x, y], index) => {
    const next = points[index + 1];
    if (!next) return [{ x, y, pressure }];
    return Array.from({ length: 10 }, (_, step) => ({
      x: x + ((next[0] - x) * step) / 10,
      y: y + ((next[1] - y) * step) / 10,
      pressure,
    }));
  });
}

const N = [stroke([[40, 160], [40, 80]]), stroke([[40, 100], [70, 80], [100, 100], [100, 160]])];
const A = [stroke([[30, 160], [80, 20], [130, 160]]), stroke([[55, 110], [105, 110]])];
const SEVEN = [stroke([[40, 30], [120, 30], [70, 160]])];

function roundTrip(strokes: Record<string, Stroke[]>, family = 'Test Hand') {
  return parse(buildFontFile(new Map(Object.entries(strokes)), family));
}

describe('buildFontFile', () => {
  it('writes a font that parses back with the drawn glyphs mapped', () => {
    const font = roundTrip({ n: N, A, 7: SEVEN });
    expect(font.unitsPerEm).toBe(1000);
    // .notdef, space and the three drawn glyphs.
    expect(font.glyphs.length).toBe(5);
    expect(font.charToGlyph('A').name).toBe('A');
    expect(font.charToGlyph('7').name).toBe('seven');
    expect(font.charToGlyph('n').unicode).toBe(110);
    expect(font.charToGlyphIndex('B')).toBe(0);
  });

  it('maps curly quotes and the Unicode hyphen to the drawn straight forms', () => {
    const tick = [stroke([[100, 40], [96, 70]])];
    const font = roundTrip({ "'": tick, '"': [...tick, stroke([[120, 40], [116, 70]])], '-': [stroke([[60, 120], [140, 120]])] });
    for (const quote of ['‘', '’']) expect(font.charToGlyph(quote).name).toBe('quotesingle');
    for (const quote of ['“', '”']) expect(font.charToGlyph(quote).name).toBe('quotedbl');
    expect(font.charToGlyph('‐').name).toBe('hyphen');
    expect(font.charToGlyph('(').name).toBe('.notdef');
  });

  it('carries the family name into the name table', () => {
    const font = roundTrip({ A }, 'Flynn Script');
    expect(font.getEnglishName('fontFamily')).toBe('Flynn Script');
    expect(font.getEnglishName('fullName')).toBe('Flynn Script Regular');
    expect(font.getEnglishName('postScriptName')).toBe('FlynnScript-Regular');
  });

  it('marks the font as regular weight', () => {
    const os2 = roundTrip({ A }).tables.os2 as unknown as { usWeightClass: number };
    expect(os2.usWeightClass).toBe(400);
  });

  it('makes the space a bit over half as wide as the n', () => {
    const font = roundTrip({ n: N, A });
    const n = font.charToGlyph('n').advanceWidth ?? 0;
    expect(font.charToGlyph(' ').advanceWidth).toBe(Math.round(n * 0.55));
    expect(font.charToGlyph(' ').path.commands).toHaveLength(0);
  });

  it('falls back to a fixed space when there is no n', () => {
    expect(roundTrip({ A }).charToGlyph(' ').advanceWidth).toBe(300);
  });

  it('places outlines on the baseline with side bearings around the ink', () => {
    const glyph = roundTrip({ n: N }).charToGlyph('n');
    const box = glyph.getBoundingBox();
    // Nominal pressure: a 75 unit stem, so 0.6 x 75 = 45 units on each side.
    expect(Math.abs(box.x1 - 45)).toBeLessThanOrEqual(3);
    expect(Math.abs((glyph.advanceWidth ?? 0) - (box.x2 + 45))).toBeLessThanOrEqual(3);
    // Drawn between the guides: from just under the baseline to just over the x-height.
    expect(box.y1).toBeLessThan(0);
    expect(box.y1).toBeGreaterThan(-60);
    expect(box.y2).toBeGreaterThan(500);
    expect(box.y2).toBeLessThan(560);
  });

  it('gives heavier writing wider side bearings, the same for every glyph', () => {
    const sevenAt = (pressure: number) => [stroke([[40, 30], [120, 30], [70, 160]], pressure)];
    const light = roundTrip({ 7: sevenAt(0.2), A }).charToGlyph('7').getBoundingBox().x1;
    const heavyA = A.map((s) => s.map((p) => ({ ...p, pressure: 1 })));
    const heavy = roundTrip({ 7: sevenAt(1), A: heavyA }).charToGlyph('7').getBoundingBox().x1;
    expect(heavy).toBeGreaterThan(light + 10);

    const mixed = roundTrip({ 7: sevenAt(1), A });
    const leftEdge = (char: string) => mixed.charToGlyph(char).getBoundingBox().x1;
    expect(Math.abs(leftEdge('7') - leftEdge('A'))).toBeLessThanOrEqual(3);
  });

  it('keeps the capital taller than the lowercase letter', () => {
    const font = roundTrip({ n: N, A });
    expect(font.charToGlyph('A').getBoundingBox().y2).toBeGreaterThan(
      font.charToGlyph('n').getBoundingBox().y2 + 250,
    );
  });
});

describe('sanitizeFamilyName', () => {
  it('keeps plain names and trims white space', () => {
    expect(sanitizeFamilyName('  Flynn   Hand ')).toBe('Flynn Hand');
  });

  it('drops characters font menus cannot show and falls back when nothing is left', () => {
    expect(sanitizeFamilyName('Zürich/Hand!')).toBe('ZrichHand');
    expect(sanitizeFamilyName('***')).toBe('My Hand');
    expect(sanitizeFamilyName('')).toBe('My Hand');
  });

  it('builds the file name from the family name', () => {
    expect(fontFileName('Flynn Hand')).toBe('FlynnHand-Regular.otf');
    expect(fontFileName('Flynn Hand', 'woff2')).toBe('FlynnHand-Regular.woff2');
  });
});
