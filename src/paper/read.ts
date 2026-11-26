import { CELL } from '../glyphs/metrics';
import { fitClosedCubics } from '../outline/bezier';
import { simplifyClosed } from '../outline/simplify';
import type { Contour, Point, Polygon } from '../outline';
import { solveHomography, project, type Homography } from './homography';
import { boxMean, createGray, percentile, sample, type GrayImage } from './image';
import { findMarkers } from './markers';
import { SHEET, sheetCells, type SheetCell } from './template';
import { orientByNesting, polygonArea, traceField, type Field } from './trace';

/** Samples per cell pixel when a cell is cut out of the photo. */
const SUPERSAMPLE = 2;
/** Share of the cell kept clear along each edge, so the printed cell border never counts as ink. */
const INSET = 0.04;
/** Ink strength at which the outline is drawn. Printed guides stay well below it. */
const INK_LEVEL = 0.45;
/** A cell with less ink than this share of its area counts as empty. */
const MIN_INK_SHARE = 0.0015;
/** Outlines smaller than this, in square cell pixels, are dust. A pen dot is about ten times larger. */
const MIN_AREA = 6;
/** Largest distance the simplified outline may stray from the traced one, in cell pixels. */
const TOLERANCE = 0.35;

export interface CellReading {
  char: string;
  /** Ink strength of the cut out cell, for showing the step. */
  field: Field;
  /** Traced outlines in cell pixels, holes included. Empty when nothing was written. */
  polygons: Polygon[];
}

export interface SheetReading {
  /** Marker centres in the photo, clockwise from the top left. */
  markers: Point[];
  /** From sheet millimetres to photo pixels. */
  toPhoto: Homography;
  cells: CellReading[];
  /** Curves per written character, in cell pixels, ready for the font. */
  glyphs: Map<string, Contour[]>;
}

export type ReadError = 'markers-not-found';

/** Cuts one cell out of the photo, straightened, at the size of a drawing cell. */
function cutCell(photo: GrayImage, toPhoto: Homography, cell: SheetCell): GrayImage {
  const width = CELL.width * SUPERSAMPLE;
  const height = CELL.height * SUPERSAMPLE;
  const out = createGray(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = project(toPhoto, {
        x: cell.x + ((x + 0.5) / width) * cell.width,
        y: cell.y + ((y + 0.5) / height) * cell.height,
      });
      out.data[y * width + x] = sample(photo, at.x, at.y);
    }
  }
  return out;
}

/**
 * Turns a cut out cell into ink strength: 0 where the paper is, 1 for the
 * darkest ink. The paper level is measured per cell, so a shadow over part of
 * the sheet does not turn into ink. Light printed guides land far below the
 * ink level and drop out.
 */
export function inkField(cell: GrayImage): Field {
  const paper = Math.max(0.05, percentile(cell, 0.9));
  const smooth = boxMean(cell, 1);
  const data = new Float32Array(cell.width * cell.height);
  const insetX = Math.round(cell.width * INSET);
  const insetY = Math.round(cell.height * INSET);
  for (let y = insetY; y < cell.height - insetY; y++) {
    for (let x = insetX; x < cell.width - insetX; x++) {
      const value = smooth.data[y * cell.width + x] ?? paper;
      data[y * cell.width + x] = Math.min(1, Math.max(0, (paper - value) / paper));
    }
  }
  return { width: cell.width, height: cell.height, data };
}

/** Traced outlines of the ink, in cell pixels, without dust. Outer outlines and holes wind opposite ways. */
export function tracePolygons(field: Field): Polygon[] {
  let ink = 0;
  for (const value of field.data) if (value >= INK_LEVEL) ink++;
  if (ink < field.data.length * MIN_INK_SHARE) return [];
  const polygons = traceField(field, INK_LEVEL)
    .map((polygon) => polygon.map((point) => ({ x: (point.x + 0.5) / SUPERSAMPLE, y: (point.y + 0.5) / SUPERSAMPLE })))
    .filter((polygon) => Math.abs(polygonArea(polygon)) >= MIN_AREA);
  return orientByNesting(polygons);
}

export function polygonsToContours(polygons: readonly Polygon[]): Contour[] {
  return polygons.flatMap((polygon) => fitClosedCubics(simplifyClosed(polygon, TOLERANCE)) ?? []);
}

/**
 * Reads a photo of a filled in sheet: finds the markers, straightens the
 * page, cuts out every cell and traces what was written in it.
 */
export function readSheet(photo: GrayImage): SheetReading | ReadError {
  const markers = findMarkers(photo);
  if (!markers) return 'markers-not-found';
  const toPhoto = solveHomography(SHEET.marker.centers, markers);
  const cells: CellReading[] = [];
  const glyphs = new Map<string, Contour[]>();
  for (const cell of sheetCells()) {
    const field = inkField(cutCell(photo, toPhoto, cell));
    const polygons = tracePolygons(field);
    cells.push({ char: cell.char, field, polygons });
    const contours = polygonsToContours(polygons);
    if (contours.length > 0) glyphs.set(cell.char, contours);
  }
  return { markers, toPhoto, cells, glyphs };
}
