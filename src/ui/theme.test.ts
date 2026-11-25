import { describe, expect, it } from 'vitest';
import { blotPolygon, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('follows the system until the visitor has chosen', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('blotPolygon', () => {
  const points = (polygon: string): [number, number][] =>
    [...polygon.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((match) => [Number(match[1]), Number(match[2])]);

  it('starts as a single point and keeps the same number of corners while it grows', () => {
    const start = points(blotPolygon(40, 30, 0));
    expect(start.every(([x, y]) => x === 40 && y === 30)).toBe(true);
    expect(points(blotPolygon(40, 30, 500))).toHaveLength(start.length);
  });

  it('covers everything within the radius, so the spill reaches every corner', () => {
    for (const [x, y] of points(blotPolygon(0, 0, 100))) expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(100);
  });
});
