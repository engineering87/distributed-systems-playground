// Every text the interface shows must have an Italian translation, or be listed as deliberately untranslated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sandbox = {};
new Function('self', read('src/i18n.js'))(sandbox);
const I = sandbox.SimI18n;

// Names, symbols and keywords of the language stay as they are in both languages.
const KEEP = new Set(['Distributed Systems Playground', 'Upon', 'DELTA', 'PHI', 'RHO', 'GST', 'FIFO', 'JSON', 'SVG', 'PNG',
  'Net', 'Rounds', 'Stack', 'Scenario', 'Broadcast', 'Crash', 'Standard', 'English', 'Italiano', 'Zoom', 'unknown',
  'output', 'offset', 'round', 'log', 'input', 'Ring', 'Grid', 'Random', 'Star', 'Line', 'Complete', 'Binary tree',
  'Ctrl', 'Cmd', 'Enter', 'Space', 'Home', 'End', 'Page Up', 'Page Down', 'Delete', 'Esc', 'V', 'N', 'L', 'D', 'P', 'F', '?',
  'const(d)', 'uniform(a, b)', 'exp(mean)', 'normal(μ, σ)', 'lognormal(μ, σ)', 'pareto(xm, α)', 'empirical(a, b, …)']);

// removes an element and everything inside it, given the position of one of its attributes
function cutElement(html, at) {
  const start = html.lastIndexOf('<', at);
  const tag = /^<([a-z0-9]+)/i.exec(html.slice(start))[1];
  const open = new RegExp('<' + tag + '\\b', 'gi'), close = new RegExp('</' + tag + '\\s*>', 'gi');
  let depth = 0, i = start;
  while (i < html.length) {
    open.lastIndex = close.lastIndex = i;
    const o = open.exec(html), c = close.exec(html);
    if (!c) break;
    if (o && o.index < c.index) { depth++; i = o.index + 1; continue; }
    depth--;
    i = c.index + c[0].length;
    if (depth === 0) break;
  }
  return html.slice(0, start) + html.slice(i);
}

// text nodes and translatable attributes of the page template, without code samples, build markers
// and the blocks that are translated as a whole
function templateTexts() {
  let html = read('src/template.html');
  html = html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/\/\*__[A-Z]+__\*\//g, '');
  for (let at = html.search(/data-i18n-block=/); at >= 0; at = html.search(/data-i18n-block=/)) html = cutElement(html, at);
  const texts = new Set();
  for (const m of html.matchAll(/>([^<>]+)</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && /[A-Za-z]{2}/.test(t)) texts.add(t);
  }
  for (const m of html.matchAll(/(?:title|placeholder|aria-label)="([^"]+)"/g)) {
    const t = m[1].trim();
    if (t && /[A-Za-z]{2}/.test(t)) texts.add(t);
  }
  return [...texts];
}

test('the page template is fully translated', () => {
  const missing = templateTexts().filter(t => !KEEP.has(t) && I._tr(t) === null);
  assert.deepEqual(missing, [], missing.length + ' text(s) without an Italian translation');
});

test('every block translated as a whole has its Italian version', () => {
  const html = read('src/template.html');
  const keys = [...html.matchAll(/data-i18n-block="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length >= 4, 'the template declares blocks: ' + keys.join(', '));
  const blocks = new Set(I._blocks());
  assert.deepEqual(keys.filter(k => !blocks.has(k)), [], 'blocks without an Italian version');
});

test('translations keep the shape of the original', () => {
  assert.equal(I._tr('Run'), 'Esegui');
  assert.equal(I._tr('3 messages'), '3 messaggi');
  assert.equal(I._tr('1 message'), '1 messaggio');
  assert.equal(I._tr('p2 paused from 1s until 2s'), 'p2 in pausa da 1s fino a 2s');
  assert.equal(I.t('not a known phrase'), 'not a known phrase', 't() falls back to the original');
});
