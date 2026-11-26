import type { Point } from '../outline';

/** A 3 x 3 projective transform, row by row, with the last entry fixed at 1. */
export type Homography = [number, number, number, number, number, number, number, number, number];

/** The perspective transform that maps each `from` point onto the matching `to` point. Four pairs. */
export function solveHomography(from: readonly Point[], to: readonly Point[]): Homography {
  if (from.length !== 4 || to.length !== 4) throw new Error('A homography needs four point pairs');
  const rows: number[][] = [];
  for (let index = 0; index < 4; index++) {
    const { x, y } = from[index] as Point;
    const { x: u, y: v } = to[index] as Point;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8 x 9 system.
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) {
      if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot] as number[], rows[column] as number[]];
    const lead = rows[column] as number[];
    if (Math.abs(lead[column] ?? 0) < 1e-12) throw new Error('The four points are degenerate');
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const current = rows[row] as number[];
      const factor = (current[column] ?? 0) / (lead[column] ?? 1);
      for (let k = column; k < 9; k++) current[k] = (current[k] ?? 0) - factor * (lead[k] ?? 0);
    }
  }
  const h = rows.map((row, index) => (row[8] ?? 0) / (row[index] ?? 1));
  return [h[0] ?? 0, h[1] ?? 0, h[2] ?? 0, h[3] ?? 0, h[4] ?? 0, h[5] ?? 0, h[6] ?? 0, h[7] ?? 0, 1];
}

export function project(h: Homography, point: Point): Point {
  const w = h[6] * point.x + h[7] * point.y + h[8];
  return { x: (h[0] * point.x + h[1] * point.y + h[2]) / w, y: (h[3] * point.x + h[4] * point.y + h[5]) / w };
}
