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
  assert.throws(() => cli('run', '--example', 'floodset', '--preset', 'sync-real', '--seeds', '1..6', '--outcomes'),
    e => (assert.match(e.stdout, /outcomes \(\d+ distinct\)/), assert.equal(e.status, 1), true));
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

test('batches report which property broke and in which seed', () => {
  const res = R.runBatch(scenarioOf('floodset'), { seeds: '1..8', preset: 'sync-real' });
  const agreement = res.summary.properties.find(p => p.name === 'Agreement');
  assert.equal(agreement.kind, 'always');
  assert.equal(agreement.held + agreement.failed, 8);
  assert.equal(agreement.failed, 1);
  assert.equal(agreement.firstFailure, 5);
  assert.equal(res.summary.withPropertyFailures, 1);
  assert.equal(res.summary.firstPropertyFailure, 5);
  const broken = res.runs.find(r => r.seed === 5).properties.find(p => p.name === 'Agreement');
  assert.equal(broken.ok, false);
  assert.ok(broken.at > 0 && broken.node > 0);

  const ideal = R.runBatch(scenarioOf('floodset'), { seeds: '1..8' });
  assert.equal(ideal.summary.withPropertyFailures, 0);
});

test('the command line reports properties and fails when one breaks', () => {
  const ok = cli('run', '--example', 'floodset', '--seeds', '1..4');
  assert.match(ok, /property Agreement\s+\(always\)\s+held in 4\/4 run\(s\)/);
  assert.throws(() => cli('run', '--example', 'floodset', '--preset', 'sync-real', '--seeds', '1..8'), e => {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /Agreement broken/);
    assert.match(e.stdout, /first broken at seed 5/);
    return true;
  });
});

test('a fault plan adds the same faults to the same seed, and different ones to different seeds', () => {
  const scn = scenarioOf('floodset');
  const a = R.planFaults('crash:1,partition:1', '0..2s', scn, 7);
  const b = R.planFaults('crash:1,partition:1', '0..2s', scn, 7);
  const other = R.planFaults('crash:1,partition:1', '0..2s', scn, 8);
  assert.deepEqual(a, b, 'the same seed gives the same schedule');
  assert.notDeepEqual(a, other, 'another seed gives another schedule');
  assert.deepEqual(a.map(f => f.type).sort(), ['crash', 'partition']);
  const window = { from: 0, to: 2000000 };
  for (const f of R.planFaults('crash:2,pause:1,link:1,omission:1,recover:1', window, scn, 3)) {
    const at = C.parseDuration(f.at !== undefined ? f.at : f.from);
    assert.ok(at >= 0 && at <= 2000000, JSON.stringify(f));
    assert.doesNotThrow(() => C.normalizeFault(f), JSON.stringify(f));
  }
  assert.throws(() => R.parsePlan('nope:2'), /Unknown fault plan/);
  assert.throws(() => R.parsePlan(''), /empty/);
  assert.throws(() => R.parseWindow('3s..1s'), /end must come after the start/);
});

test('generated faults reach the runs and the summaries, without touching the scenario', () => {
  const scn = scenarioOf('floodset');
  const before = JSON.stringify(scn);
  const plain = R.runBatch(scn, { seeds: '1..20' });
  assert.equal(plain.summary.withPropertyFailures, 0, 'the example holds without faults');
  const withFaults = R.runBatch(scn, { seeds: '1..20', faults: 'partition:1', faultWindow: '0..2s' });
  assert.equal(JSON.stringify(scn), before, 'the scenario it was given is untouched');
  assert.ok(withFaults.runs.every(r => r.faults.length === 1 && r.faults[0].type === 'partition'));
  const agreement = withFaults.summary.properties.find(p => p.name === 'Agreement');
  assert.ok(agreement.failed >= 1 && agreement.failed < 20, `partitions break agreement in ${agreement.failed} of 20 runs`);
  const broken = withFaults.runs.find(r => r.propertyFailures);
  assert.match(R.describePlanFault(broken.faults[0]), /^partition \{p\d+(, p\d+)*\} /);
  // the schedule reproduces the failure on its own
  const repeat = C.runSimulation(Object.assign(scenarioOf('floodset'), {
    seed: broken.seed, faults: scenarioOf('floodset').faults.concat(broken.faults)
  }));
  assert.ok(repeat.properties.some(p => !p.ok), 'pasting the schedule back reproduces the broken property');
});

