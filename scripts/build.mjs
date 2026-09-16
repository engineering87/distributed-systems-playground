// Bundles src/ into a single self-contained index.html (servable by GitHub Pages).
// Usage: node scripts/build.mjs          -> writes index.html
//        node scripts/build.mjs --check  -> checks that index.html is up to date
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, 'src', f), 'utf8');

let html = read('template.html');
for (const [marker, file] of [
  ['/*__CSS__*/', 'style.css'],
  ['/*__CORE__*/', 'core.js'],
  ['/*__EXAMPLES__*/', 'examples.js'],
  ['/*__UI__*/', 'ui.js']
]) {
  const src = read(file);
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
