import './tester.css';
import { el, stepSection } from './dom';

const DEFAULT_SAMPLE = 'The quick brown fox jumps over the lazy dog. "Really?" (Yes!) 0123456789 & @';

/** The test step: sample text set in the live font, at a size you choose. */
export function mountTester(parent: HTMLElement, step: number): void {
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

  parent.append(section);
}
