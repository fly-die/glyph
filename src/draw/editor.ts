import './editor.css';
import { CELL, PEN_WIDTH } from '../glyphs/metrics';
import { strokeToContour, type Contour, type Point, type Stroke } from '../outline';
import type { Project } from '../state/project';
import { readToken } from '../tokens/read';
import { el } from '../ui/dom';
import { contourNodes, moveContourNode, moveStrokeNode, smoothStroke, strokeNodes } from './edit';
import { fillContours } from './paint';

/** Canvas pixels per cell pixel in the editor, which shows the cell large. */
const SCALE = 6;
/** How far a pointer may be from a point, in cell pixels, to pick it up. */
const PICK = 7;
const NODE_TOLERANCE = 2;
const SMOOTH_RADIUS = 12;

type Tool = 'move' | 'smooth';

interface Working {
  char: string;
  variant: number;
  strokes: Stroke[];
  traced: Contour[] | null;
}

/**
 * Fixes a letter without drawing it again. For a drawn letter the points sit
 * on the pen path, and the outline follows the path. For a letter from paper
 * they are the points of its outline. Done keeps the change, Cancel or Escape
 * drops it.
 */
export function createEditor(project: Project): (char: string, variant: number) => void {
  const canvas = el('canvas', {
    class: 'editor__canvas',
    width: String(CELL.width * SCALE),
    height: String(CELL.height * SCALE),
    role: 'img',
  });
  const label = el('span', { class: 'cell__label editor__label' });
  const moveTool = el('button', { class: 'segmented__button', type: 'button', 'aria-pressed': 'true' }, ['Move points']);
  const smoothTool = el('button', { class: 'segmented__button', type: 'button', 'aria-pressed': 'false' }, ['Smooth']);
  const undo = el('button', { class: 'text-button', type: 'button' }, ['Undo']);
  const cancel = el('button', { class: 'text-button', type: 'button' }, ['Cancel']);
  const done = el('button', { class: 'button', type: 'button' }, ['Done']);
  const dialog = el('dialog', { class: 'editor', 'aria-label': 'Edit points' }, [
    el('div', { class: 'draw-bar editor__bar' }, [
      label,
      el('div', { class: 'draw-bar__controls' }, [
        el('div', { class: 'segmented-buttons' }, [moveTool, smoothTool]),
        undo,
        cancel,
        done,
      ]),
    ]),
    canvas,
  ]);
  document.body.append(dialog);
  const context = canvas.getContext('2d');

  let working: Working | null = null;
  let history: Working[] = [];
  let tool: Tool = 'move';
  let drag: { stroke: number; node: number; last: Point } | { contour: number; node: number; last: Point } | null = null;
  let brushing = false;

  const copy = (w: Working): Working => ({
    ...w,
    strokes: w.strokes.map((stroke) => [...stroke]),
    traced: w.traced ? w.traced.map((contour) => ({ start: contour.start, segments: [...contour.segments] })) : null,
  });
  const isTraced = (): boolean => !!working?.traced && working.strokes.length === 0;

  const render = (): void => {
    if (!context || !working) return;
    context.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    context.clearRect(0, 0, CELL.width, CELL.height);
    // Guides as hairlines: line widths here are in cell pixels, drawn six times larger.
    context.lineWidth = 2 / SCALE;
    context.strokeStyle = readToken('--color-guide');
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(0, CELL.xHeight);
    context.lineTo(CELL.width, CELL.xHeight);
    context.stroke();
    context.setLineDash([]);
    context.strokeStyle = readToken('--color-accent');
    context.beginPath();
    context.moveTo(0, CELL.baseline);
    context.lineTo(CELL.width, CELL.baseline);
    context.stroke();
    const accent = readToken('--color-accent');
    const node = (p: Point): void => context.fillRect(p.x - 1.4, p.y - 1.4, 2.8, 2.8);

    if (isTraced() && working.traced) {
      context.strokeStyle = accent;
      context.lineWidth = 1.6 / SCALE * 2;
      for (const contour of working.traced) {
        context.beginPath();
        context.moveTo(contour.start.x, contour.start.y);
        for (const { c1, c2, to } of contour.segments) context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
        context.closePath();
        context.stroke();
      }
      context.fillStyle = accent;
      for (const contour of working.traced) contourNodes(contour).forEach(node);
      return;
    }

    // The ink faint underneath, the pen path and its points on top.
    context.fillStyle = readToken('--color-ghost');
    fillContours(context, working.strokes.flatMap((stroke) => strokeToContour(stroke, PEN_WIDTH) ?? []));
    context.strokeStyle = accent;
    context.lineWidth = 2 / SCALE * 2;
    for (const stroke of working.strokes) {
      context.beginPath();
      stroke.forEach((p, index) => (index === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
      context.stroke();
    }
    context.fillStyle = accent;
    for (const stroke of working.strokes) for (const index of strokeNodes(stroke, NODE_TOLERANCE)) node(stroke[index] as Point);
  };

  const sync = (): void => {
    moveTool.setAttribute('aria-pressed', String(tool === 'move'));
    smoothTool.setAttribute('aria-pressed', String(tool === 'smooth'));
    smoothTool.disabled = isTraced();
    undo.disabled = history.length === 0;
    render();
  };

  const toCell = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CELL.width,
      y: ((event.clientY - rect.top) / rect.height) * CELL.height,
    };
  };

  const pick = (at: Point): typeof drag => {
    if (!working) return null;
    let best: typeof drag = null;
    let distance = PICK;
    if (isTraced()) {
      working.traced?.forEach((contour, c) =>
        contourNodes(contour).forEach((p, n) => {
          const d = Math.hypot(p.x - at.x, p.y - at.y);
          if (d < distance) {
            distance = d;
            best = { contour: c, node: n, last: at };
          }
        }),
      );
    } else {
      working.strokes.forEach((stroke, s) =>
        strokeNodes(stroke, NODE_TOLERANCE).forEach((index, n) => {
          const p = stroke[index] as Point;
          const d = Math.hypot(p.x - at.x, p.y - at.y);
          if (d < distance) {
            distance = d;
            best = { stroke: s, node: n, last: at };
          }
        }),
      );
    }
    return best;
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (!working) return;
    const at = toCell(event);
    if (tool === 'move') {
      drag = pick(at);
      if (!drag) return;
    } else {
      brushing = true;
    }
    history.push(copy(working));
    event.preventDefault();
    sync();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture only keeps a drag alive outside the canvas. Editing works without it.
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!working) return;
    const at = toCell(event);
    if (brushing) {
      working.strokes = working.strokes.map((stroke) => smoothStroke(stroke, at, SMOOTH_RADIUS));
      render();
      return;
    }
    if (!drag) return;
    const delta = { x: at.x - drag.last.x, y: at.y - drag.last.y };
    drag.last = at;
    if ('stroke' in drag) {
      const stroke = working.strokes[drag.stroke];
      if (stroke) working.strokes[drag.stroke] = moveStrokeNode(stroke, strokeNodes(stroke, NODE_TOLERANCE), drag.node, delta);
    } else if (working.traced) {
      const contour = working.traced[drag.contour];
      if (contour) working.traced[drag.contour] = moveContourNode(contour, drag.node, delta);
    }
    render();
  });
  const end = (): void => {
    drag = null;
    brushing = false;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  moveTool.addEventListener('click', () => {
    tool = 'move';
    sync();
  });
  smoothTool.addEventListener('click', () => {
    tool = 'smooth';
    sync();
  });
  undo.addEventListener('click', () => {
    const previous = history.pop();
    if (previous) working = previous;
    sync();
  });
  cancel.addEventListener('click', () => dialog.close());
  done.addEventListener('click', () => {
    if (working && history.length > 0) {
      if (isTraced() && working.traced) project.replaceTraced(working.char, working.variant, working.traced);
      else project.replaceStrokes(working.char, working.variant, working.strokes);
    }
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    working = null;
    history = [];
  });

  return (char, variant) => {
    working = {
      char,
      variant,
      strokes: project.strokesOf(char, variant).map((stroke) => [...stroke]),
      traced: project.tracedOf(char, variant)?.map((contour) => ({ ...contour })) ?? null,
    };
    history = [];
    tool = 'move';
    label.textContent = char;
    canvas.setAttribute('aria-label', `Points of ${char}`);
    sync();
    dialog.showModal();
  };
}
