import type { Contour, Point } from '../outline';

/** A glyph as it sits in the font: outlines in font units and its advance width. */
export interface PlacedGlyph {
  name: string;
  advanceWidth: number;
  contours: readonly Contour[];
}

export interface KernPair {
  left: string;
  right: string;
  /** Change of the left glyph's advance in font units. Negative pulls the pair together. */
  value: number;
}

export interface KerningOptions {
  /** White space wanted between two glyphs at their closest point, in font units. */
  target: number;
  bottom: number;
  top: number;
}

/** Distance between two scanlines, in font units. */
const SCAN_STEP = 20;
/** Ink within this vertical distance counts as being on the scanline, so diagonals cannot slip past each other. */
const BAND = 60;
/** Share of the extra space that is taken out. Closing it fully looks too tight. */
const TIGHTEN = 0.7;
/** Pairs that would move less than this are left alone. */
const MIN_KERN = 8;
/** A pair never moves by more than this share of the narrower glyph. */
const MAX_SHARE = 0.35;
const CURVE_STEPS = 8;

interface Profile {
  /** Leftmost ink per scanline, or NaN where the glyph has none. */
  left: Float64Array;
  /** Rightmost ink per scanline, or NaN where the glyph has none. */
  right: Float64Array;
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** The outline as straight edges, close enough to the curves for spacing. */
function flatten(contours: readonly Contour[]): [Point, Point][] {
  const edges: [Point, Point][] = [];
  for (const contour of contours) {
    let from = contour.start;
    for (const { c1, c2, to } of contour.segments) {
      let previous = from;
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const next = cubicPoint(from, c1, c2, to, step / CURVE_STEPS);
        edges.push([previous, next]);
        previous = next;
      }
      from = to;
    }
  }
  return edges;
}

function scanlines(options: KerningOptions): number[] {
  const lines: number[] = [];
  for (let y = options.bottom + SCAN_STEP / 2; y < options.top; y += SCAN_STEP) lines.push(y);
  return lines;
}

function profile(glyph: PlacedGlyph, lines: readonly number[]): Profile {
  const raw = { left: new Float64Array(lines.length).fill(NaN), right: new Float64Array(lines.length).fill(NaN) };
  const edges = flatten(glyph.contours);
  lines.forEach((y, index) => {
    for (const [a, b] of edges) {
      if ((a.y <= y) === (b.y <= y)) continue;
      const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
      const left = raw.left[index] ?? NaN;
      const right = raw.right[index] ?? NaN;
      raw.left[index] = Number.isNaN(left) ? x : Math.min(left, x);
      raw.right[index] = Number.isNaN(right) ? x : Math.max(right, x);
    }
  });

  // Spread the ink over the band above and below each scanline.
  const reach = Math.round(BAND / SCAN_STEP);
  const left = new Float64Array(lines.length).fill(NaN);
  const right = new Float64Array(lines.length).fill(NaN);
  for (let index = 0; index < lines.length; index++) {
    for (let other = Math.max(0, index - reach); other <= Math.min(lines.length - 1, index + reach); other++) {
      const l = raw.left[other] ?? NaN;
      const r = raw.right[other] ?? NaN;
      if (!Number.isNaN(l)) left[index] = Number.isNaN(left[index] ?? NaN) ? l : Math.min(left[index] ?? l, l);
      if (!Number.isNaN(r)) right[index] = Number.isNaN(right[index] ?? NaN) ? r : Math.max(right[index] ?? r, r);
    }
  }
  return { left, right };
}

/** White space between the two glyphs at their closest point, or null when they share no height. */
function closestGap(left: PlacedGlyph, leftProfile: Profile, rightProfile: Profile): number | null {
  let gap = Infinity;
  for (let index = 0; index < leftProfile.right.length; index++) {
    const inkRight = leftProfile.right[index] ?? NaN;
    const inkLeft = rightProfile.left[index] ?? NaN;
    if (Number.isNaN(inkRight) || Number.isNaN(inkLeft)) continue;
    gap = Math.min(gap, left.advanceWidth - inkRight + inkLeft);
  }
  return Number.isFinite(gap) ? gap : null;
}

/**
 * Kerning for every pair of glyphs, from their outlines. The two glyphs are
 * moved so that the white space at their closest point comes near `target`:
 * an A next to a V moves in, an o tucks under the bar of a T. Glyphs that do
 * not share any height, like a quote and a period, are left alone.
 */
export function computeKerning(glyphs: readonly PlacedGlyph[], options: KerningOptions): KernPair[] {
  const lines = scanlines(options);
  const profiles = glyphs.map((glyph) => profile(glyph, lines));
  const pairs: KernPair[] = [];
  glyphs.forEach((left, leftIndex) => {
    glyphs.forEach((right, rightIndex) => {
      const leftProfile = profiles[leftIndex];
      const rightProfile = profiles[rightIndex];
      if (!leftProfile || !rightProfile) return;
      const gap = closestGap(left, leftProfile, rightProfile);
      if (gap === null) return;
      const extra = options.target - gap;
      // Too much room: close part of it. Too little: open all of it.
      const raw = extra < 0 ? extra * TIGHTEN : extra;
      const limit = MAX_SHARE * Math.min(left.advanceWidth, right.advanceWidth);
      const value = Math.round(Math.max(-limit, Math.min(limit, raw)));
      if (Math.abs(value) >= MIN_KERN) pairs.push({ left: left.name, right: right.name, value });
    });
  });
  return pairs;
}
