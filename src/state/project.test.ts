import { describe, expect, it } from 'vitest';
import type { Contour, Stroke } from '../outline';
import { parseProject, Project, serializeProject } from './project';

const first: Stroke = [
  { x: 10, y: 20, pressure: 0.5 },
  { x: 30, y: 40, pressure: 0.75 },
];
const second: Stroke = [{ x: 50, y: 60, pressure: 1 }];

describe('Project', () => {
  it('undoes only the most recent stroke of one glyph', () => {
    const project = new Project();
    project.addStroke('a', first);
    project.addStroke('a', second);
    project.addStroke('b', second);
    project.undo('a');
    expect(project.strokesOf('a')).toEqual([first]);
    expect(project.strokesOf('b')).toEqual([second]);
    project.undo('a');
    expect(project.drawnCount()).toBe(1);
  });

  it('resets every glyph, tells subscribers which ones and keeps the family name', () => {
    const project = new Project({
      familyName: 'Flynn Hand',
      glyphs: { a: [{ strokes: [first], traced: null }], b: [{ strokes: [second], traced: null }] },
      kerning: { ab: -20 },
    });
    const changed: string[] = [];
    project.subscribe((change) => changed.push(change.kind === 'glyph' ? change.char : change.kind));
    project.reset();
    expect(project.drawnCount()).toBe(0);
    expect(project.kerningOverride('ab')).toBeUndefined();
    expect(changed).toEqual(['a', 'b', 'kerning']);
    expect(project.familyName).toBe('Flynn Hand');
  });

  it('undoes and redoes the most recent strokes across the page', () => {
    const project = new Project();
    project.addStroke('a', first);
    project.addStroke('b', second);
    project.addStroke('a', second);
    expect(project.undoLast()).toBe('a');
    expect(project.undoLast()).toBe('b');
    expect(project.strokesOf('a')).toEqual([first]);
    expect(project.strokesOf('b')).toEqual([]);
    expect(project.redo()).toBe('b');
    expect(project.strokesOf('b')).toEqual([second]);
    project.addStroke('c', first);
    expect(project.redo()).toBeNull();
  });

  it('keeps the page order right when a single cell is undone or cleared', () => {
    const project = new Project();
    project.addStroke('x', first);
    project.addStroke('y', first);
    project.addStroke('x', second);
    project.undo('x');
    expect(project.undoLast()).toBe('y');
    project.clear('x');
    expect(project.undoLast()).toBeNull();
  });

  it('clears one glyph and leaves the others alone', () => {
    const project = new Project();
    project.addStroke('a', first);
    project.addStroke('b', second);
    project.clear('a');
    expect(project.strokesOf('a')).toEqual([]);
    expect(project.drawnCount()).toBe(1);
  });

  it('tells subscribers which glyph changed', () => {
    const project = new Project();
    const seen: string[] = [];
    const unsubscribe = project.subscribe((change) => seen.push(change.kind === 'glyph' ? change.char : change.kind));
    project.addStroke('a', first);
    project.setFamilyName('Hand');
    project.setKerningOverride('ab', -10);
    unsubscribe();
    project.clear('a');
    expect(seen).toEqual(['a', 'name', 'kerning']);
  });

  it('keeps up to three versions and only offers a new one after a filled one', () => {
    const project = new Project();
    expect(project.addVariant('a')).toBeNull();
    project.addStroke('a', first);
    expect(project.addVariant('a')).toBe(1);
    expect(project.addVariant('a')).toBeNull();
    project.addStroke('a', second, 1);
    expect(project.addVariant('a')).toBe(2);
    project.addStroke('a', first, 2);
    expect(project.addVariant('a')).toBeNull();
    expect(project.fontGlyphs().get('a')).toHaveLength(3);
    project.clear('a', 1);
    expect(project.variantsOf('a').map((v) => v.strokes)).toEqual([[first], [first]]);
  });

  it('leaves out characters whose main version is empty', () => {
    const project = new Project();
    project.addStroke('a', first);
    project.addVariant('a');
    project.addStroke('a', second, 1);
    project.clear('a', 0);
    expect(project.hasGlyph('a')).toBe(false);
    expect(project.fontGlyphs().has('a')).toBe(false);
  });

  it('takes glyphs from paper without overwriting drawn ones, and drawing replaces them', () => {
    const project = new Project();
    project.addStroke('b', first);
    const traced: Contour[] = [{ start: { x: 0, y: 0 }, segments: [{ c1: { x: 1, y: 0 }, c2: { x: 1, y: 1 }, to: { x: 0, y: 0 } }] }];
    const result = project.importTraced(new Map([['a', traced], ['b', traced]]));
    expect(result).toEqual({ imported: ['a'], kept: ['b'] });
    expect(project.tracedOf('a')).toEqual(traced);
    expect(project.strokesOf('b')).toEqual([first]);
    project.addStroke('a', second);
    expect(project.tracedOf('a')).toBeNull();
    expect(project.strokesOf('a')).toEqual([second]);
  });

  it('ignores empty strokes', () => {
    const project = new Project();
    project.addStroke('a', []);
    expect(project.drawnCount()).toBe(0);
  });
});

describe('saved projects', () => {
  it('survive a round trip', () => {
    const project = new Project();
    project.addStroke('a', first);
    project.addStroke('7', second);
    project.setFamilyName('Flynn Hand');
    const restored = new Project(parseProject(serializeProject(project.toData())) ?? undefined);
    expect(restored.familyName).toBe('Flynn Hand');
    expect(restored.strokesOf('a')).toEqual([first]);
    expect(restored.strokesOf('7')).toEqual([second]);
  });

  it('keep versions, glyphs from paper and spacing set by hand', () => {
    const traced: Contour[] = [
      { start: { x: 1, y: 2 }, segments: [{ c1: { x: 3, y: 4 }, c2: { x: 5, y: 6 }, to: { x: 1, y: 2 } }] },
    ];
    const project = new Project();
    project.addStroke('a', first);
    project.addVariant('a');
    project.addStroke('a', second, 1);
    project.importTraced(new Map([['b', traced]]));
    project.setKerningOverride('ab', -42);
    const restored = new Project(parseProject(serializeProject(project.toData())) ?? undefined);
    expect(restored.strokesOf('a', 1)).toEqual([second]);
    expect(restored.tracedOf('b')).toEqual(traced);
    expect(restored.kerningOverride('ab')).toBe(-42);
  });

  it('read projects saved before versions existed', () => {
    const old = JSON.stringify({ version: 1, familyName: 'Old', strokes: { a: [[[1, 2, 0.5]]] } });
    const restored = new Project(parseProject(old) ?? undefined);
    expect(restored.familyName).toBe('Old');
    expect(restored.strokesOf('a')).toEqual([[{ x: 1, y: 2, pressure: 0.5 }]]);
  });

  it('reject broken or foreign data instead of throwing', () => {
    expect(parseProject('not json')).toBeNull();
    expect(parseProject('{"version":3,"glyphs":{}}')).toBeNull();
    expect(parseProject('null')).toBeNull();
  });

  it('drop malformed points and unknown characters', () => {
    const json = JSON.stringify({
      version: 1,
      familyName: 'x',
      strokes: { a: [[[1, 2, 0.5], ['bad', 2, 3], [4, 5]]], '<script>': [[[1, 2, 0.5]]] },
    });
    expect(parseProject(json)?.glyphs).toEqual({ a: [{ strokes: [[{ x: 1, y: 2, pressure: 0.5 }]], traced: null }] });
  });
});
