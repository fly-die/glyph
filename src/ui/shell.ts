import type { Settings } from '../state/settings';
import { el } from './dom';
import { themeToggle } from './theme';

/** Page frame: header with the way back to the portfolio and the theme switch, main area, footer. */
export function mountShell(root: HTMLElement, settings: Settings): HTMLElement {
  const main = el('main', { class: 'page__main' });
  root.append(
    el('header', { class: 'page__header' }, [
      el('div', { class: 'page__bar' }, [
        el('a', { class: 'page__home', href: 'https://flynndiener.ch' }, ['flynndiener.ch']),
        el('span', { class: 'page__meta' }, ['Handwriting to font']),
        themeToggle(settings),
      ]),
      el('h1', { class: 'wordmark' }, ['glyph']),
      el('p', { class: 'page__intro' }, [
        'Draw your alphabet, one letter per cell, and get a font you can install and type with.',
      ]),
    ]),
    main,
    el('footer', { class: 'page__footer' }, [
      el('span', {}, ['Runs entirely in your browser.']),
      el('a', { href: 'https://github.com/fly-die/glyph' }, ['Source on GitHub']),
    ]),
  );
  return main;
}
