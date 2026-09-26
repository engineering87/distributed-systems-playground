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

test('regular expressions are never built from data', () => {
  const problems = [];
  for (const f of sources.concat(tooling)) {
    read(f).split('\n').forEach((line, i) => {
      if (/new RegExp\(/.test(line)) problems.push(f + ':' + (i + 1) + ' ' + line.trim());
    });
  }
  assert.deepEqual(problems, [], 'compare strings, or write the pattern as a literal');
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
  // plain text comparisons: a version built into a regular expression would need escaping to be right
  assert.ok(read('CITATION.cff').includes('version: "' + version + '"'), 'CITATION.cff does not carry ' + version);
  assert.ok(read('CHANGELOG.md').includes('## [' + version + ']'), 'CHANGELOG.md has no section for ' + version);
});

// The status appendix described v0.5 while the code was at v0.23: a whole major line out of date.
test('the specification reports the status of the current major version', () => {
  const major = JSON.parse(read('package.json')).version.split('.')[0];
  const spec = read('docs/SPEC.md');
  assert.ok(spec.includes('Implementation status (version ' + major + '.x)'),
    'docs/SPEC.md still reports the status of another major version, not ' + major + '.x');
  assert.ok(spec.includes('| Specification | version ' + major + '.x | Reason |'),
    'the differences table still compares against another major version');
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

// ---------------------------------------------------------------- commit messages
test('the commit message checker accepts our shape and refuses the rest', async () => {
  const { checkMessage, TYPES } = await import('../scripts/check-commits.mjs');
  const ok = [
    'feat: add the behaviour profile',
    'fix(engine): drop messages that arrive after the round',
    'docs: explain what a quorum buys you',
    'feat!: change the scenario format',
    'refactor: split the interface into one file per area\n\nThe parts share one scope.',
    'Merge branch \'main\' into feature'
  ];
  for (const m of ok) assert.deepEqual(checkMessage(m), [], m.split('\n')[0]);

  const bad = [
    ['Added stuff.', /type: what changed/],
    ['feat: x', /too short/],
    ['feat: Add the profile', /lower case/],
    ['fix: drop late messages.', /punctuation/],
    ['wip: something happened here', /is not one of/],
    ['feat: ' + 'a'.repeat(80), /first line is/],
    ['feat: add a thing\nno blank line', /blank line/]
  ];
  for (const [m, re] of bad) {
    const problems = checkMessage(m);
    assert.ok(problems.length, 'should be refused: ' + m.slice(0, 40));
    assert.ok(problems.some(p => re.test(p)), m.slice(0, 40) + ' → ' + problems.join('; '));
  }

  // the types are the ones the changelog is written from
  for (const t of ['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'chore', 'ci', 'build']) {
    assert.ok(TYPES.includes(t), t);
  }
});

test('the repository configuration is in place', () => {
  const dependabot = read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: pip/, 'the browser suites pin Playwright');
  assert.match(read('test/browser/requirements.txt'), /playwright==/);

  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /permissions:\s*\n\s*contents: read/, 'the workflow asks for no more than it needs');
  assert.match(ci, /check-commits\.mjs --range/, 'pull requests check their commit messages');
  assert.match(ci, /requirements\.txt/, 'the browser job installs the pinned Playwright');

  const release = read('.github/workflows/release.yml');
  assert.match(release, /tag v\$TAG but package\.json says/, 'a release refuses to disagree with the version');
  assert.match(release, /CHANGELOG\.md has no section/, 'a release refuses to ship without notes');

  // generated artifacts are marked as such, so reviews and language statistics stay honest
  const attrs = read('.gitattributes');
  for (const path of ['index.html', 'manual/**']) assert.ok(attrs.includes(path + ' linguist-generated=true'), path);
});

// A badge that lies is worse than no badge: these are checked against the code they describe.
test('the badges of the README match what the repository contains', () => {
  const readme = read('README.md');
  const { EXAMPLES } = require('../src/examples.js');
  const properties = EXAMPLES.reduce((n, e) => n + (C.parseProgram(e.scenario.code).properties || []).length, 0);
  const pages = fs.readdirSync(path.join(root, 'manual')).filter(f => f.endsWith('.html')).length;

  // read the number out of "img.shields.io/badge/<name>-<number>-", without building a pattern from data
  const badge = name => {
    const at = readme.indexOf('img.shields.io/badge/' + name + '-');
    assert.notEqual(at, -1, 'the README has no ' + name + ' badge');
    const from = at + ('img.shields.io/badge/' + name + '-').length;
    let digits = '';
    for (let i = from; i < readme.length && readme[i] >= '0' && readme[i] <= '9'; i++) digits += readme[i];
    assert.ok(digits, 'the ' + name + ' badge carries no number');
    return +digits;
  };
  assert.equal(badge('algorithms'), EXAMPLES.length, 'the algorithms badge counts the examples');
  assert.equal(badge('properties%20checked'), properties, 'the properties badge counts the declared properties');
  assert.equal(badge('docs'), pages, 'the docs badge counts the pages of the documentation site');
});
