import { describe, expect, it } from 'vitest';
import type { Contour, Stroke } from '../outline';
import { contourNodes, moveContourNode, moveStrokeNode, smoothStroke, strokeNodes } from './edit';

/** An L: down, then right. 11 samples per leg. */
const L: Stroke = [
  ...Array.from({ length: 11 }, (_, k) => ({ x: 50, y: 40 + k * 10, pressure: 0.5 })),
  ...Array.from({ length: 10 }, (_, k) => ({ x: 60 + k * 10, y: 140, pressure: 0.5 })),
];

describe('strokeNodes', () => {
  it('keeps the ends and the corner, not every sample', () => {
    expect(strokeNodes(L, 2)).toEqual([0, 10, 20]);
  });
});

describe('moveStrokeNode', () => {
  it('moves the point fully and its neighbours less the further away they are', () => {
    const moved = moveStrokeNode(L, [0, 10, 20], 1, { x: 10, y: 0 });
    expect(moved[10]?.x).toBe(60);
    expect(moved[5]?.x).toBe(55);
    expect(moved[0]?.x).toBe(50);
    expect(moved[20]?.x).toBe(L[20]?.x);
  });
});

describe('smoothStroke', () => {
  it('rounds off a corner near the brush and leaves the rest alone', () => {
    const smoothed = smoothStroke(L, { x: 50, y: 140 }, 15);
    expect(smoothed[10]?.x).toBeGreaterThan(50);
    expect(smoothed[10]?.y).toBeLessThan(140);
    expect(smoothed[2]).toEqual(L[2]);
  });
});

describe('moveContourNode', () => {
  const square: Contour = {
    start: { x: 0, y: 0 },
    segments: [
      { c1: { x: 3, y: 0 }, c2: { x: 7, y: 0 }, to: { x: 10, y: 0 } },
      { c1: { x: 10, y: 3 }, c2: { x: 10, y: 7 }, to: { x: 10, y: 10 } },
      { c1: { x: 7, y: 10 }, c2: { x: 3, y: 10 }, to: { x: 0, y: 10 } },
      { c1: { x: 0, y: 7 }, c2: { x: 0, y: 3 }, to: { x: 0, y: 0 } },
    ],
  };

  it('moves a point with the handles on both sides', () => {
    const moved = moveContourNode(square, 1, { x: 5, y: -5 });
    expect(moved.segments[0]?.to).toEqual({ x: 15, y: -5 });
    expect(moved.segments[0]?.c2).toEqual({ x: 12, y: -5 });
    expect(moved.segments[1]?.c1).toEqual({ x: 15, y: -2 });
  });

  it('keeps the outline closed when the start point moves', () => {
    const moved = moveContourNode(square, 0, { x: -2, y: -2 });
    expect(moved.start).toEqual({ x: -2, y: -2 });
    expect(moved.segments[3]?.to).toEqual({ x: -2, y: -2 });
    expect(contourNodes(moved)).toHaveLength(4);
  });
});
