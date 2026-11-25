import './tokens/index.css';
import './styles.css';
import { mountGrid } from './draw/grid';
import { loadPersistedSettings } from './state/settings';
import { loadPersistedProject } from './state/storage';
import { mountExport } from './ui/export';
import { mountLiveFont } from './ui/live-font';
import { mountShell } from './ui/shell';
import { mountTester } from './ui/tester';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app element');

const project = loadPersistedProject();
const settings = loadPersistedSettings();
const main = mountShell(root);
mountLiveFont(project);
mountGrid(main, project, settings, 1);
mountTester(main, 2);
mountExport(main, project, 3);
