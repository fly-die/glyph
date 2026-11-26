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
import { buildGsubTable, type VariantSet } from './gsub';
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

/** One version of a character: drawn strokes, or outlines traced from paper in cell pixels. */
export interface GlyphVariant {
  strokes: readonly Stroke[];
  traced: readonly Contour[] | null;
}

export interface FontInput {
  familyName: string;
  /** Versions per character, the main one first. Only filled versions. */
  glyphs: ReadonlyMap<string, readonly GlyphVariant[]>;
  /** Spacing set by hand per pair of characters ("AV"). Wins over the automatic value. */
  kerning?: ReadonlyMap<string, number>;
}

export interface BuiltFont {
  file: ArrayBuffer;
  /** The automatic spacing per pair of characters, before hand set values. Pairs at zero are left out. */
  autoKerning: Map<string, number>;
}

/** Glyph name of a version: the main glyph keeps the plain name, the others get .alt1 and .alt2. */
function variantName(char: string, variant: number): string {
  return variant === 0 ? glyphName(char) : `${glyphName(char)}.alt${variant}`;
}

function variantContours(variant: GlyphVariant): { contours: Contour[]; winding: 'union' | 'nested' } {
  return variant.traced && variant.strokes.length === 0
    ? { contours: [...variant.traced], winding: 'nested' }
    : { contours: strokesToContours(variant.strokes, PEN_WIDTH), winding: 'union' };
}

/** Kerning for the main glyphs: the closest point of two neighbours gets the room of two side bearings. */
export function kerningFor(placed: readonly PlacedGlyph[], bearing: number): KernPair[] {
  return computeKerning(placed, { target: bearing * 2, bottom: DESCENDER, top: ASCENDER });
}

/**
 * Builds the finished .otf file: every version of every drawn character,
 * spacing from the stroke weight, automatic kerning with hand set pairs on
 * top, and rotation between versions while typing. Characters whose main
 * version is empty are left out. The space is a bit over half as wide as the n.
 */
export function buildFont(input: FontInput): BuiltFont {
  const strokesByChar = new Map<string, Stroke[]>();
  const tracedByChar = new Map<string, Contour[]>();
  for (const [char, variants] of input.glyphs) {
    strokesByChar.set(char, variants.flatMap((variant) => [...variant.strokes]));
    const traced = variants.flatMap((variant) => (variant.strokes.length === 0 ? [...(variant.traced ?? [])] : []));
    if (traced.length > 0) tracedByChar.set(char, traced);
  }
  const bearing = sideBearing(
    new Map([...strokesByChar].filter(([, strokes]) => strokes.length > 0)),
    tracedByChar,
  );

  const mains: Glyph[] = [];
  const alternates: Glyph[] = [];
  const placed: PlacedGlyph[] = [];
  const charOfName = new Map<string, string>();
  const versionNames = new Map<string, string[]>();
  let spaceWidth = FALLBACK_SPACE_WIDTH;

  for (const char of CHARSET) {
    const variants = input.glyphs.get(char) ?? [];
    const names: string[] = [];
    variants.forEach((variant, index) => {
      const { contours, winding } = variantContours(variant);
      const outline = toFontUnits(contours, bearing, winding);
      if (!outline || (index > 0 && names.length === 0)) return;
      const name = variantName(char, names.length);
      if (names.length === 0) {
        if (char === 'n') spaceWidth = Math.round(outline.advanceWidth * SPACE_PER_N);
        placed.push({ name, advanceWidth: outline.advanceWidth, contours: outline.contours });
        charOfName.set(name, char);
        mains.push(
          new Glyph({
            name,
            unicode: char.codePointAt(0) ?? 0,
            unicodes: codePoints(char),
            advanceWidth: outline.advanceWidth,
            path: toPath(outline.contours),
          }),
        );
      } else {
        alternates.push(new Glyph({ name, advanceWidth: outline.advanceWidth, path: toPath(outline.contours) }));
      }
      names.push(name);
    });
    if (names.length > 0) versionNames.set(char, names);
  }

  const space = new Glyph({ name: 'space', unicode: 32, advanceWidth: spaceWidth, path: new Path() });
  const family = sanitizeFamilyName(input.familyName);
  const font = new Font({
    familyName: family,
    styleName: 'Regular',
    // Without this opentype.js marks the font as Medium (500).
    weightClass: REGULAR_WEIGHT as unknown as string,
    postScriptName: `${family.replace(/ /g, '')}-Regular`,
    unitsPerEm: UNITS_PER_EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs: [notdefGlyph(), space, ...mains, ...alternates],
  });
  const glyphIds = new Map<string, number>();
  for (let index = 0; index < font.glyphs.length; index++) {
    const glyph = font.glyphs.get(index);
    if (glyph.name) glyphIds.set(glyph.name, index);
  }

  // Spacing: automatic values for the main glyphs, then pairs set by hand.
  const autoKerning = new Map<string, number>();
  for (const pair of kerningFor(placed, bearing)) {
    const left = charOfName.get(pair.left);
    const right = charOfName.get(pair.right);
    if (left && right) autoKerning.set(left + right, pair.value);
  }
  const chars = [...versionNames.keys()];
  const classOfChar = new Map(chars.map((char, index) => [char, index + 1]));
  const classes = new Map<number, number>();
  for (const [char, names] of versionNames) {
    for (const name of names) classes.set(glyphIds.get(name) ?? 0, classOfChar.get(char) ?? 0);
  }
  const values = chars.map((left) =>
    chars.map((right) => input.kerning?.get(left + right) ?? autoKerning.get(left + right) ?? 0),
  );

  const sets: VariantSet[] = [...versionNames.values()].map((names) => ({
    main: glyphIds.get(names[0] ?? '') ?? 0,
    alternates: names.slice(1).map((name) => glyphIds.get(name) ?? 0),
  }));
  const extra: Record<string, Uint8Array> = {};
  const gpos = buildGposTable(classes, values);
  if (gpos) extra.GPOS = gpos;
  const gsub = buildGsubTable(sets, font.glyphs.length);
  if (gsub) extra.GSUB = gsub;
  const otf = font.toArrayBuffer();
  return { file: Object.keys(extra).length > 0 ? addTables(otf, extra) : otf, autoKerning };
}

/** The .otf file for one version per character, drawn and traced glyphs given separately. For tests and simple callers. */
export function buildFontFile(
  strokesByChar: ReadonlyMap<string, readonly Stroke[]>,
  familyName: string,
  tracedByChar: ReadonlyMap<string, readonly Contour[]> = new Map(),
): ArrayBuffer {
  const glyphs = new Map<string, GlyphVariant[]>();
  for (const char of CHARSET) {
    const strokes = strokesByChar.get(char) ?? [];
    const traced = tracedByChar.get(char);
    if (strokes.length > 0) glyphs.set(char, [{ strokes, traced: null }]);
    else if (traced && traced.length > 0) glyphs.set(char, [{ strokes: [], traced }]);
  }
  return buildFont({ familyName, glyphs }).file;
}

export function fontFileName(familyName: string, extension: 'otf' | 'woff2' = 'otf'): string {
  return `${sanitizeFamilyName(familyName).replace(/ /g, '')}-Regular.${extension}`;
}
