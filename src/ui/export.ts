import './export.css';
import { buildFont, DEFAULT_FAMILY_NAME, fontFileName, sanitizeFamilyName } from '../font/build';
import { downloadFile } from '../font/download';
import { toWoff2 } from '../font/woff2';
import type { Project } from '../state/project';
import { el, stepSection } from './dom';

/**
 * The export step: name the family and download the font. The .otf is for
 * installing, the .woff2 for using the font on a website.
 */
export function mountExport(parent: HTMLElement, project: Project, step: number): void {
  const section = stepSection(
    step,
    'Export',
    'Name your font and download it. Open the .otf to install it. The .woff2 is for websites.',
  );
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
  const webButton = el('button', { class: 'button button--secondary', type: 'button' }, [
    'Download .woff2 for the web',
  ]);
  const status = el('p', { class: 'step__status', 'aria-live': 'polite' });

  section.append(
    el('div', { class: 'export' }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'family-name' }, ['Family name']),
        input,
      ]),
      el('div', { class: 'export__buttons' }, [button, webButton]),
    ]),
    status,
  );

  let compressing = false;
  const update = (): void => {
    const drawn = project.drawnCount();
    button.disabled = drawn === 0;
    webButton.disabled = drawn === 0 || compressing;
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
  webButton.addEventListener('click', () => {
    compressing = true;
    update();
    status.textContent = 'Compressing for the web...';
    const otf = buildFont(project.allStrokes(), project.familyName).toArrayBuffer();
    toWoff2(otf)
      .then((woff2) => {
        downloadFile(woff2, fontFileName(project.familyName, 'woff2'), 'font/woff2');
        compressing = false;
        update();
      })
      .catch((error: unknown) => {
        console.error(error);
        compressing = false;
        update();
        status.textContent = 'Could not write the .woff2. The .otf still works.';
      });
  });
  project.subscribe(update);
  update();
  parent.append(section);
}
