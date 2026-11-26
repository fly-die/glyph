import { describe, expect, it } from 'vitest';
import type { Stroke } from '../outline';
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
    const project = new Project({ familyName: 'Flynn Hand', strokes: { a: [first], b: [second] } });
    const changed: (string | null)[] = [];
    project.subscribe((char) => changed.push(char));
    project.reset();
    expect(project.drawnCount()).toBe(0);
    expect(changed).toEqual(['a', 'b']);
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
    const seen: (string | null)[] = [];
    const unsubscribe = project.subscribe((char) => seen.push(char));
    project.addStroke('a', first);
    project.setFamilyName('Hand');
    unsubscribe();
    project.clear('a');
    expect(seen).toEqual(['a', null]);
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

  it('reject broken or foreign data instead of throwing', () => {
    expect(parseProject('not json')).toBeNull();
    expect(parseProject('{"version":2,"strokes":{}}')).toBeNull();
    expect(parseProject('null')).toBeNull();
  });

  it('drop malformed points and unknown characters', () => {
    const json = JSON.stringify({
      version: 1,
      familyName: 'x',
      strokes: { a: [[[1, 2, 0.5], ['bad', 2, 3], [4, 5]]], '<script>': [[[1, 2, 0.5]]] },
    });
    expect(parseProject(json)?.strokes).toEqual({ a: [[{ x: 1, y: 2, pressure: 0.5 }]] });
  });
});
