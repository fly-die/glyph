import './export.css';
import { buildFont, DEFAULT_FAMILY_NAME, fontFileName, sanitizeFamilyName } from '../font/build';
import { downloadFile } from '../font/download';
import { toWoff2 } from '../font/woff2';
import type { Project } from '../state/project';
import { el, stepSection } from './dom';

function fontFile(project: Project): ArrayBuffer {
  return buildFont({
    familyName: project.familyName,
    glyphs: project.fontGlyphs(),
    kerning: project.kerningOverrides(),
  }).file;
}

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
  const status = el('p', { class: 'step__status step__status--plain', 'aria-live': 'polite' });

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
  /** What the last download did. Shown until the font changes again. */
  let note: string | null = null;

  const update = (): void => {
    const drawn = project.drawnCount();
    button.disabled = drawn === 0;
    webButton.disabled = drawn === 0 || compressing;
    const summary = `${fontFileName(project.familyName)}, ${drawn} ${drawn === 1 ? 'glyph' : 'glyphs'} plus space.`;
    if (drawn === 0) status.textContent = 'Draw at least one letter to export.';
    else if (compressing) status.textContent = 'Compressing for the web...';
    else status.textContent = note ?? summary;
  };

  input.addEventListener('input', () => project.setFamilyName(input.value));
  input.addEventListener('blur', () => {
    if (input.value.trim() !== '') input.value = sanitizeFamilyName(input.value);
  });
  button.addEventListener('click', () => {
    const fileName = fontFileName(project.familyName);
    downloadFile(fontFile(project), fileName, 'font/otf');
    note = `Downloaded ${fileName}. Open the file and choose Install.`;
    update();
  });
  webButton.addEventListener('click', () => {
    compressing = true;
    update();
    const fileName = fontFileName(project.familyName, 'woff2');
    const otf = fontFile(project);
    toWoff2(otf)
      .then((woff2) => {
        downloadFile(woff2, fileName, 'font/woff2');
        note = `Downloaded ${fileName}. Load it on your site with @font-face.`;
      })
      .catch((error: unknown) => {
        console.error(error);
        note = 'Could not write the .woff2. The .otf still works.';
      })
      .finally(() => {
        compressing = false;
        update();
      });
  });
  project.subscribe(() => {
    note = null;
    update();
  });
  update();
  parent.append(section);
}
