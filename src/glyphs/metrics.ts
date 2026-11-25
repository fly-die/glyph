/**
 * Geometry shared by the drawing cells and the font.
 *
 * A cell is drawn in its own pixel space, y pointing down. The two guides fix
 * the scale: the distance from the x-height guide to the baseline becomes
 * X_HEIGHT_UNITS font units. That one scale is used for every glyph, so a
 * small letter stays small next to a tall one.
 */
export const CELL = {
  width: 200,
  height: 224,
  baseline: 160,
  xHeight: 80,
} as const;

export const UNITS_PER_EM = 1000;
export const X_HEIGHT_UNITS = 500;
export const UNITS_PER_CELL_PIXEL = X_HEIGHT_UNITS / (CELL.baseline - CELL.xHeight);

/** Top and bottom edge of the cell in font units. */
export const ASCENDER = Math.round(CELL.baseline * UNITS_PER_CELL_PIXEL);
export const DESCENDER = -Math.round((CELL.height - CELL.baseline) * UNITS_PER_CELL_PIXEL);

/** Nominal pen width in cell pixels, at pressure 0.5. */
export const PEN_WIDTH = 12;

/**
 * White space on each side of a glyph as a share of the font's stem width.
 * Heavier writing gets more room, so the colour of a line stays even.
 */
export const SIDE_BEARING_PER_STEM = 0.6;

/** Width of the space when no 'n' has been drawn yet. */
export const FALLBACK_SPACE_WIDTH = 320;
