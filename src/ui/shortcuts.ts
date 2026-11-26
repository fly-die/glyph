import type { Project } from '../state/project';

/**
 * Cmd+Z (Ctrl+Z elsewhere) takes back the last stroke on the page, wherever
 * it was drawn, and Shift+Cmd+Z or Ctrl+Y puts it back. Text fields keep
 * their own undo.
 */
export function mountShortcuts(project: Project): void {
  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
    const key = event.key.toLowerCase();
    const redo = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey);
    const undo = key === 'z' && !event.shiftKey;
    if (!undo && !redo) return;
    const changed = undo ? project.undoLast() : project.redo();
    // Only claim the key when something happened, so the browser keeps its own shortcut otherwise.
    if (changed !== null) event.preventDefault();
  });
}
