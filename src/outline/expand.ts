import type { Polygon, Stroke, StrokePoint } from './types';

const CAP_STEPS = 8;
const MIN_SPACING = 0.75;

/** Half the stroke width at a given pressure. Pressure 0.5 gives the nominal pen width. */
export function halfWidth(pressure: number, penWidth: number): number {
  const clamped = Math.min(1, Math.max(0, pressure));
  return (penWidth / 2) * (0.5 + clamped);
}

/** Drops samples that sit closer than `spacing` to the previous kept one. */
function thin(stroke: Stroke, spacing: number): Stroke {
  const kept: Stroke = [];
  for (const point of stroke) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= spacing) {
      kept.push(point);
    }
  }
  return kept;
}

/** One pass of a 1-2-1 filter over the inner samples. Takes the jitter out of mouse input. */
function smooth(stroke: Stroke): Stroke {
  return stroke.map((point, index) => {
    const prev = stroke[index - 1];
    const next = stroke[index + 1];
    if (!prev || !next) return point;
    return {
      x: (prev.x + 2 * point.x + next.x) / 4,
      y: (prev.y + 2 * point.y + next.y) / 4,
      pressure: (prev.pressure + 2 * point.pressure + next.pressure) / 4,
    };
  });
}

function arc(center: StrokePoint, radius: number, fromAngle: number, sweep: number, steps: number): Polygon {
  const points: Polygon = [];
  for (let step = 1; step < steps; step++) {
    const angle = fromAngle + (sweep * step) / steps;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

/**
 * Turns a pointer stroke into the polygon of its inked area.
 *
 * Both sides of the centre line are offset by the pressure-dependent half
 * width and joined with round caps. Where the stroke turns sharply or crosses
 * itself the polygon overlaps itself with the same winding, so a non-zero
 * fill (canvas default, CFF fonts) paints exactly the inked area.
 */
export function expandStroke(stroke: Stroke, penWidth: number): Polygon {
  const points = smooth(thin(stroke, MIN_SPACING));
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return [];

  if (points.length === 1) {
    const radius = halfWidth(first.pressure, penWidth);
    return [{ x: first.x + radius, y: first.y }, ...arc(first, radius, 0, Math.PI * 2, CAP_STEPS * 2)];
  }

  const left: Polygon = [];
  const right: Polygon = [];
  const normals: number[] = [];
  points.forEach((point, index) => {
    const prev = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    const normalAngle = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2;
    const radius = halfWidth(point.pressure, penWidth);
    const dx = Math.cos(normalAngle) * radius;
    const dy = Math.sin(normalAngle) * radius;
    left.push({ x: point.x + dx, y: point.y + dy });
    right.push({ x: point.x - dx, y: point.y - dy });
    normals.push(normalAngle);
  });

  const endAngle = normals[normals.length - 1] ?? 0;
  const startAngle = normals[0] ?? 0;
  return [
    ...left,
    ...arc(last, halfWidth(last.pressure, penWidth), endAngle, -Math.PI, CAP_STEPS),
    ...right.reverse(),
    ...arc(first, halfWidth(first.pressure, penWidth), startAngle + Math.PI, -Math.PI, CAP_STEPS),
  ];
}
