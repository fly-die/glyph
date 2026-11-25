import { buildFont } from '../font/build';
import type { Project } from '../state/project';

const REBUILD_DELAY_MS = 200;
const PROPERTY = '--font-user';

/**
 * Keeps the drawn font loaded in the page. The font is rebuilt as you draw and
 * registered through the FontFace API, and its family name is published as
 * the `--font-user` custom property. Anything set in `var(--font-user)` shows
 * the real font, not a preview. Characters that are not drawn yet fall
 * through to the next family in the list.
 */
export function mountLiveFont(project: Project): void {
  const root = document.documentElement;
  let current: FontFace | null = null;
  let generation = 0;

  const rebuild = async (): Promise<void> => {
    const run = ++generation;
    if (project.drawnCount() === 0) {
      if (current) document.fonts.delete(current);
      current = null;
      root.style.removeProperty(PROPERTY);
      return;
    }
    // A fresh family name per build makes the browser drop the previous face.
    const family = `glyph-preview-${run}`;
    const face = new FontFace(family, buildFont(project.allStrokes(), project.familyName).toArrayBuffer());
    try {
      await face.load();
    } catch {
      // The browser rejected the font. Keep showing the last one that worked.
      return;
    }
    if (run !== generation) return;
    document.fonts.add(face);
    if (current) document.fonts.delete(current);
    current = face;
    root.style.setProperty(PROPERTY, `"${family}"`);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  project.subscribe((char) => {
    if (char === null) return;
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), REBUILD_DELAY_MS);
  });
  void rebuild();
}
