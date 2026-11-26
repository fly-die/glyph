/**
 * Writes public/glyph-sheet.pdf, the printable sheet for paper mode, from the
 * same geometry the reader uses. Run after changing src/paper/template.ts or
 * src/paper/sheet.ts: npm run sheet. Needs Chrome; set CHROME to its binary
 * if it is not in the default macOS place.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sheetSvg } from '../src/paper/sheet';

const root = resolve(import.meta.dirname, '..');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const font = (path: string): string => pathToFileURL(join(root, 'node_modules', path)).href;

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
@font-face { font-family: 'Barlow Condensed'; font-weight: 600; src: url('${font('@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2')}'); }
@font-face { font-family: 'Hanken Grotesk Variable'; font-weight: 100 900; src: url('${font('@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2')}'); }
@page { size: A4; margin: 0; }
html, body { margin: 0; }
svg { display: block; }
</style></head><body>${sheetSvg()}</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'glyph-sheet-'));
const page = join(dir, 'sheet.html');
writeFileSync(page, html);
const out = join(root, 'public', 'glyph-sheet.pdf');
execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--user-data-dir=${join(dir, 'profile')}`,
  '--virtual-time-budget=3000',
  `--print-to-pdf=${out}`,
  pathToFileURL(page).href,
]);
console.log(`Wrote ${out}`);
