import './grid.css';
import { CHAR_GROUPS, CHARSET } from '../glyphs/charset';
import type { Project } from '../state/project';
import { el, stepSection } from '../ui/dom';
import { createCell } from './cell';

/** The draw step: one cell per glyph, grouped as on a type specimen. */
export function mountGrid(parent: HTMLElement, project: Project, step: number): void {
  const section = stepSection(
    step,
    'Draw',
    'One letter per cell. Sit letters on the solid line. Small letters reach the dashed line.',
  );
  const count = el('p', { class: 'step__status', 'aria-live': 'polite' });
  section.append(count);

  for (const group of CHAR_GROUPS) {
    section.append(
      el('h3', { class: 'group__title' }, [group.title]),
      el(
        'div',
        { class: 'grid' },
        group.chars.map((char) => createCell(char, project)),
      ),
    );
  }

  const update = (): void => {
    count.textContent = `${project.drawnCount()} of ${CHARSET.length} drawn`;
  };
  project.subscribe(update);
  update();
  parent.append(section);
}
