import type { Point } from '../outline';
import { boxMean, type GrayImage } from './image';

export interface Blob {
  area: number;
  center: Point;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Marker extends Blob {
  ring: boolean;
}

/** A pixel is dark when it is this much darker than its neighbourhood. Shadows and uneven light change both alike. */
const DARK_RATIO = 0.6;

/** Pixels clearly darker than their surroundings: the markers, the writing, little else. */
export function darkMask(image: GrayImage): Uint8Array {
  const radius = Math.max(8, Math.round(Math.max(image.width, image.height) / 16));
  const mean = boxMean(image, radius);
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index++) {
    mask[index] = (image.data[index] ?? 1) < (mean.data[index] ?? 0) * DARK_RATIO ? 1 : 0;
  }
  return mask;
}

/** Connected groups of dark pixels, four neighbours each. */
export function blobs(mask: Uint8Array, width: number, height: number, minArea: number): Blob[] {
  const seen = new Uint8Array(mask.length);
  const found: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = (index - x) / width;
      area++;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width];
      for (const next of neighbours) {
        if (next < 0 || next >= mask.length || !mask[next] || seen[next]) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (area >= minArea) found.push({ area, center: { x: sumX / area, y: sumY / area }, minX, minY, maxX, maxY });
  }
  return found;
}

function quadArea(points: readonly Point[]): number {
  let area = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] as Point;
    area += point.x * next.y - next.x * point.y;
  });
  return Math.abs(area) / 2;
}

/**
 * Finds the four corner markers of the sheet: three solid squares and one
 * ring, which marks the top left. Returns their centres clockwise from the top
 * left, as seen on the page, or null when the sheet is not fully in the photo.
 */
export function findMarkers(image: GrayImage): Point[] | null {
  const mask = darkMask(image);
  const minSide = Math.max(image.width, image.height) / 120;
  const candidates: Marker[] = [];
  for (const blob of blobs(mask, image.width, image.height, minSide * minSide)) {
    const width = blob.maxX - blob.minX + 1;
    const height = blob.maxY - blob.minY + 1;
    const aspect = width / height;
    const fill = blob.area / (width * height);
    if (aspect < 0.6 || aspect > 1.6 || fill < 0.5) continue;
    const middle = mask[Math.round(blob.center.y) * image.width + Math.round(blob.center.x)];
    if (middle && fill > 0.8) candidates.push({ ...blob, ring: false });
    else if (!middle && fill < 0.9) candidates.push({ ...blob, ring: true });
  }

  const rings = candidates.filter((marker) => marker.ring).sort((a, b) => b.area - a.area);
  let best: { points: Point[]; area: number } | null = null;
  for (const ring of rings.slice(0, 3)) {
    // Markers are printed the same size, so a perspective photo keeps them within a factor of a few.
    const solids = candidates
      .filter((marker) => !marker.ring && marker.area > ring.area * 0.3 && marker.area < ring.area * 4)
      .sort((a, b) => b.area - a.area)
      .slice(0, 8);
    for (let a = 0; a < solids.length; a++) {
      for (let b = a + 1; b < solids.length; b++) {
        for (let c = b + 1; c < solids.length; c++) {
          const others = [solids[a], solids[b], solids[c]].map((marker) => (marker as Marker).center);
          const ordered = clockwiseFrom(ring.center, others);
          const area = quadArea(ordered);
          if (!best || area > best.area) best = { points: ordered, area };
        }
      }
    }
  }
  return best?.points ?? null;
}

/** Orders the corners clockwise on screen, starting at `first`. */
function clockwiseFrom(first: Point, others: readonly Point[]): Point[] {
  const all = [first, ...others];
  const center = {
    x: all.reduce((sum, point) => sum + point.x, 0) / all.length,
    y: all.reduce((sum, point) => sum + point.y, 0) / all.length,
  };
  const angle = (point: Point): number => Math.atan2(point.y - center.y, point.x - center.x);
  const start = angle(first);
  const turn = (point: Point): number => (angle(point) - start + Math.PI * 4) % (Math.PI * 2);
  return [first, ...[...others].sort((a, b) => turn(a) - turn(b))];
}
