import './theme.css';
import type { Settings, Theme } from '../state/settings';
import { el } from './dom';

export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SPILL_MS = 700;
const BLOT_POINTS = 40;

/** The theme to show: the visitor's own choice, or what their system asks for. */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

/**
 * The outline of an ink blot around a point, as a CSS polygon. The edge
 * wobbles, the same way at every size, so growing `radius` from zero reads as
 * ink spreading. The wobble never pulls the edge inside `radius`.
 */
export function blotPolygon(x: number, y: number, radius: number): string {
  const points = Array.from({ length: BLOT_POINTS }, (_, index) => {
    const angle = (index / BLOT_POINTS) * Math.PI * 2;
    const wobble = 1.16 + 0.09 * Math.sin(3 * angle + 1) + 0.05 * Math.sin(7 * angle + 2) + 0.02 * Math.sin(13 * angle);
    const px = x + Math.cos(angle) * radius * wobble;
    const py = y + Math.sin(angle) * radius * wobble;
    return `${px.toFixed(1)}px ${py.toFixed(1)}px`;
  });
  return `polygon(${points.join(', ')})`;
}

function currentTheme(settings: Settings): ResolvedTheme {
  return resolveTheme(settings.value.theme, window.matchMedia(DARK_QUERY).matches);
}

/**
 * Keeps the page in the chosen theme. Call this before anything that paints
 * with tokens subscribes to the settings, so the tokens are already switched
 * when those views redraw.
 */
export function mountTheme(settings: Settings): void {
  const root = document.documentElement;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const apply = (): void => {
    root.dataset.theme = currentTheme(settings);
    if (themeColor) themeColor.content = getComputedStyle(root).getPropertyValue('--color-ground').trim();
  };
  settings.subscribe(apply);
  // An empty update makes every view that paints with tokens redraw.
  window.matchMedia(DARK_QUERY).addEventListener('change', () => settings.update({}));
  apply();
}

/** Runs `change` and lets the new look spread from `origin` like spilled ink. */
function spill(origin: HTMLElement, change: () => void): void {
  if (!('startViewTransition' in document) || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    change();
    return;
  }
  const box = origin.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(change);
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [blotPolygon(x, y, 0), blotPolygon(x, y, reach)] },
        { duration: SPILL_MS, easing: 'cubic-bezier(0.55, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
}

/** The theme switch: a drop of ink in the header, filled in the light theme, hollow in the dark one. */
export function themeToggle(settings: Settings): HTMLElement {
  const button = el('button', { class: 'ink-toggle', type: 'button', 'aria-label': 'Dark mode', title: 'Dark mode' }, [
    el('span', { class: 'ink-toggle__blot', 'aria-hidden': 'true' }),
  ]);
  const update = (): void => {
    button.setAttribute('aria-pressed', String(currentTheme(settings) === 'dark'));
  };
  button.addEventListener('click', () => {
    const next = currentTheme(settings) === 'dark' ? 'light' : 'dark';
    spill(button, () => settings.update({ theme: next }));
  });
  settings.subscribe(update);
  update();
  return button;
}
