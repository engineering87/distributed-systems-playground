// The batch runner and the command line tool: both use the same engine as the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const C = require('../src/core.js');
const R = require('../src/runner.js');
const { EXAMPLES, PRESETS } = require('../src/examples.js');

const scenarioOf = key => JSON.parse(JSON.stringify(EXAMPLES.find(e => e.key === key).scenario));
const cli = (...args) => execFileSync(process.execPath, [path.join(__dirname, '../bin/dsp.mjs'), ...args], { encoding: 'utf8' });

test('seed lists accept ranges, lists and single values', () => {
  assert.deepEqual(R.seedList('1..5'), [1, 2, 3, 4, 5]);
  assert.deepEqual(R.seedList('3'), [3]);
  assert.deepEqual(R.seedList('2,4,9'), [2, 4, 9]);
  assert.deepEqual(R.seedList([7, 8]), [7, 8]);
  assert.deepEqual(R.seedList({ from: 2, to: 4 }), [2, 3, 4]);
  assert.throws(() => R.seedList('nope'), /Invalid seed list/);
  assert.throws(() => R.seedList({ from: 5, to: 1 }), /Invalid seed range/);
  assert.throws(() => R.seedList({ from: 1, to: 20000 }), /Too many seeds/);
});

test('a batch is deterministic and does not touch the scenario it was given', () => {
  const scn = scenarioOf('flooding');
  const before = JSON.stringify(scn);
  const a = R.runBatch(scn, { seeds: '1..4' });
  const b = R.runBatch(scn, { seeds: '1..4' });
  assert.equal(JSON.stringify(scn), before);
  assert.deepEqual(a.runs, b.runs);
  assert.equal(a.summary.runs, 4);
  assert.deepEqual(a.runs.map(r => r.seed), [1, 2, 3, 4]);
  assert.ok(a.runs.every(r => r.ok && r.messages > 0 && r.outputCount > 0));
});

test('a batch summary matches the single run it summarizes', () => {
  const scn = scenarioOf('epfd');
  const one = R.runBatch(scn, { seeds: [5] }).runs[0];
  const direct = C.runSimulation(Object.assign(JSON.parse(JSON.stringify(scn)), { seed: 5 }));
  assert.equal(one.messages, direct.msgs.length);
  assert.equal(one.violations, direct.violations);
  assert.equal(one.outputCount, direct.outputs.length);
  assert.equal(one.eventCount, direct.eventCount);
  assert.equal(one.delivered, direct.msgs.filter(m => m.status === 'delivered').length);
});

test('presets and field overrides change the run', () => {
  const scn = scenarioOf('floodset');
  const ideal = R.runBatch(scn, { seeds: '1..5' });
  assert.equal(ideal.summary.withViolations, 0);
  const real = R.runBatch(scn, { seeds: '1..5', preset: 'sync-real' });
  assert.ok(real.summary.withViolations > 0, 'realistic rounds break the assumption');
  assert.throws(() => R.runBatch(scn, { preset: 'nope' }), /Unknown preset/);

  const clean = R.runBatch(scenarioOf('flooding'), { seeds: [1] });
  const lossy = R.runBatch(scenarioOf('flooding'), { seeds: [1], set: { 'actual.loss': '0.4' } });
  assert.equal(clean.runs[0].lost, 0);
  assert.ok(lossy.runs[0].lost > 0);
  assert.throws(() => R.runBatch(scenarioOf('flooding'), { set: { '__proto__.x': '1' } }), /Invalid property path/);
  assert.equal({}.x, undefined);
});

test('outcomes group the runs by what the processes produced', () => {
  const real = R.runBatch(scenarioOf('floodset'), { seeds: '1..12', preset: 'sync-real' });
  const groups = R.outcomes(real.runs);
  assert.ok(groups.length >= 1);
  assert.equal(groups.reduce((a, g) => a + g.count, 0), 12);
  const agreed = r => new Set(r.outputs.map(o => o.args[0])).size <= 1;
  assert.ok(real.runs.some(agreed), 'some seed agrees');
});

test('a batch stops early on failure and reports where', () => {
  const scn = scenarioOf('flooding');
  scn.code += '\nalgorithm Broken implements Nope as x end';
  const res = R.runBatch(scn, { seeds: '1..5', stopOnFailure: true });
  assert.equal(res.runs.length, 1);
  assert.equal(res.summary.failed, 1);
  assert.equal(res.summary.firstFailure, 1);
  assert.ok(res.runs[0].compileErrors.some(e => /Interface "Nope"/.test(e.msg)));
});

test('checkScenario reports errors, warnings and the model it checked against', () => {
  assert.deepEqual(R.checkScenario(scenarioOf('epfd')), { ok: true, errors: [], warnings: [] });
  const scn = scenarioOf('flooding');
  scn.code = scn.code.replace('upon event ⟨fb, Broadcast | m⟩ do', 'upon event ⟨fb, Broadcast | m⟩ where DELTA > 0 do');
  const res = R.checkScenario(scn);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => /DELTA/.test(e.msg)), JSON.stringify(res.errors));
});

test('the command line runs, checks and lists', () => {
  const out = cli('run', '--example', 'flooding', '--seeds', '1..3');
  assert.match(out, /3 run\(s\), 0 failed/);
  assert.match(out, /seed\s+status/);

  const json = JSON.parse(cli('run', '--example', 'gossip', '--seeds', '1..2', '--json'));
  assert.equal(json.runs.length, 2);
  assert.equal(json.summary.runs, 2);
  assert.ok(json.runs[0].outputs.length > 0);

  assert.match(cli('examples'), /floodset\s+synchronous-rounds/);
  assert.match(cli('presets'), /sync-real/);
  assert.match(cli('check', '--example', 'causal-broadcast'), /No errors/);
  assert.match(cli('run', '--example', 'floodset', '--preset', 'sync-real', '--seeds', '1..6', '--outcomes'), /outcomes \(\d+ distinct\)/);
  assert.match(cli('run', '--example', 'flooding', '--seeds', '1', '--outputs'), /Deliver \| 1, "hello"/);
});

test('the command line reads a scenario file and reports failures with an exit code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-'));
  const file = path.join(dir, 'scenario.json');
  const scn = scenarioOf('flooding');
  scn.code = scn.code.replace('uses Net as net', 'uses Missing as x');
  fs.writeFileSync(file, JSON.stringify(scn));
  assert.throws(() => cli('check', file), e => {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /Interface "Missing" is not declared/);
    return true;
  });
  assert.throws(() => cli('run', '--example', 'nope'), e => {
    assert.equal(e.status, 2);
    assert.match(e.stderr, /Unknown example/);
    return true;
  });
  fs.writeFileSync(file, '{not json');
  assert.throws(() => cli('run', file), e => (assert.equal(e.status, 2), assert.match(e.stderr, /Invalid JSON/), true));
  fs.rmSync(dir, { recursive: true, force: true });
});
