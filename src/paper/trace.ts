import type { Point, Polygon } from '../outline';

export interface Field {
  width: number;
  height: number;
  /** Ink strength per pixel, 0 for paper up to 1 for full ink. */
  data: Float32Array;
}

function at(field: Field, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return 0;
  return field.data[y * field.width + x] ?? 0;
}

type Edge = 'T' | 'R' | 'B' | 'L';

/** Which edges each corner pattern connects. Corners: top left 8, top right 4, bottom right 2, bottom left 1. */
const CASES: Record<number, [Edge, Edge][]> = {
  1: [['L', 'B']],
  2: [['B', 'R']],
  3: [['L', 'R']],
  4: [['T', 'R']],
  6: [['T', 'B']],
  7: [['L', 'T']],
  8: [['L', 'T']],
  9: [['T', 'B']],
  11: [['T', 'R']],
  12: [['L', 'R']],
  13: [['B', 'R']],
  14: [['L', 'B']],
};

/**
 * Outlines of the areas where `field` reaches `level`, as closed polygons in
 * pixel coordinates. Marching squares with interpolated edge crossings, so
 * the outlines follow the soft edge of the ink instead of the pixel grid. The
 * field is treated as zero outside, so every outline closes.
 */
export function traceField(field: Field, level: number): Polygon[] {
  const points: Point[] = [];
  const pointIds = new Map<string, number>();
  const neighbours = new Map<number, number[]>();

  const edgePoint = (x: number, y: number, edge: Edge): number => {
    const key =
      edge === 'T' ? `h${x},${y}` : edge === 'B' ? `h${x},${y + 1}` : edge === 'L' ? `v${x},${y}` : `v${x + 1},${y}`;
    const known = pointIds.get(key);
    if (known !== undefined) return known;
    const [ax, ay, bx, by] =
      edge === 'T'
        ? [x, y, x + 1, y]
        : edge === 'B'
          ? [x, y + 1, x + 1, y + 1]
          : edge === 'L'
            ? [x, y, x, y + 1]
            : [x + 1, y, x + 1, y + 1];
    const a = at(field, ax, ay);
    const b = at(field, bx, by);
    const t = b === a ? 0.5 : Math.min(1, Math.max(0, (level - a) / (b - a)));
    const id = points.length;
    points.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
    pointIds.set(key, id);
    return id;
  };
  const link = (a: number, b: number): void => {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  };

  for (let y = -1; y < field.height; y++) {
    for (let x = -1; x < field.width; x++) {
      const tl = at(field, x, y) >= level ? 8 : 0;
      const tr = at(field, x + 1, y) >= level ? 4 : 0;
      const br = at(field, x + 1, y + 1) >= level ? 2 : 0;
      const bl = at(field, x, y + 1) >= level ? 1 : 0;
      const pattern = tl | tr | br | bl;
      let segments = CASES[pattern];
      if (pattern === 5 || pattern === 10) {
        // Two opposite corners: the middle decides whether they join.
        const middle = (at(field, x, y) + at(field, x + 1, y) + at(field, x + 1, y + 1) + at(field, x, y + 1)) / 4;
        const joined = middle >= level;
        segments =
          (pattern === 5) === joined
            ? [
                ['L', 'T'],
                ['B', 'R'],
              ]
            : [
                ['T', 'R'],
                ['L', 'B'],
              ];
      }
      for (const [from, to] of segments ?? []) link(edgePoint(x, y, from), edgePoint(x, y, to));
    }
  }

  const used = new Set<number>();
  const loops: Polygon[] = [];
  for (const start of neighbours.keys()) {
    if (used.has(start)) continue;
    const loop: Point[] = [];
    let previous = -1;
    let current = start;
    while (!used.has(current)) {
      used.add(current);
      loop.push(points[current] as Point);
      const next = (neighbours.get(current) ?? []).find((candidate) => candidate !== previous && !used.has(candidate));
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function polygonArea(polygon: Polygon): number {
  let area = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length] as Point;
    area += point.x * next.y - next.x * point.y;
  });
  return area / 2;
}

function contains(polygon: Polygon, point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index] as Point;
    const b = polygon[previous] as Point;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Winds every outline by how deep it sits: outer outlines one way, the holes
 * inside them the other way, islands inside holes the first way again. That is
 * what a font needs to keep the counter of an o open.
 */
export function orientByNesting(polygons: readonly Polygon[]): Polygon[] {
  return polygons.map((polygon, index) => {
    const probe = polygon[0] as Point;
    const depth = polygons.filter((other, otherIndex) => otherIndex !== index && contains(other, probe)).length;
    const outer = depth % 2 === 0;
    return polygonArea(polygon) > 0 === outer ? polygon : [...polygon].reverse();
  });
}
