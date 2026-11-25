import { fitClosedCubics } from './bezier';
import { expandStroke } from './expand';
import { simplifyClosed } from './simplify';
import type { Contour, Stroke } from './types';

export type { Contour, CubicSegment, Point, Polygon, Stroke, StrokePoint } from './types';

/** Largest distance, in cell pixels, the simplified outline may stray from the raw one. */
const TOLERANCE = 0.3;

/** Stroke expansion, simplification and curve fitting for one stroke. */
export function strokeToContour(stroke: Stroke, penWidth: number): Contour | null {
  return fitClosedCubics(simplifyClosed(expandStroke(stroke, penWidth), TOLERANCE));
}

export function strokesToContours(strokes: readonly Stroke[], penWidth: number): Contour[] {
  return strokes.flatMap((stroke) => strokeToContour(stroke, penWidth) ?? []);
}
