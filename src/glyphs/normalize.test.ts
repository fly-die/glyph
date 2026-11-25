import { describe, expect, it } from 'vitest';
import { strokesToContours, type Contour, type Stroke } from '../outline';
import { CELL, PEN_WIDTH, SIDE_BEARING } from './metrics';
import { toFontUnits } from './normalize';

function vertical(x: number, fromY: number, toY: number): Stroke {
  return Array.from({ length: 21 }, (_, index) => ({
    x,
    y: fromY + ((toY - fromY) * index) / 20,
    pressure: 0.5,
  }));
}

function yRange(contours: Contour[]): { yMin: number; yMax: number; xMin: number; xMax: number } {
  const points = contours.flatMap((contour) => [contour.start, ...contour.segments.map((s) => s.to)]);
  return {
    yMin: Math.min(...points.map((p) => p.y)),
    yMax: Math.max(...points.map((p) => p.y)),
    xMin: Math.min(...points.map((p) => p.x)),
    xMax: Math.max(...points.map((p) => p.x)),
  };
}

function signedArea(contour: Contour): number {
  let area = 0;
  let from = contour.start;
  for (const segment of contour.segments) {
    area += from.x * segment.to.y - segment.to.x * from.y;
    from = segment.to;
  }
  return area;
}

describe('toFontUnits', () => {
  it('puts the baseline guide at 0 and the x-height guide at 500 units', () => {
    // The pen centre runs from guide to guide, so the ink overshoots by half a pen width.
    const stem = strokesToContours([vertical(100, CELL.xHeight, CELL.baseline)], PEN_WIDTH);
    const glyph = toFontUnits(stem);
    expect(glyph).not.toBeNull();
    if (!glyph) return;
    const overshoot = (PEN_WIDTH / 2) * 6.25;
    const range = yRange(glyph.contours);
    expect(range.yMin).toBeCloseTo(-overshoot, -1);
    expect(range.yMax).toBeCloseTo(500 + overshoot, -1);
  });

  it('keeps relative sizes: a stroke twice as tall stays twice as tall', () => {
    const short = toFontUnits(strokesToContours([vertical(60, 120, 160)], PEN_WIDTH));
    const tall = toFontUnits(strokesToContours([vertical(60, 80, 160)], PEN_WIDTH));
    if (!short || !tall) throw new Error('expected outlines');
    const shortHeight = yRange(short.contours).yMax - yRange(short.contours).yMin;
    const tallHeight = yRange(tall.contours).yMax - yRange(tall.contours).yMin;
    expect(tallHeight - shortHeight).toBeCloseTo(40 * 6.25, -1);
  });

  it('starts the ink at the side bearing wherever it was drawn in the cell', () => {
    const left = toFontUnits(strokesToContours([vertical(30, 80, 160)], PEN_WIDTH));
    const right = toFontUnits(strokesToContours([vertical(170, 80, 160)], PEN_WIDTH));
    if (!left || !right) throw new Error('expected outlines');
    expect(yRange(left.contours).xMin).toBe(SIDE_BEARING);
    expect(yRange(right.contours).xMin).toBe(SIDE_BEARING);
    expect(left.advanceWidth).toBe(right.advanceWidth);
    // Ink width is one pen width, 75 units, plus a bearing on each side.
    expect(Math.abs(left.advanceWidth - (75 + SIDE_BEARING * 2))).toBeLessThanOrEqual(2);
  });

  it('winds every contour counter-clockwise and uses whole units', () => {
    const glyph = toFontUnits(
      strokesToContours([vertical(50, 80, 160), vertical(90, 160, 80)], PEN_WIDTH),
    );
    if (!glyph) throw new Error('expected outline');
    expect(glyph.contours).toHaveLength(2);
    for (const contour of glyph.contours) {
      expect(signedArea(contour)).toBeGreaterThan(0);
      expect(Number.isInteger(contour.start.x) && Number.isInteger(contour.start.y)).toBe(true);
    }
  });

  it('returns nothing for a glyph without strokes', () => {
    expect(toFontUnits([])).toBeNull();
  });
});
