/** Reads a design token from the page, for code that paints on a canvas. */
export function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
