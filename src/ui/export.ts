import './export.css';
import { buildFont, DEFAULT_FAMILY_NAME, fontFileName, sanitizeFamilyName } from '../font/build';
import { downloadFile } from '../font/download';
import type { Project } from '../state/project';
import { el, stepSection } from './dom';

/** The export step: name the family and download the .otf. */
export function mountExport(parent: HTMLElement, project: Project, step: number): void {
  const section = stepSection(step, 'Export', 'Name your font and download it. Open the file to install it.');
  const input = el('input', {
    class: 'field__input',
    id: 'family-name',
    type: 'text',
    maxlength: '40',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: DEFAULT_FAMILY_NAME,
  });
  input.value = project.familyName;
  const button = el('button', { class: 'button', type: 'button' }, ['Download .otf']);
  const status = el('p', { class: 'step__status', 'aria-live': 'polite' });

  section.append(
    el('div', { class: 'export' }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'family-name' }, ['Family name']),
        input,
      ]),
      button,
    ]),
    status,
  );

  const update = (): void => {
    const drawn = project.drawnCount();
    button.disabled = drawn === 0;
    status.textContent =
      drawn === 0
        ? 'Draw at least one letter to export.'
        : `${fontFileName(project.familyName)}, ${drawn} ${drawn === 1 ? 'glyph' : 'glyphs'} plus space.`;
  };

  input.addEventListener('input', () => project.setFamilyName(input.value));
  input.addEventListener('blur', () => {
    if (input.value.trim() !== '') input.value = sanitizeFamilyName(input.value);
  });
  button.addEventListener('click', () => {
    const font = buildFont(project.allStrokes(), project.familyName);
    downloadFile(font.toArrayBuffer(), fontFileName(project.familyName), 'font/otf');
  });
  project.subscribe(update);
  update();
  parent.append(section);
}
