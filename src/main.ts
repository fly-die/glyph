import './tokens/index.css';
import './styles.css';
import { mountShell } from './ui/shell';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app element');

mountShell(root);
