import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, Settings } from './settings';

describe('parseSettings', () => {
  it('reads back what was saved', () => {
    const saved = JSON.stringify({ guideLetters: false, cellSize: 'large', theme: 'dark' });
    expect(parseSettings(saved)).toEqual({ guideLetters: false, cellSize: 'large', theme: 'dark' });
  });

  it('falls back to the defaults for missing, broken or unknown values', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"guideLetters":"yes","cellSize":"huge","theme":"neon"}')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Settings', () => {
  it('merges an update and tells subscribers', () => {
    const settings = new Settings();
    let calls = 0;
    settings.subscribe(() => calls++);
    settings.update({ cellSize: 'large' });
    expect(settings.value).toEqual({ guideLetters: true, cellSize: 'large', theme: 'system' });
    expect(calls).toBe(1);
  });
});
