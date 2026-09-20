// Guards: cheap checks that keep past decisions from being undone by a future change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const { EXAMPLES, PRESETS } = require('../src/examples.js');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
// every source of the application, including the parts of the interface
const sources = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f)
  .concat(fs.readdirSync(path.join(root, 'src/ui')).filter(f => f.endsWith('.js')).map(f => 'src/ui/' + f));
// the build and the test helpers read our own HTML, and must parse it rather than match it with regexps
const tooling = fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.mjs')).map(f => 'scripts/' + f)
  .concat(fs.readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.cjs')).map(f => 'test/' + f));
const clone = o => JSON.parse(JSON.stringify(o));
const scenarioOf = key => clone(EXAMPLES.find(e => e.key === key).scenario);

test('the sources never reinterpret data as HTML or code', () => {
  // the only accepted innerHTML: constant markup of the translations, parsed once into a template
  const allowed = new Map([['src/i18n.js', ['tpl.innerHTML = BLOCKS[k];']]]);
  const problems = [];
  for (const f of sources) {
    read(f).split('\n').forEach((line, i) => {
      const at = f + ':' + (i + 1);
      const ok = (allowed.get(f) || []).some(s => line.includes(s));
      if (/\.innerHTML\s*=/.test(line) && !ok) problems.push(at + ' assigns innerHTML');
      if (/\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/.test(line)) problems.push(at + ' writes HTML');
      if (/\beval\s*\(|new Function\s*\(/.test(line)) problems.push(at + ' evaluates code');
      // markup is built safely and parsed properly: never filtered with a regular expression
      if (/[(=,]\s*\/<[^/]/.test(line)) problems.push(at + ' matches HTML tags with a regular expression');
    });
  }
  assert.deepEqual(problems, []);
});

test('HTML is never filtered with a regular expression, in the sources or in the tooling', () => {
  const problems = [];
  for (const f of sources.concat(tooling)) {
    read(f).split('\n').forEach((line, i) => {
      if (/[(=,]\s*\/<[^/]/.test(line)) problems.push(f + ':' + (i + 1) + ' ' + line.trim());
    });
  }
  assert.deepEqual(problems, []);
});

test('data from outside the page is parsed without keys that reach a prototype', () => {
  const bad = [];
  for (const f of sources) {
    read(f).split('\n').forEach((l, i) => {
      if (/JSON\.parse\(/.test(l) && !/safeParse|reviver|UNSAFE_KEYS/.test(l)) bad.push(f + ':' + (i + 1) + ' ' + l.trim());
    });
  }
  assert.deepEqual(bad, [], 'use safeParse for anything that comes from a file, a link or storage');
  assert.ok(sources.some(f => /UNSAFE_KEYS = new Set\(\['__proto__', 'constructor', 'prototype'\]\)/.test(read(f))));
  assert.match(read('src/runner.js'), /UNSAFE_KEYS/);
});

test('the version is the same everywhere and has a changelog entry', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.match(read('CITATION.cff'), new RegExp('version: "' + version.replace(/\./g, '\\.') + '"'));
  assert.ok(read('CHANGELOG.md').includes('## [' + version + ']'), 'CHANGELOG.md has no section for ' + version);
});

// The numbers the documentation quotes come from real runs. If the engine changes, these fail before a reader does.
test('the examples still produce the numbers the documentation quotes', () => {
  const examples = read('docs/examples.md');
  const quoted = (text, where) => assert.ok(examples.includes(text), 'docs/examples.md no longer says "' + text + '" (' + where + ')');

  const flooding = C.runSimulation(scenarioOf('flooding'));
  assert.equal(flooding.msgs.length, 46);
  quoted('46 messages', 'flooding');

  const cr = C.runSimulation(scenarioOf('chang-roberts'));
  assert.equal(cr.msgs.filter(m => m.payload.startsWith('[ELECTION')).length, 20);
  assert.equal(cr.msgs.filter(m => m.payload.startsWith('[ELECTED')).length, 8);
  assert.ok(cr.outputs.every(o => o.args[0] === '8'), 'every process elects 8');
  quoted('20 election messages and 8 announcement messages', 'chang-roberts');

  const ideal = C.runSimulation(scenarioOf('floodset'));
  assert.deepEqual(ideal.log.filter(e => e.kind === 'input').map(e => e.text.split('| ')[1]), ['8', '7', '7', '3']);
  assert.ok(ideal.outputs.every(o => o.args[0] === '3'));
  quoted('the proposals are 8, 7, 7 and 3, every process decides 3', 'floodset ideal');

  const real = C.runSimulation(Object.assign(scenarioOf('floodset'), clone(PRESETS['sync-real']), { seed: 5 }));
  assert.equal(real.violations, 11);
  assert.equal(real.msgs.filter(m => m.status === 'dropped-late').length, 9);
  assert.equal(real.outputs.find(o => o.node === 2).args[0], '7');
  quoted('11 violations and 9 discarded messages, and p2 decides 7', 'floodset realistic');
  const agreement = real.properties.find(p => p.name === 'Agreement');
  assert.equal(agreement.ok, false);
  assert.equal(agreement.node, 2);
  quoted('broken at 150 ms on p2', 'floodset properties');

  const gossip = C.runSimulation(scenarioOf('gossip'));
  assert.equal(new Set(gossip.outputs.map(o => o.node)).size, 10);
  assert.equal(gossip.msgs.length, 16);
  quoted('10 of the 16 processes hear the rumor, using 16 messages', 'gossip');

  const rb = C.runSimulation(scenarioOf('reliable-broadcast'));
  assert.deepEqual([...new Set(rb.outputs.map(o => o.node))].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  const beb = C.runSimulation(Object.assign(scenarioOf('reliable-broadcast'), {
    code: scenarioOf('reliable-broadcast').code.replace('uses ReliableBroadcast as rb', 'uses BestEffortBroadcast as rb')
  }));
  assert.deepEqual([...new Set(beb.outputs.map(o => o.node))].filter(n => n !== 1), [2], 'besides the sender, only p2');
  quoted('Only p2 reads the news', 'reliable broadcast');
});

// A program written by hand is often broken: the parser must say so, never crash.
test('the parser and the checker survive malformed programs', () => {
  const pieces = ['interface', 'algorithm', 'upon', 'event', '⟨', '⟩', '|', 'do', 'end', 'state', 'property', 'always',
    'trigger', 'forall', 'in', 'where', ':=', '{', '}', '[', ']', '(', ')', '"x"', '42', '50ms', 'Net', 'p', '∪', '#', 'function', 'return', ',', '\n'];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 3000; i++) {
    const n = 1 + Math.floor(rnd() * 24);
    let src = '';
    for (let k = 0; k < n; k++) src += pieces[Math.floor(rnd() * pieces.length)] + ' ';
    let prog = null;
    try { prog = C.parseProgram(src); }
    catch (e) {
      assert.ok(e && typeof e.message === 'string', 'parse errors carry a message: ' + src);
      assert.ok(e.line === undefined || Number.isFinite(e.line), 'parse errors carry a line: ' + src);
      continue;
    }
    // a program that parses must also be checkable without blowing up
    const res = C.check(prog, { timing: 'asynchronous', roundMode: 'lockstep', known: {} });
    assert.ok(Array.isArray(res.errors) && Array.isArray(res.warnings), 'check returns diagnostics for: ' + src);
  }
});
