import type { Point, Polygon } from './types';

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Ramer-Douglas-Peucker on an open run of points. Keeps both ends. */
function simplifyOpen(points: Polygon, tolerance: number): Polygon {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 3) return points;

  let worst = 0;
  let worstIndex = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    if (!point) continue;
    const distance = distanceToSegment(point, first, last);
    if (distance > worst) {
      worst = distance;
      worstIndex = index;
    }
  }
  if (worst <= tolerance) return [first, last];

  const head = simplifyOpen(points.slice(0, worstIndex + 1), tolerance);
  const tail = simplifyOpen(points.slice(worstIndex), tolerance);
  return [...head.slice(0, -1), ...tail];
}

/**
 * Simplifies a closed polygon. The ring is cut at its first point and at the
 * point farthest from it, and each half is simplified on its own.
 */
export function simplifyClosed(polygon: Polygon, tolerance: number): Polygon {
  const first = polygon[0];
  if (!first || polygon.length < 4) return polygon;

  let farIndex = 0;
  let farDistance = 0;
  polygon.forEach((point, index) => {
    const distance = Math.hypot(point.x - first.x, point.y - first.y);
    if (distance > farDistance) {
      farDistance = distance;
      farIndex = index;
    }
  });
  if (farIndex === 0) return polygon;

  const head = simplifyOpen(polygon.slice(0, farIndex + 1), tolerance);
  const tail = simplifyOpen([...polygon.slice(farIndex), first], tolerance);
  return [...head.slice(0, -1), ...tail.slice(0, -1)];
}
