import { CELL } from '../glyphs/metrics';
import type { Stroke, StrokePoint } from '../outline';
import { isFilled, MAX_VARIANTS, type Project } from '../state/project';
import type { Settings } from '../state/settings';
import { el } from '../ui/dom';
import { fillStroke, loadGuideFont, paintCell, RESOLUTION } from './paint';
import { readToken } from '../tokens/read';

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

/** Opens the point editor for one version of a character. */
export type EditGlyph = (char: string, variant: number) => void;

/**
 * One drawing cell: a canvas with baseline and x-height guides that records
 * pointer strokes, plus undo and clear. The canvas shows the same outlines
 * that go into the font. An empty cell can show a faint guide letter. Below
 * the canvas, tabs switch between up to three versions of the character, and
 * Edit opens the point editor.
 */
export function createCell(char: string, project: Project, settings: Settings, onEdit: EditGlyph): HTMLElement {
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
  const paperTag = el('span', { class: 'cell__tag' }, ['from paper']);
  const versions = el('span', { class: 'versions', role: 'group', 'aria-label': `Versions of ${char}` });
  const edit = el('button', { class: 'cell__button', type: 'button', 'aria-label': `Edit the points of ${char}` }, [
    'Edit',
  ]);
  const cell = el('div', { class: 'cell' }, [
    el('div', { class: 'cell__head' }, [
      el('span', { class: 'cell__name' }, [el('span', { class: 'cell__label' }, [char]), paperTag]),
      el('span', { class: 'cell__actions' }, [undo, clear]),
    ]),
    canvas,
    el('div', { class: 'cell__foot' }, [versions, edit]),
  ]);

  const context = canvas.getContext('2d');
  if (!context) return cell;

  let current = 0;
  let active: { pointerId: number; stroke: Stroke } | null = null;

  const renderVersions = (): void => {
    const variants = project.variantsOf(char);
    const count = Math.max(1, variants.length);
    const buttons: HTMLButtonElement[] = [];
    for (let index = 0; index < count; index++) {
      const button = el('button', {
        class: 'versions__tab',
        type: 'button',
        'aria-pressed': String(index === current),
        'aria-label': `Version ${index + 1}`,
      }, [String(index + 1)]);
      button.addEventListener('click', () => {
        current = index;
        render();
      });
      buttons.push(button);
    }
    if (count < MAX_VARIANTS && isFilled(variants[count - 1])) {
      const add = el('button', { class: 'versions__tab', type: 'button', 'aria-label': `Add a version of ${char}` }, [
        '+',
      ]);
      add.addEventListener('click', () => {
        const index = project.addVariant(char);
        if (index !== null) current = index;
        render();
      });
      buttons.push(add);
    }
    versions.replaceChildren(...buttons);
  };

  const render = (): void => {
    const variants = project.variantsOf(char);
    if (current >= Math.max(1, variants.length)) current = Math.max(0, variants.length - 1);
    const variant = variants[current] ?? { strokes: [], traced: null };
    paintCell(context, variant, settings.value.guideLetters ? char : null);
    if (active) {
      context.fillStyle = readToken('--color-ink');
      fillStroke(context, active.stroke);
    }
    const filled = isFilled(variant);
    undo.disabled = variant.strokes.length === 0;
    clear.disabled = !filled && current === 0;
    edit.disabled = !filled;
    const fromPaper = !!variant.traced && variant.strokes.length === 0;
    paperTag.hidden = !fromPaper;
    // A glyph from paper has no strokes to take back, so Undo makes room for the tag.
    undo.hidden = fromPaper;
    cell.classList.toggle('cell--drawn', project.hasGlyph(char) || filled);
    cell.classList.toggle('cell--versions', variants.length > 1);
    renderVersions();
  };

  const finish = (event: PointerEvent): void => {
    if (!active || event.pointerId !== active.pointerId) return;
    const { stroke } = active;
    active = null;
    project.addStroke(char, stroke, current);
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

  undo.addEventListener('click', () => project.undo(char, current));
  clear.addEventListener('click', () => project.clear(char, current));
  edit.addEventListener('click', () => onEdit(char, current));
  project.subscribe((change) => {
    if (change.kind === 'glyph' && change.char === char) render();
  });
  settings.subscribe(render);
  loadGuideFont().then(render, () => undefined);

  render();
  return cell;
}
