import { CELL, PEN_WIDTH } from '../glyphs/metrics';
import { strokeToContour, type Contour, type Stroke } from '../outline';
import { readToken } from '../tokens/read';

/** Canvas pixels per cell pixel. Enough for a crisp cell on a retina screen. */
export const RESOLUTION = 2;

export function drawGuides(context: CanvasRenderingContext2D): void {
  context.lineWidth = 1;
  context.strokeStyle = readToken('--color-guide');
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(0, CELL.xHeight + 0.5);
  context.lineTo(CELL.width, CELL.xHeight + 0.5);
  context.stroke();

  context.strokeStyle = readToken('--color-accent');
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(0, CELL.baseline + 0.5);
  context.lineTo(CELL.width, CELL.baseline + 0.5);
  context.stroke();
}

export const GUIDE_FONT = '"Hanken Grotesk Variable"';
let guideFontSize: number | null = null;
let guideFontReady: Promise<void> | null = null;

/**
 * Loads the typeface of the guide letters and works out the size at which its
 * x-height spans the distance between the two guides.
 */
export function loadGuideFont(): Promise<void> {
  guideFontReady ??= document.fonts.load(`300 100px ${GUIDE_FONT}`).then(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    context.font = `300 100px ${GUIDE_FONT}`;
    const xHeight = context.measureText('x').actualBoundingBoxAscent;
    if (xHeight > 0) guideFontSize = ((CELL.baseline - CELL.xHeight) / xHeight) * 100;
  });
  return guideFontReady;
}

/** A faint printed letter that shows where the glyph sits and how tall it is. */
export function drawGuideLetter(context: CanvasRenderingContext2D, char: string): void {
  if (guideFontSize === null) return;
  context.font = `300 ${guideFontSize}px ${GUIDE_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = readToken('--color-ghost');
  context.fillText(char, CELL.width / 2, CELL.baseline);
}

export function fillStroke(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const contour = strokeToContour(stroke, PEN_WIDTH);
  if (!contour) return;
  context.beginPath();
  context.moveTo(contour.start.x, contour.start.y);
  for (const { c1, c2, to } of contour.segments) {
    context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
  }
  context.closePath();
  context.fill();
}

/** Paints outlines traced from paper. Holes run the other way, so the non-zero rule keeps them open. */
export function fillContours(context: CanvasRenderingContext2D, contours: readonly Contour[]): void {
  context.beginPath();
  for (const contour of contours) {
    context.moveTo(contour.start.x, contour.start.y);
    for (const { c1, c2, to } of contour.segments) context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
    context.closePath();
  }
  context.fill('nonzero');
}

/** Clears a cell canvas and paints the guides, then the glyph of one version. */
export function paintCell(
  context: CanvasRenderingContext2D,
  glyph: { strokes: readonly Stroke[]; traced: readonly Contour[] | null },
  guideLetter: string | null,
): void {
  context.setTransform(RESOLUTION, 0, 0, RESOLUTION, 0, 0);
  context.clearRect(0, 0, CELL.width, CELL.height);
  drawGuides(context);
  const empty = glyph.strokes.length === 0 && !glyph.traced?.length;
  if (empty && guideLetter) drawGuideLetter(context, guideLetter);
  context.fillStyle = readToken('--color-ink');
  if (glyph.traced?.length && glyph.strokes.length === 0) fillContours(context, glyph.traced);
  for (const stroke of glyph.strokes) fillStroke(context, stroke);
}
