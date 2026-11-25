import './grid.css';
import { CHAR_GROUPS, CHARSET } from '../glyphs/charset';
import type { Project } from '../state/project';
import type { CellSize, Settings } from '../state/settings';
import { el, stepSection } from '../ui/dom';
import { createCell } from './cell';

const CELL_SIZES: readonly { value: CellSize; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'large', label: 'Large' },
];

function guideToggle(settings: Settings): HTMLElement {
  const input = el('input', { type: 'checkbox' });
  input.checked = settings.value.guideLetters;
  input.addEventListener('change', () => settings.update({ guideLetters: input.checked }));
  return el('label', { class: 'check' }, [input, 'Guide letters']);
}

function sizeControl(settings: Settings): HTMLElement {
  const options = CELL_SIZES.map(({ value, label }) => {
    const input = el('input', { type: 'radio', name: 'cell-size', value });
    input.checked = settings.value.cellSize === value;
    input.addEventListener('change', () => settings.update({ cellSize: value }));
    return el('label', { class: 'segmented__option' }, [input, el('span', {}, [label])]);
  });
  return el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'cell-size-label' }, [
    el('span', { id: 'cell-size-label' }, ['Cell size']),
    el('div', { class: 'segmented__options' }, options),
  ]);
}

/** The draw step: one cell per glyph, grouped as on a type specimen. */
export function mountGrid(parent: HTMLElement, project: Project, settings: Settings, step: number): void {
  const section = stepSection(
    step,
    'Draw',
    'One letter per cell. Sit letters on the solid line. Small letters reach the dashed line.',
  );
  const count = el('p', { class: 'step__status', 'aria-live': 'polite' });
  section.append(
    el('div', { class: 'draw-bar' }, [
      count,
      el('div', { class: 'draw-bar__controls' }, [guideToggle(settings), sizeControl(settings)]),
    ]),
  );

  for (const group of CHAR_GROUPS) {
    section.append(
      el('h3', { class: 'group__title' }, [group.title]),
      el(
        'div',
        { class: 'grid' },
        group.chars.map((char) => createCell(char, project, settings)),
      ),
    );
  }

  const update = (): void => {
    count.textContent = `${project.drawnCount()} of ${CHARSET.length} drawn`;
  };
  const applySize = (): void => {
    section.dataset.cellSize = settings.value.cellSize;
  };
  project.subscribe(update);
  settings.subscribe(applySize);
  update();
  applySize();
  parent.append(section);
}
