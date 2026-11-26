import { parse } from 'opentype.js';
import { describe, expect, it } from 'vitest';
import { buildFontFile } from '../font/build';
import { CELL } from '../glyphs/metrics';
import { solveHomography, project } from './homography';
import { createGray, sample, type GrayImage } from './image';
import { polygonArea } from './trace';
import { readSheet } from './read';
import { SHEET, sheetCells } from './template';

const PX_PER_MM = 4;
const PAPER = 0.93;
const INK = 0.12;
const GUIDE = 0.72;

type Stroke = [number, number][];

/** Paints a thick pen line, points in millimetres. */
function line(image: GrayImage, points: Stroke, radius: number, value: number): void {
  points.forEach((a, index) => {
    const b = points[index + 1] ?? a;
    const [x0, x1] = [Math.min(a[0], b[0]) - radius, Math.max(a[0], b[0]) + radius].map((v) => Math.round(v * PX_PER_MM));
    const [y0, y1] = [Math.min(a[1], b[1]) - radius, Math.max(a[1], b[1]) + radius].map((v) => Math.round(v * PX_PER_MM));
    for (let py = y0 ?? 0; py <= (y1 ?? 0); py++) {
      for (let px = x0 ?? 0; px <= (x1 ?? 0); px++) {
        const x = px / PX_PER_MM;
        const y = py / PX_PER_MM;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
        if (Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= radius) image.data[py * image.width + px] = value;
      }
    }
  });
}

function square(image: GrayImage, cx: number, cy: number, size: number, value: number): void {
  for (let py = Math.round((cy - size / 2) * PX_PER_MM); py < Math.round((cy + size / 2) * PX_PER_MM); py++) {
    for (let px = Math.round((cx - size / 2) * PX_PER_MM); px < Math.round((cx + size / 2) * PX_PER_MM); px++) {
      image.data[py * image.width + px] = value;
    }
  }
}

/** Letters in cell pixels, the same coordinates a drawing cell uses. */
const WRITTEN: Record<string, Stroke[]> = {
  A: [
    [
      [40, 160],
      [100, 30],
      [160, 160],
    ],
    [
      [65, 110],
      [135, 110],
    ],
  ],
  o: Array.from({ length: 1 }, () => Array.from({ length: 41 }, (_, k): [number, number] => [100 + 40 * Math.cos((k / 40) * Math.PI * 2), 120 + 38 * Math.sin((k / 40) * Math.PI * 2)])),
  '.': [
    [
      [90, 152],
      [90, 152],
    ],
  ],
};

/** The printed sheet with a few letters written in, as a flat scan. */
function filledSheet(): GrayImage {
  const sheet = createGray(SHEET.width * PX_PER_MM, SHEET.height * PX_PER_MM, PAPER);
  SHEET.marker.centers.forEach((center, index) => {
    square(sheet, center.x, center.y, SHEET.marker.size, INK);
    if (index === 0) square(sheet, center.x, center.y, SHEET.marker.hole, PAPER);
  });
  for (const cell of sheetCells()) {
    const toMm = ([x, y]: [number, number]): [number, number] => [cell.x + (x / CELL.width) * cell.width, cell.y + (y / CELL.height) * cell.height];
    const box: Stroke = [
      [0, 0],
      [CELL.width, 0],
      [CELL.width, CELL.height],
      [0, CELL.height],
      [0, 0],
    ];
    line(sheet, box.map(toMm), 0.15, GUIDE);
    line(sheet, [toMm([0, CELL.baseline]), toMm([CELL.width, CELL.baseline])], 0.15, GUIDE);
    line(sheet, [toMm([0, CELL.xHeight]), toMm([CELL.width, CELL.xHeight])], 0.15, GUIDE);
    for (const stroke of WRITTEN[cell.char] ?? []) line(sheet, stroke.map(toMm), 0.6, INK);
  }
  return sheet;
}

/** Where the markers land in the fake photo: tilted, closer at the bottom. */
const PHOTO_MARKERS = [
  { x: 150, y: 120 },
  { x: 860, y: 160 },
  { x: 940, y: 1190 },
  { x: 80, y: 1230 },
];

