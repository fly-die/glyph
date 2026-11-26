import './grid.css';
import { CHAR_GROUPS, CHARSET } from '../glyphs/charset';
import type { Project } from '../state/project';
import type { CellSize, Settings } from '../state/settings';
import { el, stepSection } from '../ui/dom';
import { mountPaper } from '../paper/panel';
import { createCell, type EditGlyph } from './cell';

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

/**
 * Clears every drawing. The first click only asks, in place, so a slip of the
 * finger does not cost a whole alphabet.
 */
function clearAllControl(project: Project): HTMLElement {
  const clear = el('button', { class: 'text-button', type: 'button' });
  const cancel = el('button', { class: 'text-button', type: 'button' }, ['Keep them']);
  let asking = false;

  const update = (): void => {
    const drawn = project.drawnCount();
    if (drawn === 0) asking = false;
    clear.disabled = drawn === 0;
    clear.textContent = asking ? `Clear all ${drawn} drawings?` : 'Clear all';
    clear.classList.toggle('text-button--danger', asking);
    cancel.hidden = !asking;
  };
  clear.addEventListener('click', () => {
    if (asking) {
      asking = false;
      project.reset();
    } else {
      asking = true;
    }
    update();
  });
  cancel.addEventListener('click', () => {
    asking = false;
    update();
    clear.focus();
  });
  project.subscribe(update);
  update();
  return el('span', { class: 'clear-all' }, [clear, cancel]);
}

/** The draw step: one cell per glyph, grouped as on a type specimen. */
export function mountGrid(
  parent: HTMLElement,
  project: Project,
  settings: Settings,
  step: number,
  onEdit: EditGlyph,
): HTMLElement {
  const section = stepSection(
    step,
    'Draw',
    'One letter per cell. Sit letters on the solid line. Small letters reach the dashed line.',
  );
  const lead = section.querySelector('.step__lead');
  const DRAW_LEAD = lead?.textContent ?? '';
  const PAPER_LEAD = 'Draw each letter here, or write them on paper and take a photo.';
  const screen = el('div', { class: 'draw-screen' });
  const paper = el('div', { class: 'paper', hidden: '' });
  const modes = ([
    ['screen', 'Draw on screen'],
    ['paper', 'Write on paper'],
  ] as const).map(([value, label]) => {
    const input = el('input', { type: 'radio', name: 'draw-mode', value });
    input.checked = value === 'screen';
    input.addEventListener('change', () => setMode(value));
    return el('label', { class: 'segmented__option' }, [input, el('span', {}, [label])]);
  });
  const setMode = (mode: 'screen' | 'paper'): void => {
    screen.hidden = mode !== 'screen';
    paper.hidden = mode !== 'paper';
    for (const option of modes) {
      const input = option.querySelector('input');
      if (input) input.checked = input.value === mode;
    }
    if (lead) lead.textContent = mode === 'paper' ? PAPER_LEAD : DRAW_LEAD;
  };
  section.append(
    el('div', { class: 'segmented draw-mode', role: 'radiogroup', 'aria-label': 'How to make the letters' }, [
      el('div', { class: 'segmented__options' }, modes),
    ]),
    screen,
    paper,
  );

  const count = el('p', { class: 'step__status', 'aria-live': 'polite' });
  screen.append(
    el('div', { class: 'draw-bar' }, [
      count,
      el('div', { class: 'draw-bar__controls' }, [
        guideToggle(settings),
        sizeControl(settings),
        clearAllControl(project),
      ]),
    ]),
  );

  const groupCounts: (() => void)[] = [];
  for (const group of CHAR_GROUPS) {
    const groupCount = el('span', { class: 'group__count' });
    groupCounts.push(() => {
      const drawn = group.chars.filter((char) => project.hasGlyph(char)).length;
      groupCount.textContent = `${drawn} / ${group.chars.length}`;
      groupCount.classList.toggle('group__count--done', drawn === group.chars.length);
    });
    screen.append(
      el('h3', { class: 'group__title' }, [group.title, groupCount]),
      el(
        'div',
        { class: 'grid' },
        group.chars.map((char) => createCell(char, project, settings, onEdit)),
      ),
    );
  }

  const update = (): void => {
    count.textContent = `${project.drawnCount()} of ${CHARSET.length} drawn`;
    for (const updateGroup of groupCounts) updateGroup();
  };
  const applySize = (): void => {
    section.dataset.cellSize = settings.value.cellSize;
  };
  mountPaper(paper, project, (message) => {
    setMode('screen');
    count.textContent = message;
    section.scrollIntoView({ block: 'start' });
  });
  project.subscribe(update);
  settings.subscribe(applySize);
  update();
  applySize();
  parent.append(section);
  return section;
}
