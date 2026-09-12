import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'companion/cardladder');
const destination = path.join(root, 'public/cardladder-companion');
await mkdir(destination, { recursive: true });
await build({ entryPoints: ['background', 'page', 'bridge', 'popup'].map(name => path.join(source, `${name}.js`)), outdir: destination, bundle: true, format: 'iife', target: 'chrome120' });
for (const file of ['manifest.json', 'popup.html', 'popup.css', 'README.md']) await copyFile(path.join(source, file), path.join(destination, file));
// zip receives separate arguments: workspace paths may contain spaces.
execFileSync('zip', ['-q', '-r', '../cardladder-companion.zip', '.', '-i', '*.js', '*.json', '*.html', '*.css', '*.md'], { cwd: destination });
console.log(`Companion ready: ${destination}`);
