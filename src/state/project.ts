import { CHARSET } from '../glyphs/charset';
import type { Stroke, StrokePoint } from '../outline';

export interface ProjectData {
  familyName: string;
  strokes: Record<string, Stroke[]>;
}

type Listener = (char: string | null) => void;

/** The strokes of every glyph plus the family name. Views subscribe to changes. */
export class Project {
  private readonly strokes = new Map<string, Stroke[]>();
  private readonly listeners = new Set<Listener>();
  private name: string;

  constructor(data?: ProjectData) {
    this.name = data?.familyName ?? '';
    for (const [char, strokes] of Object.entries(data?.strokes ?? {})) {
      if (strokes.length > 0) this.strokes.set(char, strokes);
    }
  }

  get familyName(): string {
    return this.name;
  }

  setFamilyName(name: string): void {
    this.name = name;
    this.emit(null);
  }

  strokesOf(char: string): readonly Stroke[] {
    return this.strokes.get(char) ?? [];
  }

  allStrokes(): ReadonlyMap<string, readonly Stroke[]> {
    return this.strokes;
  }

  drawnCount(): number {
    return this.strokes.size;
  }

  addStroke(char: string, stroke: Stroke): void {
    if (stroke.length === 0) return;
    this.strokes.set(char, [...this.strokesOf(char), stroke]);
    this.emit(char);
  }

  /** Removes the most recent stroke of one glyph. */
  undo(char: string): void {
    const remaining = this.strokesOf(char).slice(0, -1);
    if (remaining.length > 0) this.strokes.set(char, remaining);
    else this.strokes.delete(char);
    this.emit(char);
  }

  clear(char: string): void {
    this.strokes.delete(char);
    this.emit(char);
  }

  /** Calls `listener` with the changed character, or null when the name changed. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toData(): ProjectData {
    return { familyName: this.name, strokes: Object.fromEntries(this.strokes) };
  }

  private emit(char: string | null): void {
    for (const listener of this.listeners) listener(char);
  }
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function serializeProject(data: ProjectData): string {
  const strokes = Object.fromEntries(
    Object.entries(data.strokes).map(([char, list]) => [
      char,
      list.map((stroke) => stroke.map((p) => [round(p.x), round(p.y), round(p.pressure)])),
    ]),
  );
  return JSON.stringify({ version: 1, familyName: data.familyName, strokes });
}

function parsePoint(value: unknown): StrokePoint | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, pressure] = value as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof pressure !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(pressure)) return null;
  return { x, y, pressure };
}

/** Reads a saved project. Anything that does not have the expected shape is dropped. */
export function parseProject(json: string): ProjectData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { version, familyName, strokes } = raw as Record<string, unknown>;
  if (version !== 1 || typeof strokes !== 'object' || strokes === null) return null;

  const result: Record<string, Stroke[]> = {};
  for (const char of CHARSET) {
    const list = (strokes as Record<string, unknown>)[char];
    if (!Array.isArray(list)) continue;
    const parsed = list.flatMap((stroke: unknown) => {
      if (!Array.isArray(stroke)) return [];
      const points = stroke.flatMap((point: unknown) => parsePoint(point) ?? []);
      return points.length > 0 ? [points] : [];
    });
    if (parsed.length > 0) result[char] = parsed;
  }
  return { familyName: typeof familyName === 'string' ? familyName : '', strokes: result };
}
