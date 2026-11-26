import { CHARSET } from '../glyphs/charset';
import type { Contour, Stroke, StrokePoint } from '../outline';

/** Most versions one character can have. Typing rotates through them. */
export const MAX_VARIANTS = 3;

/**
 * One version of a character. Either drawn on screen (strokes) or read from a
 * photographed sheet (traced outlines in cell pixels). Drawing into a traced
 * version replaces the traced outline.
 */
export interface Variant {
  strokes: Stroke[];
  traced: Contour[] | null;
}

export interface ProjectData {
  familyName: string;
  /** Versions per character. The first one is the main glyph. */
  glyphs: Record<string, Variant[]>;
  /** Spacing set by hand, by pair of characters ("AV"), in font units. */
  kerning: Record<string, number>;
}

export type ProjectChange = { kind: 'glyph'; char: string } | { kind: 'name' } | { kind: 'kerning' };

type Listener = (change: ProjectChange) => void;

export function isFilled(variant: Variant | undefined): boolean {
  return !!variant && (variant.strokes.length > 0 || (variant.traced?.length ?? 0) > 0);
}

const emptyVariant = (): Variant => ({ strokes: [], traced: null });

/** Every glyph with its versions, the hand set spacing and the family name. Views subscribe to changes. */
export class Project {
  private readonly glyphs = new Map<string, Variant[]>();
  private readonly kerning = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  /** Where strokes were drawn, in order, for undo across the whole page. Not saved. */
  private history: { char: string; variant: number }[] = [];
  /** Strokes taken back by undo, most recent last, until something new is drawn. */
  private redoStack: { char: string; variant: number; stroke: Stroke }[] = [];
  private name: string;

  constructor(data?: ProjectData) {
    this.name = data?.familyName ?? '';
    for (const [char, variants] of Object.entries(data?.glyphs ?? {})) {
      const kept = variants.slice(0, MAX_VARIANTS).map((v) => ({ strokes: [...v.strokes], traced: v.traced }));
      if (kept.some(isFilled)) this.glyphs.set(char, kept);
    }
    for (const [pair, value] of Object.entries(data?.kerning ?? {})) this.kerning.set(pair, value);
  }

  get familyName(): string {
    return this.name;
  }

  setFamilyName(name: string): void {
    this.name = name;
    this.emit({ kind: 'name' });
  }

  /** All versions of a character, including an empty one that is just being started. */
  variantsOf(char: string): readonly Variant[] {
    return this.glyphs.get(char) ?? [];
  }

  strokesOf(char: string, variant = 0): readonly Stroke[] {
    return this.variantsOf(char)[variant]?.strokes ?? [];
  }

  tracedOf(char: string, variant = 0): readonly Contour[] | null {
    return this.variantsOf(char)[variant]?.traced ?? null;
  }

  /** A character counts as drawn when its main version has something in it. */
  hasGlyph(char: string): boolean {
    return isFilled(this.variantsOf(char)[0]);
  }

  drawnCount(): number {
    let count = 0;
    for (const char of this.glyphs.keys()) if (this.hasGlyph(char)) count++;
    return count;
  }

  /** Opens a new, empty version after the last filled one. Returns its index, or null when there is no room. */
  addVariant(char: string): number | null {
    const variants = this.ensure(char, 0);
    if (variants.length >= MAX_VARIANTS || !isFilled(variants[variants.length - 1])) return null;
    variants.push(emptyVariant());
    this.emit({ kind: 'glyph', char });
    return variants.length - 1;
  }

  addStroke(char: string, stroke: Stroke, variant = 0): void {
    if (stroke.length === 0) return;
    this.redoStack = [];
    this.push(char, variant, stroke);
  }

  /** Removes the most recent stroke of one version. */
  undo(char: string, variant = 0): void {
    const target = this.variantsOf(char)[variant];
    const last = target?.strokes[target.strokes.length - 1];
    if (!target || !last) return;
    target.strokes = target.strokes.slice(0, -1);
    for (let at = this.history.length - 1; at >= 0; at--) {
      const entry = this.history[at];
      if (entry?.char === char && entry.variant === variant) {
        this.history.splice(at, 1);
        break;
      }
    }
    this.redoStack.push({ char, variant, stroke: last });
    this.tidy(char);
    this.emit({ kind: 'glyph', char });
  }

