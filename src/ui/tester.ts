import './tester.css';
import { buildFont } from '../font/build';
import type { Project } from '../state/project';
import { el, stepSection } from './dom';

const DEFAULT_SAMPLE = 'The quick brown fox jumps over the lazy dog. "Really?" (Yes!) 0123456789 & @';
const REBUILD_DELAY_MS = 200;

/**
 * The test step: the font is rebuilt as you draw and loaded through the
 * FontFace API, so the sample text is set in the real font, not a preview.
 */
export function mountTester(parent: HTMLElement, project: Project, step: number): void {
  const section = stepSection(
    step,
    'Test',
    'Type with your font. Letters you have not drawn yet show in the interface typeface.',
  );
  const sample = el('textarea', {
    class: 'tester__sample',
    id: 'tester-sample',
    rows: '3',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Sample text',
  });
  sample.value = DEFAULT_SAMPLE;
  const size = el('input', {
    class: 'tester__size',
    id: 'tester-size',
    type: 'range',
    min: '16',
    max: '160',
    value: '56',
  });
  const sizeValue = el('output', { class: 'tester__size-value', for: 'tester-size' });

  section.append(
    el('div', { class: 'tester' }, [
      el('div', { class: 'field field--inline' }, [
        el('label', { class: 'field__label', for: 'tester-size' }, ['Size']),
        size,
        sizeValue,
      ]),
      sample,
    ]),
  );

  const applySize = (): void => {
    sample.style.fontSize = `${size.value}px`;
    sizeValue.textContent = `${size.value} px`;
  };
  size.addEventListener('input', applySize);
  applySize();

  let current: FontFace | null = null;
  let generation = 0;
  const rebuild = async (): Promise<void> => {
    const run = ++generation;
    if (project.drawnCount() === 0) {
      if (current) document.fonts.delete(current);
      current = null;
      sample.style.fontFamily = '';
      return;
    }
    // A fresh family name per build makes the browser drop the previous face.
    const family = `glyph-preview-${run}`;
    const face = new FontFace(family, buildFont(project.allStrokes(), project.familyName).toArrayBuffer());
    try {
      await face.load();
    } catch {
      // The browser rejected the font. Keep showing the last one that worked.
      return;
    }
    if (run !== generation) return;
    document.fonts.add(face);
    if (current) document.fonts.delete(current);
    current = face;
    sample.style.fontFamily = `"${family}", var(--font-text)`;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  project.subscribe((char) => {
    if (char === null) return;
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), REBUILD_DELAY_MS);
  });
  void rebuild();
  parent.append(section);
}
