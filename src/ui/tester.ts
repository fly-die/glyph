import './tester.css';
import { CHAR_GROUPS } from '../glyphs/charset';
import { el, stepSection, stepTitleId } from './dom';

const DEFAULT_SAMPLE = 'The quick brown fox jumps over the lazy dog. "Really?" (Yes!) 0123456789 & @';

/** Ready-made texts: one to read, one that shows every glyph the font can have. */
const SAMPLES: readonly { label: string; text: string }[] = [
  { label: 'Pangram', text: DEFAULT_SAMPLE },
  { label: 'Every character', text: CHAR_GROUPS.map((group) => group.chars.join(' ')).join('\n') },
];

/** The test step: sample text set in the live font, at a size you choose. */
export interface TesterView {
  section: HTMLElement;
  /** Id of the step heading, for links that jump to the tester. */
  titleId: string;
  sample: HTMLTextAreaElement;
}

export function mountTester(parent: HTMLElement, step: number): TesterView {
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

  const samples = SAMPLES.map(({ label, text }) => {
    const button = el('button', { class: 'text-button', type: 'button' }, [label]);
    button.addEventListener('click', () => {
      sample.value = text;
      // Tells everything that mirrors the sample text, as typing would.
      sample.dispatchEvent(new Event('input'));
    });
    return button;
  });

  section.append(
    el('div', { class: 'tester' }, [
      el('div', { class: 'tester__bar' }, [
        el('div', { class: 'field field--inline' }, [
          el('label', { class: 'field__label', for: 'tester-size' }, ['Size']),
          size,
          sizeValue,
        ]),
        el('div', { class: 'tester__samples' }, samples),
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
  return { section, titleId: stepTitleId('Test'), sample };
}
