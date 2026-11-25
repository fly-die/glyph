type Attributes = Record<string, string>;

/** Small helper to build elements without a framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** A numbered step of the process sheet: big numeral, title, a line of guidance. */
export function stepSection(step: number, title: string, lead: string): HTMLElement {
  const id = `step-${title.toLowerCase()}`;
  return el('section', { class: 'step', 'aria-labelledby': id }, [
    el('header', { class: 'step__head' }, [
      el('span', { class: 'step__numeral', 'aria-hidden': 'true' }, [String(step).padStart(2, '0')]),
      el('div', {}, [el('h2', { class: 'step__title', id }, [title]), el('p', { class: 'step__lead' }, [lead])]),
    ]),
  ]);
}
