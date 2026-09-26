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
  'Francesco Del Re', 'GitHub: engineering87', 'Blog: engineering87.github.io',
  'const(d)', 'uniform(a, b)', 'exp(mean)', 'normal(μ, σ)', 'lognormal(μ, σ)', 'pareto(xm, α)', 'empirical(a, b, …)']);

// Walks the template once, instead of cutting pieces out of it with regular expressions: comments, code
// samples, scripts and the blocks translated as a whole are skipped with their content; everything else
// contributes its text and its translatable attributes.
const SKIPPED_TAGS = new Set(['pre', 'script', 'style']);
const ATTRS = ['title', 'placeholder', 'aria-label'];

function scanTemplate(html) {
  const texts = new Set();
  const stack = [];          // open tags; when a skipped one is on it, text is ignored
  let skipDepth = 0;         // how many tags are open inside the skipped element
  let i = 0, text = '';
  const flush = () => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t && !skipDepth && /[A-Za-z]{2}/.test(t) && !t.startsWith('/*__')) texts.add(t);
    text = '';
  };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { text += html.slice(i); break; }
    text += html.slice(i, lt);
    flush();
    if (html.startsWith('<!--', lt)) {                      // comment
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    const raw = html.slice(lt + 1, gt);
    const closing = raw.startsWith('/');
    const name = (closing ? raw.slice(1) : raw).split(/[\s/>]/)[0].toLowerCase();
    if (closing) {
      if (skipDepth) skipDepth--;
      else while (stack.length && stack.pop() !== name);
    } else if (!raw.endsWith('/') && !['br', 'hr', 'img', 'input', 'meta', 'link'].includes(name)) {
      if (skipDepth) skipDepth++;
      else if (SKIPPED_TAGS.has(name) || / data-i18n-block=/.test(raw)) skipDepth = 1;
      else stack.push(name);
    }
    if (!skipDepth || skipDepth === 1) {
      for (const attr of ATTRS) {
        const at = raw.toLowerCase().indexOf(attr + '="');
        if (at < 0) continue;
        const from = at + attr.length + 2;
        const end = raw.indexOf('"', from);
        const v = end < 0 ? '' : raw.slice(from, end).trim();
        if (v && /[A-Za-z]{2}/.test(v)) texts.add(v);
      }
    }
    i = gt + 1;
  }
  flush();
  return [...texts];
}

// text nodes and translatable attributes of the page template
function templateTexts() { return scanTemplate(read('src/template.html')); }

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
