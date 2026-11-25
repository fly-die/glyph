import type { Contour, CubicSegment, Point, Polygon } from './types';

const CORNER_ANGLE = (55 * Math.PI) / 180;

/** Angle between the incoming and the outgoing direction at `at`. 0 means straight on. */
function turnAngle(before: Point, at: Point, after: Point): number {
  const inAngle = Math.atan2(at.y - before.y, at.x - before.x);
  const outAngle = Math.atan2(after.y - at.y, after.x - at.x);
  const delta = Math.abs(outAngle - inAngle) % (Math.PI * 2);
  return delta > Math.PI ? Math.PI * 2 - delta : delta;
}

/**
 * Handle that leaves `at` towards `target`, along the tangent through the two
 * neighbours of `at` (Catmull-Rom). Its length is capped at a third of the
 * segment so unevenly spaced points cannot make the curve overshoot.
 */
function handle(at: Point, before: Point, after: Point, target: Point, direction: 1 | -1): Point {
  if (turnAngle(before, at, after) > CORNER_ANGLE) return at;
  const tx = after.x - before.x;
  const ty = after.y - before.y;
  const tangentLength = Math.hypot(tx, ty);
  if (tangentLength === 0) return at;
  const length = Math.min(tangentLength / 6, Math.hypot(target.x - at.x, target.y - at.y) / 3);
  return {
    x: at.x + (direction * tx * length) / tangentLength,
    y: at.y + (direction * ty * length) / tangentLength,
  };
}

/**
 * Fits a closed chain of cubic beziers through every point of the polygon.
 * Smooth runs get tangent-continuous joins, sharp turns stay corners.
 */
export function fitClosedCubics(polygon: Polygon): Contour | null {
  const count = polygon.length;
  const start = polygon[0];
  if (!start || count < 3) return null;

  const at = (index: number): Point => polygon[((index % count) + count) % count] ?? start;
  const segments: CubicSegment[] = [];
  for (let index = 0; index < count; index++) {
    const from = at(index);
    const to = at(index + 1);
    segments.push({
      c1: handle(from, at(index - 1), to, to, 1),
      c2: handle(to, from, at(index + 2), from, -1),
      to,
    });
  }
  return { start, segments };
}
