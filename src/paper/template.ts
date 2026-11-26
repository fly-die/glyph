import { CHARSET } from '../glyphs/charset';
import { CELL } from '../glyphs/metrics';

/**
 * Geometry of the printable A4 sheet, in millimetres from the top left corner
 * of the page. One cell per character, in charset order, row by row. A cell
 * has the proportions of a drawing cell, so a photographed cell maps onto
 * CELL directly and both modes share every metric. The look of the sheet is
 * drawn elsewhere; this is only what the reader needs to find things.
 */
export const SHEET = {
  width: 210,
  height: 297,
  marker: {
    size: 10,
    /** The top left marker is a ring with a hole this wide. It tells which way up the sheet is. */
    hole: 5,
    /** Marker centres, clockwise from the top left. */
    centers: [
      { x: 15, y: 15 },
      { x: 195, y: 15 },
      { x: 195, y: 282 },
      { x: 15, y: 282 },
    ],
  },
  grid: {
    columns: 8,
    cellWidth: 20,
    cellHeight: 20 * (CELL.height / CELL.width),
    gap: 2,
    top: 30,
  },
} as const;

export interface SheetCell {
  char: string;
  /** Top left corner and size in millimetres. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function sheetCells(): SheetCell[] {
  const { columns, cellWidth, cellHeight, gap, top } = SHEET.grid;
  const left = (SHEET.width - (columns * cellWidth + (columns - 1) * gap)) / 2;
  return CHARSET.map((char, index) => ({
    char,
    x: left + (index % columns) * (cellWidth + gap),
    y: top + Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  }));
}
