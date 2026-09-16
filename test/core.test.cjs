const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const { EXAMPLES, PRESETS, complete } = require('../src/examples.js');

const clone = o => JSON.parse(JSON.stringify(o));
const byKey = k => clone(EXAMPLES.find(e => e.key === k).scenario);
const decisions = r => new Set(r.outputs.filter(o => o.ev === 'Decide').map(o => o.args[0]));

test('every example compiles and runs without errors', () => {
  for (const ex of EXAMPLES) {
    const r = C.runSimulation(clone(ex.scenario));
    assert.equal(r.error, null, `${ex.key}: ${r.error}`);
    assert.ok(r.ok, ex.key);
    assert.deepEqual(r.compile.errors, [], ex.key);
    assert.ok(r.outputs.length > 0, `${ex.key}: no outputs`);
  }
});

test('same scenario and seed produce the same trace', () => {
  for (const ex of EXAMPLES) {
    const a = C.runSimulation(clone(ex.scenario));
    const b = C.runSimulation(clone(ex.scenario));
    assert.equal(
      JSON.stringify([a.msgs, a.log, a.outputs, a.activity]),
      JSON.stringify([b.msgs, b.log, b.outputs, b.activity]), ex.key);
  }
});

test('Chang-Roberts elects the highest identifier', () => {
  const r = C.runSimulation(byKey('chang-roberts'));
  const elected = r.outputs.filter(o => o.ev === 'Elected');
  assert.equal(elected.length, 8);
  assert.ok(elected.every(o => o.args[0] === '8'));
});

test('flooding delivers each message to every process exactly once', () => {
  const r = C.runSimulation(byKey('flooding'));
  for (const m of ['"hello"', '"ok"']) {
    const nodes = r.outputs.filter(o => o.args[1] === m).map(o => o.node).sort((a, b) => a - b);
    assert.deepEqual(nodes, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  }
});

test('ideal synchronous: no violations and FloodSet always agrees', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = C.runSimulation(Object.assign(byKey('floodset'), { seed }));
    assert.equal(r.violations, 0);
    assert.equal(decisions(r).size, 1, `seed ${seed}`);
  }
});

test('realistic synchronous: some seed makes FloodSet disagree', () => {
  const s = Object.assign(byKey('floodset'), clone(PRESETS['sync-real']), { seed: 3 });
  const r = C.runSimulation(s);
  assert.ok(r.violations > 0);
  assert.ok(decisions(r).size > 1, 'expected disagreement with seed 3');
});

test('◇P: after GST every correct process suspects only the crashed one', () => {
  const r = C.runSimulation(byKey('epfd'));
  for (const id of [1, 2, 4]) {
    const last = r.snaps[id][r.snaps[id].length - 1];
    assert.equal(C.fmt(last.states.epfd.suspected), '{3}', `p${id}`);
  }
});

test('static check: DELTA is not available in the asynchronous model', () => {
  const s = byKey('flooding');
  s.code = s.code.replace('seen := ∅', 'seen := ∅\n    x := DELTA');
  const r = C.runSimulation(s);
  assert.ok(r.compile.errors.some(e => e.msg.includes('"DELTA" is not available')));
});

test('static check: Rounds is rejected outside the rounds model', () => {
  const s = byKey('floodset');
  s.assumed.timing = 'asynchronous';
  const r = C.runSimulation(s);
  assert.ok(r.compile.errors.some(e => e.msg.includes('"Rounds" is only available')));
});

test('static check: event direction against the interface', () => {
  const s = byKey('flooding');
  s.code = s.code.replace('trigger ⟨fb, Deliver | self, m⟩', 'trigger ⟨fb, Broadcast | m⟩');
  const r = C.runSimulation(s);
  assert.ok(r.compile.errors.some(e => e.msg.includes('is not an indication')));
});

test('equivalent ASCII syntax', () => {
  const code = `interface I request Go() indication Done(x) end
algorithm A implements I as a uses Net as net
  state s := {} ; k := map()
  upon event <a, Go> do
    s := s union {1, 2} minus {2}
    k[self] := #s + 1
    trigger <a, Done | k[self]>
    trigger <net, Send | self, [PING, (1 > 0)]>
  end
  upon event <net, Deliver | p, [PING, b]> where b do
    trigger <a, Done | {x in Procs where x > 1}>
  end
end`;
  const s = Object.assign(byKey('chang-roberts'), { code, top: 'A', inputs: '0ms 3 Go' });
  const r = C.runSimulation(s);
  assert.equal(r.error, null);
  assert.deepEqual(r.outputs.map(o => o.text), ['Done | 2', 'Done | {2, 3, 4, 5, 6, 7, 8}']);
});

test('syntax errors report the line', () => {
  const s = byKey('flooding');
  s.code = s.code.replace('forall q in neighbors do', 'forall q neighbors do');
  const r = C.runSimulation(s);
  assert.equal(r.ok, false);
  assert.ok(r.compile.errors[0].line > 0);
});

test('channel loss and crashes are recorded', () => {
  const s = byKey('flooding');
  s.actual.loss = 0.3;
  s.faults = [{ type: 'crash', node: 6, at: '10ms' }];
  const r = C.runSimulation(s);
  assert.ok(r.msgs.some(m => m.status === 'dropped-loss'));
  assert.equal(r.crashes[6], 10000);
  assert.ok(!r.outputs.some(o => o.node === 6 && o.t > 10000));
});

test('activity trace covers every delivery with a processing interval', () => {
  const r = C.runSimulation(byKey('flooding'));
  const delivered = r.msgs.filter(m => m.status === 'delivered').map(m => m.id).sort((a, b) => a - b);
  const handled = r.activity.filter(a => a.type === 'deliver').map(a => a.msg).sort((a, b) => a - b);
  assert.deepEqual(handled, delivered);
  assert.ok(r.activity.every(a => a.end >= a.t));
});

test('injecting an input later leaves the earlier trace unchanged', () => {
  const base = byKey('flooding');
  const a = C.runSimulation(base);
  const cut = 30000;
  const b = C.runSimulation(Object.assign(clone(base), { inputs: base.inputs + '\n30ms 5 Broadcast | "late"' }));
  const before = r => r.msgs.filter(m => m.sendT < cut).map(m => [m.from, m.to, m.payload, m.sendT, m.recvT]);
  assert.deepEqual(before(b), before(a));
  assert.ok(b.outputs.some(o => o.args[1] === '"late"'));
});

test('input lines are validated', () => {
  assert.equal(C.parseInputs('10ms * Propose | random(1, 9)').length, 1);
  assert.throws(() => C.parseInputs('soon 1 Start'), /Input line 1/);
});

test('durations and distributions', () => {
  assert.equal(C.parseDuration('1.5s'), 1500000);
  assert.equal(C.parseDuration('20'), 20000);
  assert.equal(C.fmtDuration(190000), '190 ms');
  assert.throws(() => C.parseDist('gauss(1)'));
  const xs = C.previewDelay('uniform(10ms, 20ms)', 0, '0ms', '15ms', 500);
  assert.ok(xs.every(x => x >= 10000 && x <= 15000));
});

test('FloodSet agrees on a generated complete graph', () => {
  const s = byKey('floodset');
  s.links = complete([1, 2, 3, 4, 5]);
  const r = C.runSimulation(s);
  assert.equal(decisions(r).size, 1);
});
