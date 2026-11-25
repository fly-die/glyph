import { Font, Glyph, Path } from 'opentype.js';
import { CHARSET, codePoints, glyphName } from '../glyphs/charset';
import {
  ASCENDER,
  DESCENDER,
  FALLBACK_SPACE_WIDTH,
  PEN_WIDTH,
  UNITS_PER_EM,
} from '../glyphs/metrics';
import { toFontUnits } from '../glyphs/normalize';
import { sideBearing } from '../glyphs/spacing';
import { strokesToContours, type Contour, type Stroke } from '../outline';

export const DEFAULT_FAMILY_NAME = 'My Hand';
const MAX_FAMILY_NAME_LENGTH = 40;

/**
 * Font menus and the PostScript name only take plain ASCII reliably, so the
 * family name is reduced to letters, digits, spaces and hyphens.
 */
export function sanitizeFamilyName(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FAMILY_NAME_LENGTH)
    .trim();
  return cleaned || DEFAULT_FAMILY_NAME;
}

function toPath(contours: readonly Contour[]): Path {
  const path = new Path();
  for (const contour of contours) {
    path.moveTo(contour.start.x, contour.start.y);
    for (const { c1, c2, to } of contour.segments) {
      path.curveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
    }
    path.close();
  }
  return path;
}

/** The box shown for characters the font does not cover. */
function notdefGlyph(): Glyph {
  const path = new Path();
  const rect = (x0: number, y0: number, x1: number, y1: number, clockwise: boolean): void => {
    const corners: [number, number][] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    if (clockwise) corners.reverse();
    corners.forEach(([x, y], index) => (index === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
    path.close();
  };
  rect(50, 0, 450, 700, false);
  rect(100, 50, 400, 650, true);
  return new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path });
}

/**
 * Builds an OpenType font from the drawn strokes. Characters without strokes
 * are left out. The space is as wide as the 'n'. Side bearings follow the
 * stroke weight of the whole font.
 */
export function buildFont(strokesByChar: ReadonlyMap<string, readonly Stroke[]>, familyName: string): Font {
  const glyphs: Glyph[] = [];
  let spaceWidth = FALLBACK_SPACE_WIDTH;
  const bearing = sideBearing(strokesByChar);

  for (const char of CHARSET) {
    const outline = toFontUnits(strokesToContours(strokesByChar.get(char) ?? [], PEN_WIDTH), bearing);
    if (!outline) continue;
    if (char === 'n') spaceWidth = outline.advanceWidth;
    glyphs.push(
      new Glyph({
        name: glyphName(char),
        unicode: char.codePointAt(0) ?? 0,
        unicodes: codePoints(char),
        advanceWidth: outline.advanceWidth,
        path: toPath(outline.contours),
      }),
    );
  }

  const space = new Glyph({ name: 'space', unicode: 32, advanceWidth: spaceWidth, path: new Path() });
  const family = sanitizeFamilyName(familyName);
  return new Font({
    familyName: family,
    styleName: 'Regular',
    postScriptName: `${family.replace(/ /g, '')}-Regular`,
    unitsPerEm: UNITS_PER_EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs: [notdefGlyph(), space, ...glyphs],
  });
}

export function fontFileName(familyName: string, extension: 'otf' | 'woff2' = 'otf'): string {
  return `${sanitizeFamilyName(familyName).replace(/ /g, '')}-Regular.${extension}`;
}
