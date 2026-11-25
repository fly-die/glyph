export type CellSize = 'regular' | 'large';
/** 'system' follows the visitor's device until they choose for themselves. */
export type Theme = 'system' | 'light' | 'dark';

/** How the page is shown. Kept apart from the project: it is not part of the font. */
export interface SettingsData {
  guideLetters: boolean;
  cellSize: CellSize;
  theme: Theme;
}

export const DEFAULT_SETTINGS: SettingsData = { guideLetters: true, cellSize: 'regular', theme: 'system' };

const STORAGE_KEY = 'glyph.settings.v1';

/** Reads saved settings. Anything missing or malformed falls back to the default. */
export function parseSettings(json: string | null): SettingsData {
  let raw: unknown;
  try {
    raw = json === null ? null : JSON.parse(json);
  } catch {
    raw = null;
  }
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    guideLetters: typeof data.guideLetters === 'boolean' ? data.guideLetters : DEFAULT_SETTINGS.guideLetters,
    cellSize: data.cellSize === 'large' || data.cellSize === 'regular' ? data.cellSize : DEFAULT_SETTINGS.cellSize,
    theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : DEFAULT_SETTINGS.theme,
  };
}

type Listener = () => void;

export class Settings {
  private data: SettingsData;
  private readonly listeners = new Set<Listener>();

  constructor(data: SettingsData = DEFAULT_SETTINGS) {
    this.data = { ...data };
  }

  get value(): Readonly<SettingsData> {
    return this.data;
  }

  update(patch: Partial<SettingsData>): void {
    this.data = { ...this.data, ...patch };
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Loads the settings saved in this browser and saves them again on every change. */
export function loadPersistedSettings(): Settings {
  let saved: string | null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  const settings = new Settings(parseSettings(saved));
  settings.subscribe(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
    } catch {
      // Storage is blocked or full. The settings still hold for this visit.
    }
  });
  return settings;
}