/** A phone photo of the sheet: perspective, light falling off to one side, sensor noise, a dark table around it. */
function photograph(sheet: GrayImage, markers = PHOTO_MARKERS): GrayImage {
  const toSheet = solveHomography(markers, SHEET.marker.centers);
  const photo = createGray(1000, 1320);
  let seed = 7;
  const noise = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648 - 0.5) * 0.06;
  };
  for (let y = 0; y < photo.height; y++) {
    for (let x = 0; x < photo.width; x++) {
      const mm = project(toSheet, { x, y });
      const onPaper = mm.x >= 0 && mm.y >= 0 && mm.x < SHEET.width && mm.y < SHEET.height;
      const light = 0.65 + 0.35 * (x / photo.width);
      const value = onPaper ? sample(sheet, mm.x * PX_PER_MM, mm.y * PX_PER_MM) * light : 0.22;
      photo.data[y * photo.width + x] = Math.min(1, Math.max(0, value + noise()));
    }
  }
  return photo;
}

describe('readSheet', () => {
  const reading = readSheet(photograph(filledSheet()));

  it('finds the markers in the photo, clockwise from the ring', () => {
    if (typeof reading === 'string') throw new Error(reading);
    reading.markers.forEach((marker, index) => {
      const expected = PHOTO_MARKERS[index] ?? { x: 0, y: 0 };
      expect(Math.hypot(marker.x - expected.x, marker.y - expected.y)).toBeLessThan(4);
    });
  });

  it('picks up only the cells that were written in, not the printed guides', () => {
    if (typeof reading === 'string') throw new Error(reading);
    expect([...reading.glyphs.keys()].sort()).toEqual(['.', 'A', 'o']);
  });

  it('keeps the hole of an o as a separate outline', () => {
    if (typeof reading === 'string') throw new Error(reading);
    const o = reading.cells.find((cell) => cell.char === 'o');
    expect(o?.polygons).toHaveLength(2);
    const [outer, inner] = (o?.polygons ?? []).map(polygonArea).sort((a, b) => Math.abs(b) - Math.abs(a));
    expect(Math.sign(outer ?? 0)).toBe(-Math.sign(inner ?? 0));
  });

  it('places the letter where it was written in the cell', () => {
    if (typeof reading === 'string') throw new Error(reading);
    const points = reading.cells.find((cell) => cell.char === 'A')?.polygons.flat() ?? [];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    // The pen is 1.2 mm wide, 12 cell pixels, so the ink reaches 6 past the stroke.
    expect(Math.min(...xs)).toBeCloseTo(34, -1);
    expect(Math.max(...xs)).toBeCloseTo(166, -1);
    expect(Math.min(...ys)).toBeCloseTo(24, -1);
    expect(Math.max(...ys)).toBeCloseTo(166, -1);
  });

  it('turns the traced letters into a font with the o still open', () => {
    if (typeof reading === 'string') throw new Error(reading);
    const font = parse(buildFontFile(new Map(), 'Paper Hand', reading.glyphs));
    expect(font.charToGlyph('A').name).toBe('A');
    const o = font.charToGlyph('o');
    const box = o.getBoundingBox();
    // A point in the middle of the counter must stay unpainted.
    const middle = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
    let winding = 0;
    const path = o.path.commands;
    let previous = { x: 0, y: 0 };
    let start = { x: 0, y: 0 };
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
      if (a.y <= middle.y && b.y > middle.y && (b.x - a.x) * (middle.y - a.y) - (middle.x - a.x) * (b.y - a.y) > 0) winding++;
      if (a.y > middle.y && b.y <= middle.y && (b.x - a.x) * (middle.y - a.y) - (middle.x - a.x) * (b.y - a.y) < 0) winding--;
    };
    for (const command of path) {
      if (command.type === 'M') start = previous = { x: command.x, y: command.y };
      else if (command.type === 'Z') {
        cross(previous, start);
        previous = start;
      } else {
        const next = { x: command.x, y: command.y };
        cross(previous, next);
        previous = next;
      }
    }
    expect(winding).toBe(0);
  });

  it('reads a sheet that was photographed upside down', () => {
    // The ring, the top left of the sheet, now sits at the bottom right of the photo.
    const turned = [2, 3, 0, 1].map((index) => PHOTO_MARKERS[index] ?? { x: 0, y: 0 });
    const upsideDown = readSheet(photograph(filledSheet(), turned));
    if (typeof upsideDown === 'string') throw new Error(upsideDown);
    expect([...upsideDown.glyphs.keys()].sort()).toEqual(['.', 'A', 'o']);
  });

  it('reports a photo without the sheet in it', () => {
    expect(readSheet(createGray(400, 300, 0.5))).toBe('markers-not-found');
  });
});
