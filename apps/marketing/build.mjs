import { cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const esbuildBin = require.resolve('esbuild/bin/esbuild');

cpSync('index.html', 'dist/index.html', { recursive: true });
cpSync('docs.html', 'dist/docs.html', { recursive: true });
cpSync('download.html', 'dist/download.html', { recursive: true });
cpSync('pricing.html', 'dist/pricing.html', { recursive: true });
cpSync('style.css', 'dist/style.css', { recursive: true });
cpSync('authenik8-mark.svg', 'dist/authenik8-mark.svg', { recursive: true });
cpSync('assets/integrations', 'dist/assets/integrations', { recursive: true });

// Bundle the EmberField React component (React + ReactDOM included) into a
// self-contained IIFE for the static marketing pages. No CDN required.
execFileSync(
  process.execPath,
  [
    esbuildBin,
    'src/ember-field.jsx',
    '--bundle',
    '--format=iife',
    '--jsx=automatic',
    '--global-name=EmberField',
    '--outfile=ember-field.js',
    '--log-level=info',
  ],
  { cwd: root, stdio: 'inherit' }
);
cpSync('ember-field.js', 'dist/ember-field.js', { recursive: true });

console.log('Built to dist/');
