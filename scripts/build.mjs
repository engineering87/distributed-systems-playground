// Bundles src/ into a single self-contained index.html (servable by GitHub Pages).
// Usage: node scripts/build.mjs          -> writes index.html
//        node scripts/build.mjs --check  -> checks that index.html is up to date
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, 'src', f), 'utf8');
// The interface is written as one scope split over several files: they are concatenated in name order and
// wrapped once, so no part has to export anything to the others.
function readUi() {
  const dir = join(root, 'src', 'ui');
  const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  if (!files.length) throw new Error('src/ui/ has no parts');
  const body = files.map(f => readFileSync(join(dir, f), 'utf8').trimEnd()).join('\n\n');
  return "(function () {\n'use strict';\n\n" + body + "\n})();\n";
}

let html = read('template.html');
for (const [marker, file] of [
  ['/*__CSS__*/', 'style.css'],
  ['/*__CORE__*/', 'core.js'],
  ['/*__LIBRARY__*/', 'library.js'],
  ['/*__I18N__*/', 'i18n.js'],
  ['/*__EXAMPLES__*/', 'examples.js'],
  ['/*__RUNNER__*/', 'runner.js'],
  ['/*__WORKER__*/', 'worker.js'],
  ['/*__UI__*/', 'ui/']
]) {
  let src = file === 'ui/' ? readUi() : read(file);
  // a syntax error must fail the build, and name the file it came from
  if (file.endsWith('.js') || file === 'ui/') {
    try { new Function(src); }
    catch (e) { throw new Error(`${file} does not parse: ${e.message}`); }
  }
  // the worker carries its own copy of the engine: it has no access to the page's scripts
  if (file === 'worker.js') {
    src = src.replace('/*__WORKER_LIBS__*/', () => ['core.js', 'library.js', 'examples.js', 'runner.js'].map(read).join('\n'));
  }
  if (src.toLowerCase().includes('</script')) throw new Error(`${file} contains "</script", which would break the page`);
  if (!html.includes(marker)) throw new Error(`Placeholder ${marker} is missing from the template`);
  html = html.replace(marker, () => src);
}

const out = join(root, 'index.html');
if (process.argv.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (current !== html) {
    console.error('index.html is out of date: run "npm run build" and commit the result.');
    process.exit(1);
  }
  console.log('index.html is up to date.');
} else {
  writeFileSync(out, html);
  console.log(`Wrote index.html (${(html.length / 1024).toFixed(0)} KB)`);
}
