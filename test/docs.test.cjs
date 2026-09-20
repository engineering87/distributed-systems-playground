// Keeps the documentation honest: Upon programs in the docs must compile, and relative links must resolve.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const L = require('../src/library.js');

const root = path.join(__dirname, '..');
const files = ['README.md', 'CONTRIBUTING.md']
  .concat(fs.readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.md')).map(f => 'docs/' + f));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// split a markdown file into prose and fenced code blocks
function parse(md) {
  const blocks = [], prose = [];
  let inCode = false, lang = '', buf = [];
  for (const line of md.split('\n')) {
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      if (!inCode) { inCode = true; lang = fence[1]; buf = []; }
      else { blocks.push({ lang, code: buf.join('\n') }); inCode = false; }
      continue;
    }
    if (inCode) buf.push(line); else prose.push(line);
  }
  return { blocks, prose: prose.join('\n') };
}

// the src of every <img> written directly in the markdown, read by walking the text
function imageSources(text) {
  const out = [];
  for (let at = text.indexOf('<img'); at >= 0; at = text.indexOf('<img', at + 4)) {
    const end = text.indexOf('>', at);
    if (end < 0) break;
    const tag = text.slice(at, end);
    const key = tag.indexOf('src="');
    if (key < 0) continue;
    const from = key + 5;
    const quote = tag.indexOf('"', from);
    if (quote > 0) out.push(tag.slice(from, quote));
  }
  return out;
}

// GitHub-style heading anchors
function anchors(md) {
  const seen = new Map(), out = new Set();
  for (const line of parse(md).prose.split('\n')) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (!h) continue;
    const base = h[1].replace(/[`*_]/g, '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    out.add(n ? base + '-' + n : base);
  }
  return out;
}

const CONTEXTS = [
  { timing: 'asynchronous', roundMode: 'lockstep', known: { DELTA: null, PHI: null, RHO: null } },
  { timing: 'partial', roundMode: 'lockstep', known: { DELTA: 50000, PHI: 5000, RHO: 0.001 } },
  { timing: 'synchronous-rounds', roundMode: 'lockstep', known: { DELTA: 50000, PHI: 5000, RHO: 0.001 } }
];

test('every Upon program in the documentation compiles', () => {
  let count = 0;
  for (const f of files) {
    parse(read(f)).blocks.filter(b => b.lang === 'upon').forEach((b, i) => {
      count++;
      let prog = C.parseProgram(b.code);
      // interfaces from the library may be used without being declared in the snippet
      const used = new Set(prog.algorithms.flatMap(a => a.uses.map(u => u.type).concat(a.implType)));
      const extra = [...used].filter(t => L.IFACES[t] && !prog.interfaces.has(t)).map(t => L.IFACES[t]).join('\n');
      if (extra) prog = C.parseProgram(b.code + '\n' + extra);
      const results = CONTEXTS.map(ctx => C.check(C.parseProgram(b.code + '\n' + extra), ctx).errors);
      const ok = results.some(errs => errs.length === 0);
      assert.ok(ok, `${f}, upon block ${i + 1}: ${JSON.stringify(results[0].slice(0, 3))}`);
    });
  }
  assert.ok(count >= 8, `expected several programs, found ${count}`);
});

test('relative links and anchors in the documentation resolve', () => {
  const problems = [];
  for (const f of files) {
    const md = read(f);
    const { prose } = parse(md);
    const own = anchors(md);
    const links = [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1])
      .concat(imageSources(prose));
    for (const link of links) {
      if (/^(https?:|mailto:)/.test(link)) continue;
      const [file, anchor] = link.split('#');
      let target = f;
      if (file) {
        target = path.normalize(path.join(path.dirname(f), file));
        if (!fs.existsSync(path.join(root, target))) { problems.push(`${f}: missing file ${link}`); continue; }
      }
      if (anchor !== undefined) {
        const set = file ? (target.endsWith('.md') ? anchors(read(target)) : null) : own;
        if (set && !set.has(anchor)) problems.push(`${f}: missing anchor ${link}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('the documentation mentions every example and every library module', () => {
  const { EXAMPLES } = require('../src/examples.js');
  const examples = read('docs/examples.md');
  for (const ex of EXAMPLES) assert.ok(examples.includes('## ' + ex.title) || examples.includes(ex.title.split(' (')[0]), ex.title);
  const library = read('docs/library.md');
  for (const m of L.MODULES) assert.ok(library.includes('### ' + m.name), m.name);
});

test('the Italian interface covers examples, presets and library modules', () => {
  const sandbox = {};
  new Function('self', require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/i18n.js'), 'utf8'))(sandbox);
  const I = sandbox.SimI18n;
  const { EXAMPLES, PRESETS } = require('../src/examples.js');
  const missing = [];
  const need = s => { if (s && I._tr(s) === null) missing.push(s); };
  for (const ex of EXAMPLES) { need(ex.title); need(ex.summary); need(ex.category); }
  for (const p of Object.values(PRESETS)) { need(p.label); need(p.note); }
  for (const m of L.MODULES) if (!I._tr(m.name + ': ' + m.summary + ' Guarantees: ' + m.properties)) missing.push(m.name);
  assert.deepEqual(missing, []);
  assert.equal(I._tr('3 messages'), '3 messaggi');
  assert.equal(I._tr('Time limit reached: 12 events processed.'), 'Raggiunto il limite di tempo: 12 eventi elaborati.');
});
