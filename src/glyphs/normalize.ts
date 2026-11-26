import type { Contour, CubicSegment, Point } from '../outline';
import { CELL, UNITS_PER_CELL_PIXEL } from './metrics';

export interface FontGlyphOutline {
  contours: Contour[];
  advanceWidth: number;
}

function toUnits(point: Point): Point {
  return {
    x: point.x * UNITS_PER_CELL_PIXEL,
    y: (CELL.baseline - point.y) * UNITS_PER_CELL_PIXEL,
  };
}

function mapContour(contour: Contour, map: (point: Point) => Point): Contour {
  return {
    start: map(contour.start),
    segments: contour.segments.map((segment) => ({
      c1: map(segment.c1),
      c2: map(segment.c2),
      to: map(segment.to),
    })),
  };
}

/** Twice the signed area of the on-curve polygon. Positive is counter-clockwise with y up. */
function signedArea(contour: Contour): number {
  let area = 0;
  let from = contour.start;
  for (const segment of contour.segments) {
    area += from.x * segment.to.y - segment.to.x * from.y;
    from = segment.to;
  }
  return area;
}

function reverse(contour: Contour): Contour {
  const froms = [contour.start, ...contour.segments.map((segment) => segment.to)];
  const segments: CubicSegment[] = [];
  for (let index = contour.segments.length - 1; index >= 0; index--) {
    const segment = contour.segments[index];
    const to = froms[index];
    if (!segment || !to) continue;
    segments.push({ c1: segment.c2, c2: segment.c1, to });
  }
  return { start: contour.start, segments };
}

/**
 * How contours are wound in the font. Drawn strokes overlap and must all add
 * up ('union'). Traced outlines carry holes, whose direction must stay
 * opposite to the outline around them ('nested').
 */
export type Winding = 'union' | 'nested';

/**
 * Moves cell-space contours into font units: y up from the baseline, the scale
 * set by the guides, the leftmost ink at `sideBearing` (font units). Outer
 * contours are wound counter-clockwise, the direction CFF outlines expect.
 */
export function toFontUnits(
  contours: readonly Contour[],
  sideBearing: number,
  winding: Winding = 'union',
): FontGlyphOutline | null {
  if (contours.length === 0) return null;
  const scaled = contours.map((contour) => mapContour(contour, toUnits));

  let xMin = Infinity;
  let xMax = -Infinity;
  for (const contour of scaled) {
    for (const point of [contour.start, ...contour.segments.flatMap((s) => [s.c1, s.c2, s.to])]) {
      xMin = Math.min(xMin, point.x);
      xMax = Math.max(xMax, point.x);
    }
  }

  const shift = sideBearing - xMin;
  const place = (point: Point): Point => ({ x: Math.round(point.x + shift), y: Math.round(point.y) });
  const placed = scaled.map((contour) => mapContour(contour, place));
  let oriented: Contour[];
  if (winding === 'union') {
    oriented = placed.map((contour) => (signedArea(contour) < 0 ? reverse(contour) : contour));
  } else {
    // The largest contour is an outer one. Turn all of them together so it runs counter-clockwise.
    const largest = placed.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
    oriented = signedArea(largest) < 0 ? placed.map(reverse) : placed;
  }
  return {
    contours: oriented,
    advanceWidth: Math.round(xMax - xMin) + sideBearing * 2,
  };
}
