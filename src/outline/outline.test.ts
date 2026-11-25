import { describe, expect, it } from 'vitest';
import { fitClosedCubics } from './bezier';
import { expandStroke } from './expand';
import { strokeToContour } from './index';
import { simplifyClosed } from './simplify';
import type { Contour, Point, Polygon, Stroke } from './types';

const PEN = 12;

function line(from: Point, to: Point, pressure = 0.5, steps = 20): Stroke {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: from.x + ((to.x - from.x) * index) / steps,
    y: from.y + ((to.y - from.y) * index) / steps,
    pressure,
  }));
}

function bounds(points: Polygon): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

function area(points: Polygon): number {
  let sum = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    sum += point.x * next.y - next.x * point.y;
  });
  return Math.abs(sum) / 2;
}

function onCurve(contour: Contour): Polygon {
  return [contour.start, ...contour.segments.map((segment) => segment.to)];
}

describe('expandStroke', () => {
  it('turns a straight stroke into a band of the pen width with round caps', () => {
    const outline = expandStroke(line({ x: 20, y: 50 }, { x: 120, y: 50 }), PEN);
    const box = bounds(outline);
    expect(box.yMin).toBeCloseTo(44, 1);
    expect(box.yMax).toBeCloseTo(56, 1);
    // Caps reach half a pen width past both ends.
    expect(box.xMin).toBeGreaterThan(13.9);
    expect(box.xMin).toBeLessThan(15);
    expect(box.xMax).toBeGreaterThan(125);
    expect(box.xMax).toBeLessThan(126.1);
    // Band plus two half discs.
    expect(area(outline)).toBeCloseTo(100 * 12 + Math.PI * 36, -1);
  });

  it('makes the stroke wider under more pressure', () => {
    const light = bounds(expandStroke(line({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.1), PEN));
    const heavy = bounds(expandStroke(line({ x: 0, y: 0 }, { x: 100, y: 0 }, 1), PEN));
    expect(light.yMax - light.yMin).toBeCloseTo(7.2, 1);
    expect(heavy.yMax - heavy.yMin).toBeCloseTo(18, 1);
  });

  it('turns a tap into a dot', () => {
    const dot = expandStroke([{ x: 30, y: 40, pressure: 0.5 }], PEN);
    expect(dot.length).toBeGreaterThanOrEqual(8);
    for (const point of dot) {
      expect(Math.hypot(point.x - 30, point.y - 40)).toBeCloseTo(6, 5);
    }
  });

  it('returns nothing for an empty stroke', () => {
    expect(expandStroke([], PEN)).toEqual([]);
  });
});

describe('simplifyClosed', () => {
  it('reduces a densely sampled rectangle to its four corners', () => {
    const dense: Polygon = [
      ...line({ x: 0, y: 0 }, { x: 100, y: 0 }).slice(0, -1),
      ...line({ x: 100, y: 0 }, { x: 100, y: 40 }).slice(0, -1),
      ...line({ x: 100, y: 40 }, { x: 0, y: 40 }).slice(0, -1),
      ...line({ x: 0, y: 40 }, { x: 0, y: 0 }).slice(0, -1),
    ];
    const simple = simplifyClosed(dense, 0.1);
    expect(simple).toHaveLength(4);
    expect(area(simple)).toBeCloseTo(4000, 5);
  });

  it('keeps every point that strays further than the tolerance', () => {
    const polygon: Polygon = [
      { x: 0, y: 0 },
      { x: 50, y: 2 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    expect(simplifyClosed(polygon, 1)).toContainEqual({ x: 50, y: 2 });
    expect(simplifyClosed(polygon, 3)).not.toContainEqual({ x: 50, y: 2 });
  });
});

describe('fitClosedCubics', () => {
  it('passes through every point and closes on the start', () => {
    const square: Polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const contour = fitClosedCubics(square);
    expect(contour).not.toBeNull();
    if (!contour) return;
    expect(contour.segments.map((segment) => segment.to)).toEqual([...square.slice(1), square[0]]);
    // Right angles are corners: the handles collapse onto the points.
    for (const [index, segment] of contour.segments.entries()) {
      expect(segment.c1).toEqual(square[index]);
      expect(segment.c2).toEqual(segment.to);
    }
  });

  it('gives smooth runs handles along the tangent', () => {
    const octagon: Polygon = Array.from({ length: 8 }, (_, index) => ({
      x: Math.cos((index * Math.PI) / 4) * 10,
      y: Math.sin((index * Math.PI) / 4) * 10,
    }));
    const contour = fitClosedCubics(octagon);
    const first = contour?.segments[0];
    expect(first).toBeDefined();
    if (!first) return;
    // At (10, 0) the tangent of the circle is vertical.
    expect(first.c1.x).toBeCloseTo(10, 5);
    expect(first.c1.y).toBeGreaterThan(0);
  });

  it('refuses degenerate input', () => {
    expect(fitClosedCubics([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });
});

describe('strokeToContour', () => {
  it('needs far fewer points than the raw outline and stays inside its bounds', () => {
    const stroke = line({ x: 20, y: 30 }, { x: 150, y: 140 }, 0.5, 200);
    const raw = expandStroke(stroke, PEN);
    const contour = strokeToContour(stroke, PEN);
    expect(contour).not.toBeNull();
    if (!contour) return;
    expect(contour.segments.length).toBeLessThan(raw.length / 4);
    const rawBox = bounds(raw);
    const box = bounds(onCurve(contour));
    expect(box.xMin).toBeGreaterThanOrEqual(rawBox.xMin - 0.01);
    expect(box.xMax).toBeLessThanOrEqual(rawBox.xMax + 0.01);
    expect(box.xMax - box.xMin).toBeGreaterThan(rawBox.xMax - rawBox.xMin - 1.5);
  });
});
