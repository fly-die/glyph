import type { Contour, CubicSegment, Point } from '../outline';
import { CELL, SIDE_BEARING, UNITS_PER_CELL_PIXEL } from './metrics';

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
 * Moves cell-space contours into font units: y up from the baseline, the scale
 * set by the guides, the leftmost ink at the left side bearing. Contours are
 * wound counter-clockwise, the direction CFF outlines expect.
 */
export function toFontUnits(contours: readonly Contour[]): FontGlyphOutline | null {
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

  const shift = SIDE_BEARING - xMin;
  const place = (point: Point): Point => ({ x: Math.round(point.x + shift), y: Math.round(point.y) });
  return {
    contours: scaled.map((contour) => {
      const placed = mapContour(contour, place);
      return signedArea(placed) < 0 ? reverse(placed) : placed;
    }),
    advanceWidth: Math.round(xMax - xMin) + SIDE_BEARING * 2,
  };
}
