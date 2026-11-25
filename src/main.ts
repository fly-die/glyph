import './tokens/index.css';
import './styles.css';
import { mountGrid } from './draw/grid';
import { loadPersistedProject } from './state/storage';
import { mountExport } from './ui/export';
import { mountShell } from './ui/shell';
import { mountTester } from './ui/tester';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app element');

const project = loadPersistedProject();
const main = mountShell(root);
mountGrid(main, project, 1);
mountTester(main, project, 2);
mountExport(main, project, 3);
