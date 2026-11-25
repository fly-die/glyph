export interface Point {
  x: number;
  y: number;
}

/** One sample of a pointer stroke. Pressure runs from 0 to 1. */
export interface StrokePoint extends Point {
  pressure: number;
}

export type Stroke = StrokePoint[];

export type Polygon = Point[];

export interface CubicSegment {
  c1: Point;
  c2: Point;
  to: Point;
}

/** A closed outline: the last segment ends on `start`. */
export interface Contour {
  start: Point;
  segments: CubicSegment[];
}
