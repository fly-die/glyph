import { halfWidth } from '../outline/expand';
import type { Stroke } from '../outline';
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

/** Side bearing in font units, from the stem width. Falls back to the nominal pen. */
export function sideBearing(strokesByChar: ReadonlyMap<string, readonly Stroke[]>): number {
  const stem = stemWidth(strokesByChar) ?? PEN_WIDTH * UNITS_PER_CELL_PIXEL;
  return Math.round(stem * SIDE_BEARING_PER_STEM);
}
