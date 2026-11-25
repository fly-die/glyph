import { parse } from 'opentype.js';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../outline';
import { buildFont, fontFileName, sanitizeFamilyName } from './build';

function stroke(points: [number, number][]): Stroke {
  return points.flatMap(([x, y], index) => {
    const next = points[index + 1];
    if (!next) return [{ x, y, pressure: 0.5 }];
    return Array.from({ length: 10 }, (_, step) => ({
      x: x + ((next[0] - x) * step) / 10,
      y: y + ((next[1] - y) * step) / 10,
      pressure: 0.5,
    }));
  });
}

const N = [stroke([[40, 160], [40, 80]]), stroke([[40, 100], [70, 80], [100, 100], [100, 160]])];
const A = [stroke([[30, 160], [80, 20], [130, 160]]), stroke([[55, 110], [105, 110]])];
const SEVEN = [stroke([[40, 30], [120, 30], [70, 160]])];

function roundTrip(strokes: Record<string, Stroke[]>, family = 'Test Hand') {
  const font = buildFont(new Map(Object.entries(strokes)), family);
  return parse(font.toArrayBuffer());
}

describe('buildFont', () => {
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

  it('carries the family name into the name table', () => {
    const font = roundTrip({ A }, 'Flynn Script');
    expect(font.getEnglishName('fontFamily')).toBe('Flynn Script');
    expect(font.getEnglishName('fullName')).toBe('Flynn Script Regular');
    expect(font.getEnglishName('postScriptName')).toBe('FlynnScript-Regular');
  });

  it('makes the space as wide as the n', () => {
    const font = roundTrip({ n: N, A });
    expect(font.charToGlyph(' ').advanceWidth).toBe(font.charToGlyph('n').advanceWidth);
    expect(font.charToGlyph(' ').path.commands).toHaveLength(0);
  });

  it('falls back to a fixed space when there is no n', () => {
    expect(roundTrip({ A }).charToGlyph(' ').advanceWidth).toBe(320);
  });

  it('places outlines on the baseline with side bearings around the ink', () => {
    const glyph = roundTrip({ n: N }).charToGlyph('n');
    const box = glyph.getBoundingBox();
    expect(box.x1).toBeCloseTo(50, -1);
    expect(glyph.advanceWidth).toBeCloseTo(box.x2 + 50, -1);
    // Drawn between the guides: from just under the baseline to just over the x-height.
    expect(box.y1).toBeLessThan(0);
    expect(box.y1).toBeGreaterThan(-60);
    expect(box.y2).toBeGreaterThan(500);
    expect(box.y2).toBeLessThan(560);
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
  });
});
