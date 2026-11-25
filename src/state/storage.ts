import { parseProject, Project, serializeProject } from './project';

const STORAGE_KEY = 'glyph.project.v1';
const SAVE_DELAY_MS = 400;

/**
 * Loads the project saved in this browser and keeps saving it as it changes.
 * Storage can be blocked or full, the app works without it.
 */
export function loadPersistedProject(): Project {
  let saved: string | null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  const project = new Project((saved && parseProject(saved)) || undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  project.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serializeProject(project.toData()));
      } catch {
        // Nothing to do: the drawing stays in memory for this visit.
      }
    }, SAVE_DELAY_MS);
  });
  return project;
}
