import { cellFor } from '../glyphs/charset';
import type { Project } from '../state/project';
import { el } from './dom';
import type { LiveFont } from './live-font';

const LIMIT = 200;
const MAX_PAIRS = 24;

/** Neighbouring characters in the text that both have a glyph, first appearance first. */
export function pairsIn(text: string, hasGlyph: (char: string) => boolean): string[] {
  const chars = [...text].map((char) => cellFor(char));
  const seen = new Set<string>();
  const pairs: string[] = [];
  for (let index = 1; index < chars.length; index++) {
    const left = chars[index - 1];
    const right = chars[index];
    if (!left || !right || !hasGlyph(left) || !hasGlyph(right)) continue;
    const pair = left + right;
    if (seen.has(pair)) continue;
    seen.add(pair);
    pairs.push(pair);
  }
  return pairs;
}

/**
 * Spacing by hand: the pairs in the sample text with their spacing, and a
 * slider for the chosen one. A pair set by hand stays that way until it is
 * handed back to the automatic value.
 */
export function mountSpacing(parent: HTMLElement, project: Project, liveFont: LiveFont, sample: HTMLTextAreaElement): void {
  const rows = el('div', { class: 'spacing__list', role: 'group', 'aria-label': 'Pairs in your text' });
  const preview = el('div', { class: 'spacing__preview', 'aria-hidden': 'true' });
  const previewLabel = el('p', { class: 'field__label', id: 'spacing-pair' });
  const slider = el('input', {
    class: 'spacing__slider',
    type: 'range',
    min: String(-LIMIT),
    max: String(LIMIT),
    step: '1',
    'aria-labelledby': 'spacing-pair',
  });
  const value = el('output', { class: 'tester__size-value' });
  const reset = el('button', { class: 'text-button', type: 'button' });
  const empty = el('p', { class: 'step__lead' }, ['Type a few letters you have drawn to adjust their spacing.']);
  const body = el('div', { class: 'spacing' }, [
    el('div', { class: 'spacing__pairs' }, [
      el('p', { class: 'field__label' }, ['Pairs in your text']),
      rows,
    ]),
    el('div', { class: 'spacing__pair' }, [
      previewLabel,
      preview,
      el('div', { class: 'spacing__control' }, [
        el('span', { class: 'field__label' }, ['Tighter']),
        slider,
        el('span', { class: 'field__label' }, ['Looser']),
        value,
      ]),
      el('div', {}, [reset]),
    ]),
  ]);
  parent.append(el('div', { class: 'spacing-block' }, [empty, body]));

  let selected: string | null = null;
  const valueOf = (pair: string): number => project.kerningOverride(pair) ?? liveFont.autoKerning().get(pair) ?? 0;

  const render = (): void => {
    const pairs = pairsIn(sample.value, (char) => project.hasGlyph(char)).slice(0, MAX_PAIRS);
    empty.hidden = pairs.length > 0;
    body.hidden = pairs.length === 0;
    if (pairs.length === 0) return;
    if (!selected || !pairs.includes(selected)) selected = pairs[0] ?? null;

    rows.replaceChildren(
      ...pairs.map((pair) => {
        const changed = project.kerningOverride(pair) !== undefined;
        const row = el('button', { class: 'spacing__row', type: 'button', 'aria-pressed': String(pair === selected) }, [
          el('span', { class: 'spacing__glyphs' }, [pair]),
          el('span', { class: 'spacing__value' }, [String(valueOf(pair))]),
          el('span', { class: 'spacing__state' }, [changed ? 'changed' : 'auto']),
        ]);
        row.addEventListener('click', () => {
          selected = pair;
          render();
        });
        return row;
      }),
    );

    const pair = selected ?? '';
    const current = valueOf(pair);
    const auto = liveFont.autoKerning().get(pair) ?? 0;
    previewLabel.textContent = `Pair ${pair}`;
    preview.textContent = pair;
    if (document.activeElement !== slider) slider.value = String(Math.max(-LIMIT, Math.min(LIMIT, current)));
    value.textContent = String(current);
    reset.textContent = `Back to automatic (${auto})`;
    reset.disabled = project.kerningOverride(pair) === undefined;
  };

  slider.addEventListener('input', () => {
    if (selected) project.setKerningOverride(selected, Number(slider.value));
  });
  reset.addEventListener('click', () => {
    if (selected) project.setKerningOverride(selected, null);
  });
  sample.addEventListener('input', render);
  project.subscribe((change) => {
    if (change.kind !== 'name') render();
  });
  liveFont.subscribe(render);
  render();
}
