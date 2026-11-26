import { Font, Glyph, Path } from 'opentype.js';
import { CHARSET, codePoints, glyphName } from '../glyphs/charset';
import {
  ASCENDER,
  DESCENDER,
  FALLBACK_SPACE_WIDTH,
  PEN_WIDTH,
  SPACE_PER_N,
  UNITS_PER_EM,
} from '../glyphs/metrics';
import { toFontUnits } from '../glyphs/normalize';
import { sideBearing } from '../glyphs/spacing';
import { strokesToContours, type Contour, type Stroke } from '../outline';
import { buildGposTable } from './gpos';
import { computeKerning, type KernPair, type PlacedGlyph } from './kerning';
import { addTables } from './sfnt';

export const DEFAULT_FAMILY_NAME = 'My Hand';
const MAX_FAMILY_NAME_LENGTH = 40;
/** usWeightClass of a regular font. The opentype.js types ask for a string, the writer needs the number. */
const REGULAR_WEIGHT = 400;

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

interface AssembledFont {
  font: Font;
  /** Drawn glyphs as placed in the font, for kerning. */
  placed: PlacedGlyph[];
  sideBearing: number;
}

/**
 * Builds an OpenType font from the drawn strokes. Characters without strokes
 * are left out. The space is a bit over half as wide as the 'n'. Side
 * bearings follow the stroke weight of the whole font.
 */
function assemble(
  strokesByChar: ReadonlyMap<string, readonly Stroke[]>,
  familyName: string,
  tracedByChar: ReadonlyMap<string, readonly Contour[]>,
): AssembledFont {
  const glyphs: Glyph[] = [];
  const placed: PlacedGlyph[] = [];
  let spaceWidth = FALLBACK_SPACE_WIDTH;
  const bearing = sideBearing(strokesByChar, tracedByChar);

  for (const char of CHARSET) {
    // A drawn glyph wins over a traced one for the same character.
    const strokes = strokesByChar.get(char) ?? [];
    const traced = tracedByChar.get(char) ?? [];
    const outline =
      strokes.length > 0
        ? toFontUnits(strokesToContours(strokes, PEN_WIDTH), bearing)
        : toFontUnits(traced, bearing, 'nested');
    if (!outline) continue;
    if (char === 'n') spaceWidth = Math.round(outline.advanceWidth * SPACE_PER_N);
    const name = glyphName(char);
    placed.push({ name, advanceWidth: outline.advanceWidth, contours: outline.contours });
    glyphs.push(
      new Glyph({
        name,
        unicode: char.codePointAt(0) ?? 0,
        unicodes: codePoints(char),
        advanceWidth: outline.advanceWidth,
        path: toPath(outline.contours),
      }),
    );
  }

  const space = new Glyph({ name: 'space', unicode: 32, advanceWidth: spaceWidth, path: new Path() });
  const family = sanitizeFamilyName(familyName);
  const font = new Font({
    familyName: family,
    styleName: 'Regular',
    // Without this opentype.js marks the font as Medium (500).
    weightClass: REGULAR_WEIGHT as unknown as string,
    postScriptName: `${family.replace(/ /g, '')}-Regular`,
    unitsPerEm: UNITS_PER_EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs: [notdefGlyph(), space, ...glyphs],
  });
  return { font, placed, sideBearing: bearing };
}

/** Kerning for the drawn glyphs: the closest point of two neighbours gets the room of two side bearings. */
export function kerningFor(placed: readonly PlacedGlyph[], bearing: number): KernPair[] {
  return computeKerning(placed, { target: bearing * 2, bottom: DESCENDER, top: ASCENDER });
}

/**
 * The finished .otf file, with automatic kerning. `tracedByChar` holds glyphs
 * read from a photographed sheet, as outlines in cell pixels.
 */
export function buildFontFile(
  strokesByChar: ReadonlyMap<string, readonly Stroke[]>,
  familyName: string,
  tracedByChar: ReadonlyMap<string, readonly Contour[]> = new Map(),
): ArrayBuffer {
  const { font, placed, sideBearing: bearing } = assemble(strokesByChar, familyName, tracedByChar);
  const otf = font.toArrayBuffer();
  const glyphIds = new Map<string, number>();
  for (let index = 0; index < font.glyphs.length; index++) {
    const glyph = font.glyphs.get(index);
    if (glyph.name) glyphIds.set(glyph.name, index);
  }
  const gpos = buildGposTable(kerningFor(placed, bearing), glyphIds);
  return gpos ? addTables(otf, { GPOS: gpos }) : otf;
}

export function fontFileName(familyName: string, extension: 'otf' | 'woff2' = 'otf'): string {
  return `${sanitizeFamilyName(familyName).replace(/ /g, '')}-Regular.${extension}`;
}
