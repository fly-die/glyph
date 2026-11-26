import { parse } from 'opentype.js';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../outline';
import { buildFontFile } from './build';
import { addTables } from './sfnt';

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

function circle(cx: number, cy: number, r: number): Stroke {
  return stroke(
    Array.from({ length: 33 }, (_, step): [number, number] => [
      cx + r * Math.cos((step / 32) * Math.PI * 2),
      cy + r * Math.sin((step / 32) * Math.PI * 2),
    ]),
  );
}

const GLYPHS: Record<string, Stroke[]> = {
  A: [stroke([[30, 160], [80, 20], [130, 160]]), stroke([[55, 110], [105, 110]])],
  V: [stroke([[30, 20], [80, 160], [130, 20]])],
  T: [stroke([[40, 30], [140, 30]]), stroke([[90, 30], [90, 160]])],
  n: [stroke([[40, 160], [40, 80]]), stroke([[40, 100], [70, 80], [100, 100], [100, 160]])],
  o: [circle(80, 120, 38)],
  "'": [stroke([[100, 30], [96, 60]])],
  '.': [stroke([[60, 155], [60, 155]])],
};

const font = parse(buildFontFile(new Map(Object.entries(GLYPHS)), 'Kern Test'));
const kern = (left: string, right: string): number =>
  font.getKerningValue(font.charToGlyph(left), font.charToGlyph(right));

describe('automatic kerning', () => {
  it('pulls diagonal pairs together', () => {
    expect(kern('A', 'V')).toBeLessThan(-40);
    expect(kern('V', 'A')).toBeLessThan(-40);
  });

  it('tucks a round letter under the bar of a T', () => {
    expect(kern('T', 'o')).toBeLessThan(-40);
  });

  it('leaves straight and round neighbours alone', () => {
    expect(Math.abs(kern('n', 'n'))).toBeLessThan(8);
    expect(Math.abs(kern('o', 'o'))).toBeLessThan(8);
  });

  it('does not move glyphs that share no height', () => {
    expect(kern("'", '.')).toBe(0);
  });
});

describe('addTables', () => {
  it('keeps the file checksum valid', () => {
    const file = buildFontFile(new Map(Object.entries(GLYPHS)), 'Kern Test');
    const patched = addTables(file, { TEST: Uint8Array.of(1, 2, 3) });
    const view = new DataView(patched);
    let sum = 0;
    for (let at = 0; at < patched.byteLength; at += 4) sum = (sum + view.getUint32(at)) >>> 0;
    expect(sum).toBe(0xb1b0afba);
    expect(parse(patched).getEnglishName('fontFamily')).toBe('Kern Test');
  });
});