test('the command line accepts a fault plan and reports the schedule that broke a run', () => {
  assert.throws(() => cli('run', '--example', 'floodset', '--seeds', '1..20', '--faults', 'partition:1', '--fault-window', '0..2s'), e => {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /Agreement broken/);
    assert.match(e.stdout, /faults: partition \{p\d+/);
    return true;
  });
  assert.throws(() => cli('run', '--example', 'floodset', '--faults', 'nope'), e => {
    assert.equal(e.status, 2);
    assert.match(e.stderr, /Unknown fault plan/);
    return true;
  });
});

test('a failing schedule is shrunk to the faults that still produce the same failure', () => {
  const scn = scenarioOf('floodset');
  const batch = R.runBatch(scn, { seeds: '1..20', faults: 'crash:1,partition:1,pause:1,omission:1', faultWindow: '0..2s' });
  const broken = batch.runs.find(r => r.propertyFailures);
  assert.ok(broken, 'the plan breaks a property in some seed');
  assert.equal(broken.faults.length, 4);

  const m = R.minimize(scn, { seed: broken.seed, faults: broken.faults });
  assert.equal(m.ok, true);
  assert.ok(m.faults.length < broken.faults.length, 'something was removed');
  assert.equal(m.removed, broken.faults.length - m.faults.length);
  assert.ok(m.runs > 1 && m.runs <= 200, 'it ran a bounded number of simulations: ' + m.runs);

  // what is left still produces the same failure, and it is the same when run again
  const again = R.minimize(scn, { seed: broken.seed, faults: broken.faults });
  assert.deepEqual(again.faults, m.faults, 'shrinking is deterministic');
  const repeat = C.runSimulation(Object.assign(scenarioOf('floodset'), {
    seed: broken.seed, faults: scenarioOf('floodset').faults.concat(m.faults)
  }));
  assert.equal(R.failureSignature(R.summarize(repeat, broken.seed)), m.signature);

  // removing the last fault must stop the failure, otherwise it was not minimal
  for (let i = 0; i < m.faults.length; i++) {
    const without = m.faults.slice(0, i).concat(m.faults.slice(i + 1));
    const res = C.runSimulation(Object.assign(scenarioOf('floodset'), {
      seed: broken.seed, faults: scenarioOf('floodset').faults.concat(without)
    }));
    assert.notEqual(R.failureSignature(R.summarize(res, broken.seed)), m.signature, 'fault ' + i + ' is necessary');
  }
});

test('shrinking a run that does not fail says so, and respects its budget', () => {
  const scn = scenarioOf('floodset');
  const none = R.minimize(scn, { seed: 1, faults: [] });
  assert.equal(none.ok, false);
  assert.match(none.reason, /does not fail/);
  const capped = R.minimize(scn, { seed: 1, faults: [{ type: 'partition', groups: '1 2', from: '0ms', to: '2s' }], maxRuns: 2 });
  assert.ok(capped.runs <= 2);
});

test('the command line can shrink the schedules it generated', () => {
  // a broken property is an exit code of 1, so the output arrives through the error
  assert.throws(() => cli('run', '--example', 'floodset', '--seeds', '1..6', '--faults',
    'crash:1,partition:1,pause:1,omission:1', '--fault-window', '0..2s', '--minimize', '--quiet'), e => {
    assert.equal(e.status, 1);
    assert.match(e.stdout, /seed \d+: \d of 4 fault\(s\) are enough \(\d+ runs\)/);
    return true;
  });
});
