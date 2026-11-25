import './dock.css';
import { cellFor, CHARSET } from '../glyphs/charset';
import type { Project } from '../state/project';
import { el } from './dom';
import type { TesterView } from './tester';

const MAX_CHARS = 140;

/**
 * A strip at the bottom of the window that sets the sample text in the font
 * while you draw, so every new letter shows up in context right away. Letters
 * that are not drawn yet stay faint. It steps aside once the type tester
 * itself is on screen.
 */
export function mountDock(root: HTMLElement, project: Project, tester: TesterView): void {
  const count = el('span', { class: 'dock__count' });
  // The same text is in the tester's field, so screen readers skip this copy.
  const line = el('p', { class: 'dock__line', 'aria-hidden': 'true' });
  const dock = el('aside', { class: 'dock', 'aria-label': 'Your font so far' }, [
    count,
    line,
    el('a', { class: 'dock__link', href: `#${tester.titleId}` }, ['Test it']),
  ]);

  let testerReached = false;

  const render = (): void => {
    const drawn = project.drawnCount();
    const visible = drawn > 0 && !testerReached;
    dock.classList.toggle('dock--visible', visible);
    dock.inert = !visible;
    count.textContent = `${drawn} / ${CHARSET.length}`;

    const text = tester.sample.value.replace(/\s+/g, ' ').trim();
    line.replaceChildren(
      ...[...text].slice(0, MAX_CHARS).map((char) => {
        const cell = cellFor(char);
        const inFont = char === ' ' || (cell !== null && project.strokesOf(cell).length > 0);
        return inFont ? char : el('span', { class: 'dock__missing' }, [char]);
      }),
    );
  };

  // Reached means the tester is on screen or already scrolled past. Measured on
  // scroll, because a jump straight past the tester never intersects it.
  let frame = 0;
  const measure = (): void => {
    frame = 0;
    const reached = tester.section.getBoundingClientRect().top < window.innerHeight;
    if (reached === testerReached) return;
    testerReached = reached;
    render();
  };
  const schedule = (): void => {
    frame ||= requestAnimationFrame(measure);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  project.subscribe(render);
  tester.sample.addEventListener('input', render);
  root.append(dock);
  render();
  measure();
}
