import './panel.css';
import { CHARSET } from '../glyphs/charset';
import { CELL } from '../glyphs/metrics';
import { paintCell, RESOLUTION } from '../draw/paint';
import type { Contour } from '../outline';
import type { Project } from '../state/project';
import { readToken } from '../tokens/read';
import { el } from '../ui/dom';
import type { ReadRequest, ReadResponse } from './reader.worker';

/** The photo is scaled down to this before it goes to the reader. Phones take far larger photos. */
const MAX_UPLOAD = 2000;
const SHEET_URL = '/glyph-sheet.pdf';

function substep(number: string, title: string, text: string, action?: HTMLElement): HTMLElement {
  return el('div', { class: 'paper__substep' }, [
    el('span', { class: 'paper__number', 'aria-hidden': 'true' }, [number]),
    el('h3', { class: 'paper__title' }, [title]),
    el('p', { class: 'paper__text' }, [text]),
    ...(action ? [action] : []),
  ]);
}

function grayCanvas(image: { width: number; height: number; gray: Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = el('canvas', { width: String(image.width), height: String(image.height) });
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const pixels = context.createImageData(image.width, image.height);
  image.gray.forEach((value, index) => {
    pixels.data[index * 4] = value;
    pixels.data[index * 4 + 1] = value;
    pixels.data[index * 4 + 2] = value;
    pixels.data[index * 4 + 3] = 255;
  });
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function stage(caption: string, content: HTMLElement): HTMLElement {
  return el('figure', { class: 'paper__stage' }, [el('figcaption', {}, [caption]), el('div', { class: 'paper__frame' }, [content])]);
}

function readCell(char: string, contours: Contour[]): HTMLElement {
  const canvas = el('canvas', {
    class: 'paper__cell-canvas',
    width: String(CELL.width * RESOLUTION),
    height: String(CELL.height * RESOLUTION),
    role: 'img',
    'aria-label': `${char} as read`,
  });
  const context = canvas.getContext('2d');
  if (context) paintCell(context, { strokes: [], traced: contours }, null);
  return el('div', { class: 'cell cell--drawn' }, [
    el('div', { class: 'cell__head' }, [el('span', { class: 'cell__label' }, [char])]),
    canvas,
  ]);
}

/** Loads a photo, scaled down, as RGBA pixels. Phones store their photos turned; the browser turns them back. */
async function loadPhoto(file: File): Promise<ReadRequest> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_UPLOAD / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = el('canvas', { width: String(width), height: String(height) });
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { rgba: context.getImageData(0, 0, width, height).data, width, height };
}

/**
 * Paper mode: print the sheet, write on it, take a photo. The reader shows
 * what it did at each stage, and the letters it found go into the cells when
 * taken over. `onTaken` runs after that with a line to show.
 */
export function mountPaper(parent: HTMLElement, project: Project, onTaken: (message: string) => void): void {
  const download = el('a', { class: 'button', href: SHEET_URL, download: 'glyph-sheet.pdf' }, ['Download sheet']);
  const input = el('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1' });
  const choose = el('button', { class: 'button', type: 'button' }, ['Choose photo']);
  const status = el('p', { class: 'step__status step__status--plain paper__status', 'aria-live': 'polite' });
  const stages = el('div', { class: 'paper__stages', hidden: '' });
  const use = el('button', { class: 'button', type: 'button' });
  const retake = el('button', { class: 'text-button', type: 'button' }, ['Take another photo']);
  const result = el('div', { class: 'paper__result', hidden: '' }, [status, use, retake]);

  parent.append(
    el('div', { class: 'paper__substeps' }, [
      substep('1', 'Print the sheet', 'One A4 page with a cell for every character.', download),
      substep('2', 'Write', 'One character per cell with a dark pen. Leave cells empty that you want to skip.'),
      substep(
        '3',
        'Take a photo',
        'The whole sheet, all four corner squares in the picture. Light from above, no flash.',
        el('div', {}, [choose, input]),
      ),
    ]),
    stages,
    result,
    el('p', { class: 'step__lead paper__note' }, [
      'After that the letters sit in the normal cells, marked ',
      el('span', { class: 'cell__tag' }, ['from paper']),
      ', and can be redrawn on screen one by one.',
    ]),
  );

  let worker: Worker | null = null;
  let found: Map<string, Contour[]> = new Map();

  /** One line of status, and which of the stages and buttons go with it. */
  const show = (message: string, state: 'reading' | 'failed' | 'read'): void => {
    result.hidden = false;
    status.textContent = message;
    stages.hidden = state !== 'read';
    use.hidden = state !== 'read' || found.size === 0;
    retake.hidden = state === 'reading';
  };

  const read = async (file: File): Promise<void> => {
    found = new Map();
    choose.disabled = true;
    show('Reading the sheet...', 'reading');
    try {
      const request = await loadPhoto(file);
      worker ??= new Worker(new URL('./reader.worker.ts', import.meta.url), { type: 'module' });
      const response = await new Promise<ReadResponse>((resolve, reject) => {
        const current = worker as Worker;
        current.onmessage = (event: MessageEvent<ReadResponse>) => resolve(event.data);
        current.onerror = () => reject(new Error('The reader stopped'));
        current.postMessage(request, [request.rgba.buffer]);
      });
      if (!response.ok) {
        show(
          'The four corner squares are not all in the photo. Take it again with the whole sheet in the picture.',
          'failed',
        );
        return;
      }
      found = new Map(response.glyphs);

      const photo = grayCanvas(response.photo);
      const context = photo.getContext('2d');
      if (context) {
        context.strokeStyle = readToken('--color-accent');
        context.lineWidth = Math.max(3, response.photo.width / 150);
        for (const marker of response.markers) {
          context.beginPath();
          context.arc(marker.x, marker.y, response.photo.width / 40, 0, Math.PI * 2);
          context.stroke();
        }
      }
      const cells = el('div', { class: 'grid paper__cells' }, [...found].map(([char, contours]) => readCell(char, contours)));
      stages.replaceChildren(
        stage('Photo, corners found', photo),
        stage('Straightened', grayCanvas(response.straightened)),
        stage('Read from the cells', cells),
      );
      const empty = CHARSET.length - found.size;
      use.textContent = `Use these ${found.size}`;
      show(
        found.size === 0
          ? 'No writing found in the cells. Use a darker pen, or more light.'
          : `${found.size} characters found, ${empty} cells empty`,
        'read',
      );
    } catch {
      show('Could not open this photo. Try a JPEG or PNG.', 'failed');
    } finally {
      choose.disabled = false;
      input.value = '';
    }
  };

  choose.addEventListener('click', () => input.click());
  retake.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void read(file);
  });
  use.addEventListener('click', () => {
    const { imported, kept } = project.importTraced(found);
    found = new Map();
    result.hidden = true;
    stages.hidden = true;
    const characters = (n: number): string => `${n} ${n === 1 ? 'character' : 'characters'}`;
    const keptNote = kept.length > 0 ? ` ${characters(kept.length)} drawn on screen kept the drawing.` : '';
    onTaken(`Took ${characters(imported.length)} from paper.${keptNote}`);
  });
}
