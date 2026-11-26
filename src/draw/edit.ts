import type { Contour, Point, Stroke } from '../outline';

/** Where the editable points of a pen stroke sit: indices into its samples. */
export function strokeNodes(stroke: Stroke, tolerance: number): number[] {
  if (stroke.length < 2) return stroke.length === 1 ? [0] : [];
  const keep = new Set([0, stroke.length - 1]);
  const visit = (from: number, to: number): void => {
    const a = stroke[from] as Point;
    const b = stroke[to] as Point;
    let farthest = -1;
    let distance = tolerance;
    for (let index = from + 1; index < to; index++) {
      const p = stroke[index] as Point;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const d = length === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / length;
      if (d > distance) {
        distance = d;
        farthest = index;
      }
    }
    if (farthest < 0) return;
    keep.add(farthest);
    visit(from, farthest);
    visit(farthest, to);
  };
  visit(0, stroke.length - 1);
  return [...keep].sort((a, b) => a - b);
}

/**
 * Moves the sample at `nodes[node]` by `delta`. Samples between it and the
 * neighbouring points follow with less and less of the move, so the line
 * bends instead of kinking.
 */
export function moveStrokeNode(stroke: Stroke, nodes: readonly number[], node: number, delta: Point): Stroke {
  const at = nodes[node] ?? 0;
  const before = nodes[node - 1] ?? at;
  const after = nodes[node + 1] ?? at;
  return stroke.map((point, index) => {
    let weight = 0;
    if (index === at) weight = 1;
    else if (index > before && index < at) weight = (index - before) / (at - before);
    else if (index > at && index < after) weight = (after - index) / (after - at);
    return weight === 0 ? point : { ...point, x: point.x + delta.x * weight, y: point.y + delta.y * weight };
  });
}

/** Evens out the samples within `radius` of `center`, a little each call, like a soft brush. */
export function smoothStroke(stroke: Stroke, center: Point, radius: number): Stroke {
  return stroke.map((point, index) => {
    const prev = stroke[index - 1];
    const next = stroke[index + 1];
    if (!prev || !next) return point;
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (distance > radius) return point;
    const strength = 0.5 * (1 - distance / radius);
    return {
      ...point,
      x: point.x + ((prev.x + next.x) / 2 - point.x) * strength,
      y: point.y + ((prev.y + next.y) / 2 - point.y) * strength,
    };
  });
}

/** Moves one on-curve point of an outline, the handles on either side going along. 0 is the start. */
export function moveContourNode(contour: Contour, node: number, delta: Point): Contour {
  const shift = (point: Point): Point => ({ x: point.x + delta.x, y: point.y + delta.y });
  const segments = contour.segments.map((segment) => ({ ...segment }));
  const count = segments.length;
  // Point `node` ends segment node - 1 (the start ends the last segment) and begins segment node.
  const incoming = node === 0 ? count - 1 : node - 1;
  const outgoing = node % count;
  const into = segments[incoming];
  const out = segments[outgoing];
  if (into) {
    into.to = shift(into.to);
    into.c2 = shift(into.c2);
  }
  if (out) out.c1 = shift(out.c1);
  const start = node === 0 || node === count ? shift(contour.start) : contour.start;
  return { start, segments };
}

/** On-curve points of an outline, the start first. The last segment ends on the start again and is not repeated. */
export function contourNodes(contour: Contour): Point[] {
  return [contour.start, ...contour.segments.slice(0, -1).map((segment) => segment.to)];
}