  /**
   * Removes the most recent stroke on the whole page and returns its
   * character, or null when there is nothing to take back. Strokes drawn
   * before this visit have no order and are not undone this way.
   */
  undoLast(): string | null {
    const entry = this.history[this.history.length - 1];
    if (!entry) return null;
    this.undo(entry.char, entry.variant);
    return entry.char;
  }

  /** Puts back the stroke taken away last by undo. Returns its character, or null. */
  redo(): string | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.push(entry.char, entry.variant, entry.stroke);
    return entry.char;
  }

  /** Empties the main version, or removes an extra version entirely. */
  clear(char: string, variant = 0): void {
    const variants = this.glyphs.get(char);
    if (!variants || !variants[variant]) return;
    if (variant === 0) variants[0] = emptyVariant();
    else variants.splice(variant, 1);
    this.history = this.history.filter((entry) => entry.char !== char);
    this.redoStack = [];
    this.tidy(char);
    this.emit({ kind: 'glyph', char });
  }

  /** Replaces the strokes of one version, for the point editor. */
  replaceStrokes(char: string, variant: number, strokes: readonly Stroke[]): void {
    const target = this.ensure(char, variant)[variant] as Variant;
    target.strokes = [...strokes];
    target.traced = null;
    this.history = this.history.filter((entry) => entry.char !== char);
    this.redoStack = [];
    this.tidy(char);
    this.emit({ kind: 'glyph', char });
  }

  /** Replaces the traced outline of one version, for the point editor. */
  replaceTraced(char: string, variant: number, contours: readonly Contour[]): void {
    const target = this.ensure(char, variant)[variant] as Variant;
    target.strokes = [];
    target.traced = [...contours];
    this.tidy(char);
    this.emit({ kind: 'glyph', char });
  }

  /**
   * Takes over glyphs read from a sheet as main versions. Characters already
   * drawn on screen keep their drawing. Returns the characters taken over and
   * the ones skipped.
   */
  importTraced(glyphs: ReadonlyMap<string, readonly Contour[]>): { imported: string[]; kept: string[] } {
    const imported: string[] = [];
    const kept: string[] = [];
    for (const [char, contours] of glyphs) {
      if (this.strokesOf(char).length > 0) {
        kept.push(char);
        continue;
      }
      const variants = this.ensure(char, 0);
      variants[0] = { strokes: [], traced: [...contours] };
      imported.push(char);
    }
    for (const char of imported) this.emit({ kind: 'glyph', char });
    return { imported, kept };
  }

  kerningOverride(pair: string): number | undefined {
    return this.kerning.get(pair);
  }

  kerningOverrides(): ReadonlyMap<string, number> {
    return this.kerning;
  }

  /** Sets the spacing of a pair by hand, or hands it back to the automatic value with null. */
  setKerningOverride(pair: string, value: number | null): void {
    if (value === null) this.kerning.delete(pair);
    else this.kerning.set(pair, Math.round(value));
    this.emit({ kind: 'kerning' });
  }

  /** Removes every drawing and every hand set spacing. The family name stays. */
  reset(): void {
    const drawn = [...this.glyphs.keys()];
    this.glyphs.clear();
    this.kerning.clear();
    this.history = [];
    this.redoStack = [];
    for (const char of drawn) this.emit({ kind: 'glyph', char });
    this.emit({ kind: 'kerning' });
  }

  /** The glyphs that go into the font: characters with a main version, and their filled versions. */
  fontGlyphs(): Map<string, Variant[]> {
    const out = new Map<string, Variant[]>();
    for (const [char, variants] of this.glyphs) {
      if (isFilled(variants[0])) out.set(char, variants.filter(isFilled));
    }
    return out;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toData(): ProjectData {
    const glyphs: Record<string, Variant[]> = {};
    for (const [char, variants] of this.glyphs) {
      const filled = variants.filter(isFilled);
      if (filled.length > 0) glyphs[char] = filled;
    }
    return { familyName: this.name, glyphs, kerning: Object.fromEntries(this.kerning) };
  }

  private ensure(char: string, variant: number): Variant[] {
    const variants = this.glyphs.get(char) ?? [];
    while (variants.length <= variant && variants.length < MAX_VARIANTS) variants.push(emptyVariant());
    this.glyphs.set(char, variants);
    return variants;
  }

  private push(char: string, variant: number, stroke: Stroke): void {
    const target = this.ensure(char, variant)[variant];
    if (!target) return;
    // Drawing over a glyph from paper starts that version over.
    if (target.traced) {
      target.traced = null;
      target.strokes = [];
    }
    target.strokes = [...target.strokes, stroke];
    this.history.push({ char, variant });
    this.emit({ kind: 'glyph', char });
  }

  /** Drops trailing empty extra versions and characters with nothing left. */
  private tidy(char: string): void {
    const variants = this.glyphs.get(char);
    if (!variants) return;
    while (variants.length > 1 && !isFilled(variants[variants.length - 1])) variants.pop();
    if (!variants.some(isFilled)) this.glyphs.delete(char);
  }

  private emit(change: ProjectChange): void {
    for (const listener of this.listeners) listener(change);
  }
}

