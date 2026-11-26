import { CELL } from '../glyphs/metrics';
import { SHEET, sheetCells } from './template';

/** Print colours. Guides and labels are light enough that the reader drops them as paper. */
const INK = '#111111';
const BORDER = '#c4c4c4';
const GUIDE = '#c9c9c9';
const BASELINE = '#b9b9b9';
const LABEL = '#bdbdbd';
const NOTE = '#666666';

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The printable sheet as SVG in millimetres: corner markers, a title, and a
 * cell per character with guides at the same heights as a drawing cell.
 * Drawn from the same geometry the reader uses.
 */
export function sheetSvg(): string {
  const parts: string[] = [];
  const { size, hole, centers } = SHEET.marker;
  centers.forEach((center, index) => {
    parts.push(`<rect x="${center.x - size / 2}" y="${center.y - size / 2}" width="${size}" height="${size}" fill="${INK}"/>`);
    if (index === 0) {
      parts.push(`<rect x="${center.x - hole / 2}" y="${center.y - hole / 2}" width="${hole}" height="${hole}" fill="#ffffff"/>`);
    }
  });
  parts.push(
    `<text x="${SHEET.width / 2}" y="17" text-anchor="middle" font-family="Barlow Condensed" font-weight="600" font-size="7" fill="${INK}">GLYPH SHEET</text>`,
    `<text x="${SHEET.width / 2}" y="23.5" text-anchor="middle" font-family="Hanken Grotesk Variable, Hanken Grotesk, sans-serif" font-size="3.2" fill="${NOTE}">One character per cell. Dark pen. Sit letters on the solid line, small letters reach the dashed one.</text>`,
  );
  for (const cell of sheetCells()) {
    const xHeight = cell.y + cell.height * (CELL.xHeight / CELL.height);
    const baseline = cell.y + cell.height * (CELL.baseline / CELL.height);
    parts.push(
      `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" fill="none" stroke="${BORDER}" stroke-width="0.25"/>`,
      `<line x1="${cell.x}" y1="${xHeight}" x2="${cell.x + cell.width}" y2="${xHeight}" stroke="${GUIDE}" stroke-width="0.22" stroke-dasharray="0.8 0.8"/>`,
      `<line x1="${cell.x}" y1="${baseline}" x2="${cell.x + cell.width}" y2="${baseline}" stroke="${BASELINE}" stroke-width="0.3"/>`,
      `<text x="${cell.x + 1.2}" y="${cell.y + 3.6}" font-family="Barlow Condensed" font-weight="600" font-size="3.2" fill="${LABEL}">${escape(cell.char)}</text>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.width}mm" height="${SHEET.height}mm" viewBox="0 0 ${SHEET.width} ${SHEET.height}">${parts.join('')}</svg>`;
}
