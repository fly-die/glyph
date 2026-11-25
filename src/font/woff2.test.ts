import { parse } from 'opentype.js';
import { decompress } from 'woff2-encoder';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../outline';
import { buildFont } from './build';
import { toWoff2 } from './woff2';

const line = (x0: number, y0: number, x1: number, y1: number): Stroke =>
  Array.from({ length: 11 }, (_, step) => ({
    x: x0 + ((x1 - x0) * step) / 10,
    y: y0 + ((y1 - y0) * step) / 10,
    pressure: 0.5,
  }));

describe('toWoff2', () => {
  it('writes a smaller file that decompresses to the same font', async () => {
    const strokes = new Map([
      ['l', [line(60, 20, 60, 160)]],
      ['x', [line(40, 80, 120, 160), line(120, 80, 40, 160)]],
      ['.', [[{ x: 60, y: 155, pressure: 0.5 }]]],
    ]);
    const otf = buildFont(strokes, 'Web Hand').toArrayBuffer();
    const woff2 = await toWoff2(otf);

    expect(new TextDecoder().decode(woff2.slice(0, 4))).toBe('wOF2');
    expect(woff2.byteLength).toBeLessThan(otf.byteLength);

    const original = parse(otf);
    const restored = parse((await decompress(woff2)).slice().buffer);
    expect(restored.getEnglishName('fontFamily')).toBe('Web Hand');
    expect(restored.glyphs.length).toBe(original.glyphs.length);
    for (const char of ['l', 'x', '.', ' ']) {
      const before = original.charToGlyph(char);
      const after = restored.charToGlyph(char);
      expect(after.name).toBe(before.name);
      expect(after.advanceWidth).toBe(before.advanceWidth);
      expect(after.path.toPathData(0)).toBe(before.path.toPathData(0));
    }
  });
});