const round = (value: number): number => Math.round(value * 100) / 100;

function serializeContour(contour: Contour): number[] {
  return [
    round(contour.start.x),
    round(contour.start.y),
    ...contour.segments.flatMap(({ c1, c2, to }) => [c1.x, c1.y, c2.x, c2.y, to.x, to.y].map(round)),
  ];
}

export function serializeProject(data: ProjectData): string {
  const glyphs = Object.fromEntries(
    Object.entries(data.glyphs).map(([char, variants]) => [
      char,
      variants.map((variant) =>
        variant.traced
          ? { t: variant.traced.map(serializeContour) }
          : { s: variant.strokes.map((stroke) => stroke.map((p) => [round(p.x), round(p.y), round(p.pressure)])) },
      ),
    ]),
  );
  return JSON.stringify({ version: 2, familyName: data.familyName, glyphs, kerning: data.kerning });
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parsePoint(value: unknown): StrokePoint | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, pressure] = value as unknown[];
  if (!isNumber(x) || !isNumber(y) || !isNumber(pressure)) return null;
  return { x, y, pressure };
}

function parseStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((stroke: unknown) => {
    if (!Array.isArray(stroke)) return [];
    const points = stroke.flatMap((point: unknown) => parsePoint(point) ?? []);
    return points.length > 0 ? [points] : [];
  });
}

function parseContour(value: unknown): Contour | null {
  if (!Array.isArray(value) || value.length < 8 || (value.length - 2) % 6 !== 0 || !value.every(isNumber)) return null;
  const numbers = value as number[];
  const at = (index: number): { x: number; y: number } => ({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
  const segments = [];
  for (let index = 2; index < numbers.length; index += 6) {
    segments.push({ c1: at(index), c2: at(index + 2), to: at(index + 4) });
  }
  return { start: at(0), segments };
}

function parseVariant(value: unknown): Variant | null {
  if (typeof value !== 'object' || value === null) return null;
  const { s, t } = value as Record<string, unknown>;
  if (Array.isArray(t)) {
    const traced = t.flatMap((contour: unknown) => parseContour(contour) ?? []);
    return traced.length > 0 ? { strokes: [], traced } : null;
  }
  const strokes = parseStrokes(s);
  return strokes.length > 0 ? { strokes, traced: null } : null;
}

/**
 * Reads a saved project. Anything that does not have the expected shape is
 * dropped. Projects saved before versions existed (format 1) are read as
 * main versions.
 */
export function parseProject(json: string): ProjectData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const familyName = typeof record.familyName === 'string' ? record.familyName : '';
  const glyphs: Record<string, Variant[]> = {};

  if (record.version === 1 && typeof record.strokes === 'object' && record.strokes !== null) {
    for (const char of CHARSET) {
      const strokes = parseStrokes((record.strokes as Record<string, unknown>)[char]);
      if (strokes.length > 0) glyphs[char] = [{ strokes, traced: null }];
    }
    return { familyName, glyphs, kerning: {} };
  }

  if (record.version !== 2 || typeof record.glyphs !== 'object' || record.glyphs === null) return null;
  for (const char of CHARSET) {
    const list = (record.glyphs as Record<string, unknown>)[char];
    if (!Array.isArray(list)) continue;
    const variants = list.slice(0, MAX_VARIANTS).flatMap((v: unknown) => parseVariant(v) ?? []);
    if (variants.length > 0) glyphs[char] = variants;
  }
  const kerning: Record<string, number> = {};
  if (typeof record.kerning === 'object' && record.kerning !== null) {
    for (const [pair, value] of Object.entries(record.kerning as Record<string, unknown>)) {
      if ([...pair].length === 2 && [...pair].every((c) => CHARSET.includes(c)) && isNumber(value)) {
        kerning[pair] = Math.round(value);
      }
    }
  }
  return { familyName, glyphs, kerning };
}
