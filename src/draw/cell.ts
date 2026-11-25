import { CELL, PEN_WIDTH } from '../glyphs/metrics';
import { strokeToContour, type Stroke, type StrokePoint } from '../outline';
import type { Project } from '../state/project';
import type { Settings } from '../state/settings';
import { readToken } from '../tokens/read';
import { el } from '../ui/dom';

/** Canvas pixels per cell pixel. Enough for a crisp cell on a retina screen. */
const RESOLUTION = 2;
const MOUSE_PRESSURE = 0.5;

function toStrokePoint(canvas: HTMLCanvasElement, event: PointerEvent): StrokePoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CELL.width,
    y: ((event.clientY - rect.top) / rect.height) * CELL.height,
    // Only a pen reports real pressure. Mouse and finger get the nominal width.
    pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : MOUSE_PRESSURE,
  };
}

function drawGuides(context: CanvasRenderingContext2D): void {
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

const GUIDE_FONT = '"Hanken Grotesk Variable"';
let guideFontSize: number | null = null;
let guideFontReady: Promise<void> | null = null;

/**
 * Loads the typeface of the guide letters and works out the size at which its
 * x-height spans the distance between the two guides.
 */
function loadGuideFont(): Promise<void> {
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
function drawGuideLetter(context: CanvasRenderingContext2D, char: string): void {
  if (guideFontSize === null) return;
  context.font = `300 ${guideFontSize}px ${GUIDE_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = readToken('--color-ghost');
  context.fillText(char, CELL.width / 2, CELL.baseline);
}

function fillStroke(context: CanvasRenderingContext2D, stroke: Stroke): void {
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

/**
 * One drawing cell: a canvas with baseline and x-height guides that records
 * pointer strokes, plus undo and clear. The canvas shows the same outlines
 * that go into the font. An empty cell can show a faint guide letter.
 */
export function createCell(char: string, project: Project, settings: Settings): HTMLElement {
  const canvas = el('canvas', {
    class: 'cell__canvas',
    width: String(CELL.width * RESOLUTION),
    height: String(CELL.height * RESOLUTION),
    role: 'img',
    'aria-label': `Drawing area for ${char}`,
  });
  const undo = el('button', { class: 'cell__button', type: 'button', 'aria-label': `Undo last stroke of ${char}` }, [
    'Undo',
  ]);
  const clear = el('button', { class: 'cell__button', type: 'button', 'aria-label': `Clear ${char}` }, ['Clear']);
  const cell = el('div', { class: 'cell' }, [
    el('div', { class: 'cell__head' }, [
      el('span', { class: 'cell__label' }, [char]),
      el('span', { class: 'cell__actions' }, [undo, clear]),
    ]),
    canvas,
  ]);

  const context = canvas.getContext('2d');
  if (!context) return cell;

  let active: { pointerId: number; stroke: Stroke } | null = null;

  const render = (): void => {
    const strokes = project.strokesOf(char);
    context.setTransform(RESOLUTION, 0, 0, RESOLUTION, 0, 0);
    context.clearRect(0, 0, CELL.width, CELL.height);
    drawGuides(context);
    if (strokes.length === 0 && !active && settings.value.guideLetters) drawGuideLetter(context, char);
    context.fillStyle = readToken('--color-ink');
    for (const stroke of strokes) fillStroke(context, stroke);
    if (active) fillStroke(context, active.stroke);

    const empty = strokes.length === 0;
    undo.disabled = empty;
    clear.disabled = empty;
    cell.classList.toggle('cell--drawn', !empty);
  };

  const finish = (event: PointerEvent): void => {
    if (!active || event.pointerId !== active.pointerId) return;
    const { stroke } = active;
    active = null;
    project.addStroke(char, stroke);
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (active || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture only keeps a stroke alive outside the cell. Drawing works without it.
    }
    active = { pointerId: event.pointerId, stroke: [toStrokePoint(canvas, event)] };
    render();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointerId) return;
    // Coalesced events carry every sample a fast pen produced since the last frame.
    const coalesced = event.getCoalescedEvents?.() ?? [];
    const samples = coalesced.length > 0 ? coalesced : [event];
    for (const sample of samples) active.stroke.push(toStrokePoint(canvas, sample));
    render();
  });
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  undo.addEventListener('click', () => project.undo(char));
  clear.addEventListener('click', () => project.clear(char));
  project.subscribe((changed) => {
    if (changed === char) render();
  });

  settings.subscribe(render);
  loadGuideFont().then(render, () => undefined);

  render();
  return cell;
}
