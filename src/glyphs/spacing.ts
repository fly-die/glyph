import { halfWidth } from '../outline/expand';
import type { Contour, Stroke } from '../outline';
import { PEN_WIDTH, SIDE_BEARING_PER_STEM, UNITS_PER_CELL_PIXEL } from './metrics';

/**
 * The typical stroke width of the whole font in font units: the median ink
 * width over every sample of every glyph. One value for the font, not one per
 * glyph, so a letter you pressed harder on does not get more room than its
 * neighbours. Null when nothing is drawn.
 */
export function stemWidth(strokesByChar: ReadonlyMap<string, readonly Stroke[]>): number | null {
  const widths: number[] = [];
  for (const strokes of strokesByChar.values()) {
    for (const stroke of strokes) {
      for (const point of stroke) widths.push(2 * halfWidth(point.pressure, PEN_WIDTH));
    }
  }
  if (widths.length === 0) return null;
  widths.sort((a, b) => a - b);
  const middle = widths.length / 2;
  const median = Number.isInteger(middle)
    ? ((widths[middle - 1] ?? 0) + (widths[middle] ?? 0)) / 2
    : (widths[Math.floor(middle)] ?? 0);
  return median * UNITS_PER_CELL_PIXEL;
}

/**
 * Typical stroke width of traced glyphs in font units. For a stroke much
 * longer than wide, twice the ink area over the outline length is its width.
 * Median over the glyphs. Null when there are none.
 */
export function tracedStemWidth(tracedByChar: ReadonlyMap<string, readonly Contour[]>): number | null {
  const widths: number[] = [];
  for (const contours of tracedByChar.values()) {
    let area = 0;
    let length = 0;
    for (const contour of contours) {
      let from = contour.start;
      for (const { to } of contour.segments) {
        area += from.x * to.y - to.x * from.y;
        length += Math.hypot(to.x - from.x, to.y - from.y);
        from = to;
      }
    }
    if (length > 0) widths.push((2 * Math.abs(area / 2)) / length);
  }
  if (widths.length === 0) return null;
  widths.sort((a, b) => a - b);
  return (widths[Math.floor(widths.length / 2)] ?? 0) * UNITS_PER_CELL_PIXEL;
}

/**
 * Side bearing in font units, from the stem width. Drawn strokes win over
 * traced glyphs, because pressure gives the more exact width. Falls back to
 * the nominal pen.
 */
export function sideBearing(
  strokesByChar: ReadonlyMap<string, readonly Stroke[]>,
  tracedByChar: ReadonlyMap<string, readonly Contour[]> = new Map(),
): number {
  const stem = stemWidth(strokesByChar) ?? tracedStemWidth(tracedByChar) ?? PEN_WIDTH * UNITS_PER_CELL_PIXEL;
  return Math.round(stem * SIDE_BEARING_PER_STEM);
}
