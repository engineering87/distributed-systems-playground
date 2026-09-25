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
  const s = Object.assign(byKey('floodset'), clone(PRESETS['sync-real']), { seed: 5 });
  const r = C.runSimulation(s);
  assert.ok(r.violations > 0);
  assert.ok(decisions(r).size > 1, 'expected disagreement with seed 5');
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
  assert.deepEqual(r.downs[6], [{ from: 10000, to: null }]);
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
  s.links = complete([1, 2, 3, 4]);
  const r = C.runSimulation(s);
  assert.equal(decisions(r).size, 1);
});

const suspectedAt = (r, id, t) => {
  const snaps = r.snaps[id].filter(x => x.t <= t);
  return C.fmt(snaps[snaps.length - 1].states.epfd.suspected);
};

test('a partition makes each side suspect the other, and healing restores them', () => {
  const r = C.runSimulation(byKey('epfd-partition'));
  assert.equal(r.error, null);
  assert.equal(suspectedAt(r, 1, 6.9e6), '{3, 4, 5}');
  assert.equal(suspectedAt(r, 3, 6.9e6), '{1, 2}');
  assert.equal(suspectedAt(r, 1, 10.5e6), '{5}');
  for (const id of [1, 2, 3, 4, 5]) assert.equal(suspectedAt(r, id, 14e6), '∅', `p${id}`);
});

test('messages across a partition are dropped, messages inside a group are not', () => {
  const r = C.runSimulation(byKey('epfd-partition'));
  const side = id => (id <= 2 ? 0 : 1);
  const during = m => m.sendT >= 4e6 && m.sendT < 7e6 && m.recvT < 7e6;
  const across = r.msgs.filter(m => during(m) && side(m.from) !== side(m.to));
  const inside = r.msgs.filter(m => during(m) && side(m.from) === side(m.to) && m.from !== m.to);
  assert.ok(across.length > 0 && across.every(m => m.status === 'dropped-cut'));
  assert.ok(inside.length > 0 && inside.every(m => m.status === 'delivered'));
});

test('recovery resets volatile state, keeps stable state and restarts the process', () => {
  const code = `interface Counter
  request Tick()
  indication Count(volatile, durable)
end
algorithm C
  implements Counter as c
  uses Net as net
  state
    v := 0
    stable d := 0
  upon event ⟨c, Tick⟩ do
    v := v + 1
    d := d + 1
    trigger ⟨c, Count | v, d⟩
  end
  upon event ⟨c, Recovery⟩ do
    log "back"
  end
end`;
  const s = Object.assign(byKey('chang-roberts'), {
    code, top: 'C', inputs: '0ms 1 Tick\n10ms 1 Tick\n30ms 1 Tick\n50ms 1 Tick',
    faults: [{ type: 'crash', node: 1, at: '20ms' }, { type: 'recover', node: 1, at: '40ms' }]
  });
  const r = C.runSimulation(s);
  assert.equal(r.error, null);
  const counts = r.outputs.filter(o => o.node === 1).map(o => o.text);
  // the tick at 30ms is lost while p1 is down; after recovery v restarts from 0, d keeps counting
  assert.deepEqual(counts, ['Count | 1, 1', 'Count | 2, 2', 'Count | 1, 3']);
  assert.deepEqual(r.downs[1], [{ from: 20000, to: 40000 }]);
  assert.ok(r.log.some(e => e.kind === 'log' && e.text === 'back'));
});

test('without a Recovery handler a recovered process runs Init again', () => {
  const s = byKey('epfd');
  s.faults = [{ type: 'crash', node: 2, at: '4s' }, { type: 'recover', node: 2, at: '5s' }];
  const r = C.runSimulation(s);
  const after = r.msgs.filter(m => m.from === 2 && m.sendT > 5e6);
  assert.ok(after.length > 0, 'p2 sends heartbeats again after recovery');
});

test('a link failure drops messages only while the link is down', () => {
  const s = byKey('flooding');
  s.faults = [{ type: 'link', a: 1, b: 2, from: '0ms', to: '100ms' }];
  const r = C.runSimulation(s);
  const on12 = r.msgs.filter(m => (m.from === 1 && m.to === 2) || (m.from === 2 && m.to === 1));
  const whileDown = on12.filter(m => m.sendT < 100000);
  const afterwards = on12.filter(m => m.sendT >= 100000);
  assert.ok(whileDown.length > 0 && whileDown.every(m => m.status === 'dropped-cut'));
  assert.ok(afterwards.length > 0 && afterwards.every(m => m.status === 'delivered'));
  assert.ok(r.log.some(e => e.kind === 'fault' && e.text === 'link p1–p2 goes down'));
});

test('injecting a partition later leaves the earlier trace unchanged', () => {
  const base = byKey('epfd');
  const a = C.runSimulation(base);
  const b = C.runSimulation(Object.assign(clone(base), {
    faults: base.faults.concat([{ type: 'partition', groups: '1', from: '5s', to: '' }])
  }));
  const before = r => r.msgs.filter(m => m.recvT !== null && m.recvT < 5e6).map(m => [m.from, m.to, m.sendT, m.recvT, m.status]);
  assert.deepEqual(before(b), before(a));
  assert.ok(b.msgs.some(m => m.status === 'dropped-cut'));
});

test('fault definitions are validated', () => {
  assert.deepEqual(C.normalizeFault({ type: 'partition', groups: 'p1 2 | 3', from: '1s', to: '' }),
    { type: 'partition', groups: [[1, 2], [3]], from: 1000000, to: null, oneWay: false });
  assert.throws(() => C.normalizeFault({ type: 'link', a: 1, b: 1, from: '0ms' }), /two different/);
  assert.throws(() => C.normalizeFault({ type: 'partition', groups: '1 2 | 2 3', from: '0ms' }), /more than one/);
  assert.throws(() => C.normalizeFault({ type: 'link', a: 1, b: 2, from: '2s', to: '1s' }), /after the start/);
  assert.throws(() => C.normalizeFault({ type: 'recover', node: 'x', at: '1s' }), /process number/);
});

// ---------------------------------------------------------------- language extensions
const L = require('../src/library.js');
const { ringLayout } = require('../src/examples.js');

function tiny(code, inputs, extra) {
  return Object.assign({
    seed: 1, nodes: ringLayout([1, 2, 3], 200, 200, 100), links: complete([1, 2, 3]), code, inputs, faults: [],
    assumed: { timing: 'asynchronous' }, actual: { delay: 'const(5ms)', step: 'const(0ms)' }, stopAt: '2s'
  }, extra || {});
}

test('functions return values, recurse, and can trigger events', () => {
  const code = `interface T
  request Go(n)
  indication Out(x)
end
algorithm A
  implements T as t
  uses Net as net
  state
    count := 0
  function fact(n)
    if n <= 1 then
      return 1
    end
    return n * fact(n - 1)
  end
  function emit(x)
    count := count + 1
    trigger ⟨t, Out | x⟩
  end
  upon event ⟨t, Go | n⟩ do
    call emit(fact(n))
    call emit(count)
  end
end`;
  const r = C.runSimulation(tiny(code, '0ms 1 Go | 5'));
  assert.equal(r.error, null);
  assert.deepEqual(r.outputs.map(o => o.text), ['Out | 120', 'Out | 1']);
});

test('function checks: arity, return outside functions, unknown calls, runaway recursion', () => {
  const bad = `interface T request Go() indication Out(x) end
algorithm A implements T as t uses Net as net
  function f(a, b)
    return a
  end
  upon event ⟨t, Go⟩ do
    x := f(1)
    return 3
    call g()
    call size(1)
  end
end`;
  const r = C.runSimulation(tiny(bad, ''));
  const msgs = r.compile.errors.map(e => e.msg).join(' | ');
  assert.match(msgs, /"f" takes 2 argument/);
  assert.match(msgs, /"return" can only be used inside a function/);
  assert.match(msgs, /Unknown function "g"/);
  assert.match(msgs, /"call" is for your own functions/);
  const loop = `interface T request Go() indication Out(x) end
algorithm A implements T as t uses Net as net
  function f(n)
    return f(n + 1)
  end
  upon event ⟨t, Go⟩ do
    x := f(0)
  end
end`;
  const r2 = C.runSimulation(tiny(loop, '0ms 1 Go'));
  assert.match(r2.error, /nested deeper/);
});

test('new built-in functions', () => {
  const code = `interface T request Go() indication Out(x) end
algorithm A implements T as t uses Net as net
  upon event ⟨t, Go⟩ do
    m := map()
    m[3] := 9
    m[1] := 4
    trigger ⟨t, Out | [head([7, 8]), last([7, 8]), tail([7, 8, 9]), sort({3, 1, 2}), reverse([1, 2])]⟩
    trigger ⟨t, Out | [slice([1, 2, 3, 4], 1, 3), range(0, 3), remove({1, 2}, 1), remove([1, 2, 1], 1), get(m, 5, 0)]⟩
    trigger ⟨t, Out | [sum([1, 2, 3]), mean([2, 4]), argmin(m), argmax(m), sqrt(16), round(ln(exp(2))), pow(2, 10), floor(2.7), ceil(2.1)]⟩
    trigger ⟨t, Out | pick({5}) = 5⟩
  end
end`;
  const r = C.runSimulation(tiny(code, '0ms 1 Go'));
  assert.equal(r.error, null);
  assert.deepEqual(r.outputs.map(o => o.args[0]), [
    '[7, 8, [8, 9], [1, 2, 3], [2, 1]]',
    '[[2, 3], [0, 1, 2], {2}, [2, 1], 0]',
    '[6, 3, 1, 3, 4, 2, 1024, 2, 3]',
    'true'
  ]);
});

test('"via" chooses the implementation of an interface', () => {
  const code = L.source('ack-links') + '\n' + L.byKey.get('eliminate-duplicates').source + '\n' + L.byKey.get('stubborn-links').source + '\n' +
    L.IFACES.StubbornLinks + `
interface T request Go() indication Out(x) end
algorithm A implements T as t uses PerfectLinks as pl via EliminateDuplicates
  upon event ⟨t, Go⟩ do trigger ⟨pl, Send | 2, "hi"⟩ end
  upon event ⟨pl, Deliver | p, m⟩ do trigger ⟨t, Out | m⟩ end
end`;
  const r = C.runSimulation(tiny(code, '0ms 1 Go', { top: 'A' }));
  assert.equal(r.error, null);
  assert.deepEqual(r.specs.map(x => x.algo), ['A', 'EliminateDuplicates', 'RetransmitLinks']);
  const wrong = code.replace('via EliminateDuplicates', 'via RetransmitLinks');
  const r2 = C.runSimulation(tiny(wrong, '0ms 1 Go', { top: 'A' }));
  assert.ok(r2.compile.errors.some(e => /implements StubbornLinks, not PerfectLinks/.test(e.msg)));
});

// ---------------------------------------------------------------- library
function libScenario(key, app, opts) {
  const ids = Array.from({ length: opts.n || 4 }, (_, i) => i + 1);
  const iface = L.byKey.get(key).implements;
  return Object.assign(tiny(L.source(key) + '\n' + app(iface), opts.inputs, { top: 'App', faults: opts.faults || [] }), {
    seed: opts.seed || 1, nodes: ringLayout(ids, 300, 200, 150), links: complete(ids),
    actual: Object.assign({ delay: 'uniform(5ms, 30ms)', step: 'uniform(100us, 1ms)' }, opts.actual || {}), stopAt: opts.stopAt || '5s'
  });
}
const linkApp = I => `interface Top request Go(q, m) indication Got(p, m) end
algorithm App implements Top as app uses ${I} as x
  upon event ⟨app, Go | q, m⟩ do trigger ⟨x, Send | q, m⟩ end
  upon event ⟨x, Deliver | p, m⟩ do trigger ⟨app, Got | p, m⟩ end
end`;
const bApp = I => `interface Top request Go(m) indication Got(p, m) end
algorithm App implements Top as app uses ${I} as x
  upon event ⟨app, Go | m⟩ do trigger ⟨x, Broadcast | m⟩ end
  upon event ⟨x, Deliver | p, m⟩ do trigger ⟨app, Got | p, m⟩ end
end`;
const gotBy = (r, n) => r.outputs.filter(o => o.node === n).map(o => o.args[1]);

test('library: perfect links deliver exactly once over a lossy network', () => {
  for (const key of ['ack-links', 'eliminate-duplicates']) {
    const inputs = Array.from({ length: 10 }, (_, i) => `${i * 10}ms 1 Go | 2, "m${i}"`).join('\n');
    const r = C.runSimulation(libScenario(key, linkApp, { inputs, actual: { loss: 0.3 }, seed: 4 }));
    assert.equal(r.error, null, key);
    const g = gotBy(r, 2);
    assert.equal(g.length, 10, key);
    assert.equal(new Set(g).size, 10, key);
  }
});

test('library: FIFO links restore the sending order', () => {
  const inputs = Array.from({ length: 12 }, (_, i) => `${i}ms 1 Go | 3, ${i}`).join('\n');
  const r = C.runSimulation(libScenario('fifo-links', linkApp, { inputs, actual: { fifo: false, delay: 'uniform(1ms, 120ms)', loss: 0.1 }, seed: 2 }));
  assert.deepEqual(gotBy(r, 3).map(Number), [...Array(12).keys()]);
});

test('library: uniform reliable and FIFO reliable broadcast', () => {
  const r = C.runSimulation(libScenario('urb', bApp, { n: 5, inputs: '0ms 1 Go | "a"\n5ms 3 Go | "b"' }));
  for (const n of [1, 2, 3, 4, 5]) assert.equal(gotBy(r, n).length, 2);
  const inputs = Array.from({ length: 8 }, (_, i) => `${i}ms 1 Go | ${i}`).join('\n');
  const f = C.runSimulation(libScenario('fifo-rb', bApp, { n: 4, inputs, actual: { fifo: false, delay: 'uniform(1ms, 80ms)' }, seed: 5 }));
  for (const n of [2, 3, 4]) assert.deepEqual(gotBy(f, n).map(Number), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('examples: reliable broadcast survives a sender crash where best-effort does not', () => {
  const s = byKey('reliable-broadcast');
  const r = C.runSimulation(s);
  assert.deepEqual([2, 3, 4, 5].filter(n => gotBy(r, n).length), [2, 3, 4, 5]);
  const beb = Object.assign(clone(s), { code: s.code.replace('uses ReliableBroadcast as rb', 'uses BestEffortBroadcast as rb') });
  const b = C.runSimulation(beb);
  assert.deepEqual([2, 3, 4, 5].filter(n => gotBy(b, n).length), [2]);
});

test('examples: causal broadcast never shows an answer before its question', () => {
  const s = byKey('causal-broadcast');
  const answerFirst = r => [1, 3, 4, 5].filter(n => { const g = gotBy(r, n); return g.indexOf('"answer"') < g.indexOf('"question"'); });
  for (let seed = 1; seed <= 30; seed++) {
    const r = C.runSimulation(Object.assign(clone(s), { seed }));
    assert.deepEqual(answerFirst(r), [], `seed ${seed}`);
  }
  const rb = C.runSimulation(Object.assign(clone(s), { code: s.code.replace('uses CausalOrderBroadcast as cb', 'uses ReliableBroadcast as cb') }));
  assert.deepEqual(answerFirst(rb), [4, 5]);
});

test('examples: gossip reaches part of the network without duplicates', () => {
  const r = C.runSimulation(byKey('gossip'));
  const reached = new Set(r.outputs.map(o => o.node));
  assert.ok(reached.size >= 8 && reached.size < 16, `reached ${reached.size}`);
  assert.equal(r.outputs.length, reached.size);
});

test('messages record the module that originated them, and layers are traced', () => {
  const r = C.runSimulation(byKey('reliable-broadcast'));
  const origins = new Set(r.msgs.map(m => r.specs[m.origin].algo));
  assert.deepEqual([...origins].sort(), ['AckLinks', 'EagerReliableBroadcast', 'Newsroom']);
  assert.ok(r.msgs.filter(m => m.payload.startsWith('[ACK')).every(m => r.specs[m.origin].algo === 'AckLinks'));
  const first = r.localEvents.slice(0, 3).map(e => [e.from, e.to, e.ev]);
  assert.deepEqual(first, [['app', 0, 'Publish'], [0, 1, 'Broadcast'], [1, 2, 'Broadcast']]);
  assert.ok(r.localEvents.some(e => e.from === 'net' && e.ev === 'Deliver'));
  assert.ok(r.localEvents.some(e => e.to === 'app' && e.ev === 'Read'));
  assert.deepEqual(r.specs.map(x => x.depth), [0, 1, 2, 3]);
});

test('causal cone follows the happened-before relation', () => {
  // p1 -> p2 at 10ms (arrives 15ms), p2 -> p3 at 30ms (arrives 35ms)
  const res = {
    nodeInfo: { 1: {}, 2: {}, 3: {} },
    msgs: [
      { from: 1, to: 2, sendT: 10, recvT: 15, status: 'delivered' },
      { from: 2, to: 3, sendT: 30, recvT: 35, status: 'delivered' },
      { from: 3, to: 1, sendT: 5, recvT: 50, status: 'delivered' }
    ],
    activity: [{ node: 1, t: 10 }, { node: 2, t: 15 }, { node: 2, t: 30 }, { node: 3, t: 35 }, { node: 3, t: 5 }, { node: 1, t: 50 }]
  };
  const c = C.causalCone(res, 3, 35);
  assert.deepEqual(c.past, { 1: 10, 2: 30, 3: 35 });
  // the message p3 -> p1 was sent at 5ms, before the origin, so p1 is not in the future
  assert.deepEqual(c.future, { 1: Infinity, 2: Infinity, 3: 35 });
  const d = C.causalCone(res, 2, 15);
  assert.deepEqual(d.past, { 1: 10, 2: 15, 3: -Infinity });
  assert.deepEqual(d.future, { 1: Infinity, 2: 15, 3: 35 });
  // p1@10 before; p2@30 and p3@35 after; p3@5 and p1@50 concurrent
  assert.deepEqual(d.counts, { past: 1, future: 2, concurrent: 2 });
});

test('with duplication on, a fault injected later still leaves the earlier trace unchanged', () => {
  // many messages on one channel; a partition from 5ms drops some of them while in flight,
  // and the messages sent before 5ms must keep their delays and duplicates
  const code = `interface T request Go(q) indication Got(p) end
algorithm A implements T as t uses Net as net
  upon event ⟨t, Go | q⟩ do trigger ⟨net, Send | q, [PING]⟩ end
  upon event ⟨net, Deliver | p, [PING]⟩ do trigger ⟨t, Got | p⟩ end
end`;
  const inputs = Array.from({ length: 20 }, (_, i) => `${i * 500}us 1 Go | 2`).join('\n');
  const base = tiny(code, inputs, { actual: { delay: 'uniform(1ms, 8ms)', step: 'const(0ms)', dup: 0.5 }, stopAt: '1s' });
  const a = C.runSimulation(base);
  const b = C.runSimulation(Object.assign(clone(base), { faults: [{ type: 'partition', groups: '1', from: '5ms', to: '' }] }));
  assert.ok(b.msgs.some(m => m.status === 'dropped-cut' && m.sendT < 5000), 'some message is cut in flight');
  const sent = r => r.msgs.filter(m => m.sendT < 5000);
  const shape = r => sent(r).map(m => [m.sendT, m.dup]);
  assert.deepEqual(shape(b), shape(a), 'same messages and duplicates before the partition');
  const kept = sent(b).filter(m => m.status !== 'dropped-cut');
  const orig = sent(a);
  for (const m of kept) assert.equal(m.recvT, orig.find(o => o.id === m.id).recvT);
});

// ---------------------------------------------------------------- global properties
test('properties see the state of every process and report the first violation', () => {
  const code = `interface T
  request Set(v)
  indication Done(v)
end
algorithm A
  implements T as t
  uses Net as net
  state
    value := nil
  upon event ⟨t, Set | v⟩ do
    value := v
    trigger ⟨t, Done | v⟩
  end
end

property SameValue always
  #toset(values(defined(value))) ≤ 1
end

property EveryoneSet eventually
  keys(defined(value)) = correct
end`;
  const same = C.runSimulation(tiny(code, '0ms 1 Set | 7\n1ms 2 Set | 7\n2ms 3 Set | 7'));
  assert.equal(same.error, null);
  assert.deepEqual(same.properties.map(p => [p.name, p.kind, p.ok]), [['SameValue', 'always', true], ['EveryoneSet', 'eventually', true]]);

  const differ = C.runSimulation(tiny(code, '0ms 1 Set | 7\n1ms 2 Set | 9'));
  const [agreement, everyone] = differ.properties;
  assert.equal(agreement.ok, false);
  assert.equal(agreement.node, 2);
  assert.equal(agreement.at, 1000);
  assert.equal(everyone.ok, false, 'p3 never sets a value');
  assert.ok(differ.log.some(e => e.kind === 'property' && e.text === 'SameValue is violated'));
  assert.equal(differ.violations, 0, 'a broken property is not a timing violation');

  const halted = C.runSimulation(Object.assign(tiny(code, '0ms 1 Set | 7\n1ms 2 Set | 9'), { haltOnProperty: true }));
  assert.match(halted.stopReason, /Property violated: SameValue/);
});

test('a property can only name state variables and the globals it is given', () => {
  const head = `interface T request Go() indication Out(x) end
algorithm A implements T as t uses Net as net state d := nil upon event ⟨t, Go⟩ do skip end end
`;
  const errs = src => C.runSimulation(tiny(head + src, '')).compile.errors.map(e => e.msg).join(' | ');
  assert.match(errs('property P always self = 1 end'), /"self" is not available in a property/);
  assert.match(errs('property P always nope = 1 end'), /"nope" is not a state variable/);
  assert.match(errs('property P always size(1, 2) end'), /"size" takes 1 argument/);
  assert.match(errs('property P always now() = 0 end'), /"now" is not available in a property/);
  assert.match(errs('property P always random(1, 2) = 1 end'), /must not depend on chance/);
  assert.match(errs('property P always t ≥ 0 end'), /^$/, '"t" is available');
  assert.match(errs('property P always true end\nproperty P always false end'), /Property "P" is already defined/);
  // a property that is not a boolean is reported at runtime, without stopping the run
  const r = C.runSimulation(tiny(head + 'property P always #d end', '0ms 1 Go'));
  assert.equal(r.error, null);
  assert.equal(r.properties[0].ok, false);
  assert.match(r.properties[0].error, /not a boolean|Expected/);
});

test('the FloodSet example carries agreement, validity and termination', () => {
  const s = byKey('floodset');
  const ideal = C.runSimulation(s);
  assert.deepEqual(ideal.properties.map(p => p.name + ':' + p.ok), ['Agreement:true', 'Validity:true', 'Termination:true']);
  const real = C.runSimulation(Object.assign(clone(s), clone(PRESETS['sync-real']), { seed: 5 }));
  const agreement = real.properties.find(p => p.name === 'Agreement');
  assert.equal(agreement.ok, false);
  assert.equal(real.properties.find(p => p.name === 'Validity').ok, true, 'processes still decide a proposed value');
  for (let seed = 1; seed <= 20; seed++) {
    const r = C.runSimulation(Object.assign(clone(s), { seed }));
    assert.ok(r.properties.every(p => p.ok), 'ideal rounds keep every property, seed ' + seed);
  }
});

// ---------------------------------------------------------------- pauses, omissions, one-way links
const PING = `interface T
  request Go(q)
  indication Got(p)
end
algorithm Pinger
  implements T as t
  uses Net as net
  upon event ⟨t, Go | q⟩ do trigger ⟨net, Send | q, [PING]⟩ end
  upon event ⟨net, Deliver | p, [PING]⟩ do trigger ⟨t, Got | p⟩ end
end`;
function pingScenario(faults, inputs) {
  const s = tiny(PING, inputs || '0ms 1 Go | 2\n0ms 2 Go | 1', { top: 'Pinger', faults });
  s.actual = Object.assign({}, s.actual, { delay: 'const(10ms)', step: 'const(0ms)' });
  return s;
}
const statuses = r => r.msgs.map(m => `p${m.from}>p${m.to} ${m.status}`);

test('a link failure can be one way', () => {
  const both = C.runSimulation(pingScenario([{ type: 'link', a: 1, b: 2, from: '0ms', to: '' }]));
  assert.deepEqual(statuses(both), ['p1>p2 dropped-cut', 'p2>p1 dropped-cut']);
  const one = C.runSimulation(pingScenario([{ type: 'link', a: 1, b: 2, from: '0ms', to: '', oneWay: true }]));
  assert.deepEqual(statuses(one), ['p1>p2 dropped-cut', 'p2>p1 delivered']);
  assert.equal(one.netFaults.links[0].oneWay, true);
});

test('a paused process handles nothing while paused and loses nothing', () => {
  const r = C.runSimulation(pingScenario([{ type: 'pause', node: 2, from: '5ms', to: '100ms' }]));
  assert.deepEqual(statuses(r), ['p1>p2 delivered', 'p2>p1 delivered']);
  const got = r.outputs.filter(o => o.node === 2);
  assert.equal(got.length, 1);
  assert.equal(got[0].t, 100000, 'the message waits for the end of the pause');
  assert.deepEqual(r.pauses, { 2: [{ from: 5000, to: 100000 }] });
  assert.ok(r.log.some(e => e.kind === 'fault' && /p2 pauses/.test(e.text)));
  assert.ok(r.log.some(e => e.kind === 'fault' && e.t === 100000 && /p2 resumes/.test(e.text)));
  assert.deepEqual(r.downs, {}, 'a pause is not a crash');
});

test('an omitting process drops the messages it sends, receives, or both', () => {
  const send = C.runSimulation(pingScenario([{ type: 'omission', node: 1, direction: 'send', prob: 1, from: '0ms', to: '' }]));
  assert.deepEqual(statuses(send), ['p1>p2 dropped-omission', 'p2>p1 delivered']);
  const recv = C.runSimulation(pingScenario([{ type: 'omission', node: 1, direction: 'receive', prob: 1, from: '0ms', to: '' }]));
  assert.deepEqual(statuses(recv), ['p1>p2 delivered', 'p2>p1 dropped-omission']);
  const window = C.runSimulation(pingScenario([{ type: 'omission', node: 1, direction: 'send', prob: 1, from: '5ms', to: '20ms' }],
    '0ms 1 Go | 2\n10ms 1 Go | 2'));
  assert.deepEqual(statuses(window), ['p1>p2 delivered', 'p1>p2 dropped-omission']);
  // a probability between 0 and 1 omits some of them, reproducibly
  const some = C.runSimulation(pingScenario([{ type: 'omission', node: 1, prob: 0.5, from: '0ms', to: '' }],
    Array.from({ length: 30 }, (_, i) => `${i}ms 1 Go | 2`).join('\n')));
  const omitted = some.msgs.filter(m => m.status === 'dropped-omission').length;
  assert.ok(omitted > 4 && omitted < 26, `omitted ${omitted} of 30`);
  const again = C.runSimulation(pingScenario([{ type: 'omission', node: 1, prob: 0.5, from: '0ms', to: '' }],
    Array.from({ length: 30 }, (_, i) => `${i}ms 1 Go | 2`).join('\n')));
  assert.deepEqual(statuses(again), statuses(some), 'the same scenario gives the same omissions');
});

test('the new faults are validated', () => {
  assert.throws(() => C.normalizeFault({ type: 'pause', node: 1, from: '5ms', to: '1ms' }), /end must come after the start/);
  assert.throws(() => C.normalizeFault({ type: 'pause', node: 1, from: '5ms' }), /required/);
  assert.throws(() => C.normalizeFault({ type: 'omission', node: 1, prob: 2, from: '0ms' }), /probability must be between 0 and 1/);
  assert.throws(() => C.normalizeFault({ type: 'omission', node: 1, direction: 'x', from: '0ms' }), /direction must be send, receive or both/);
  assert.deepEqual(C.normalizeFault({ type: 'omission', node: 3, from: '1s' }), { type: 'omission', node: 3, direction: 'both', prob: 1, from: 1000000, to: null });
  assert.equal(C.normalizeFault({ type: 'link', a: 1, b: 2, from: '0ms', oneWay: true }).oneWay, true);
});

// ---------------------------------------------------------------- catalog examples
test('the perfect detector suspects the crashed process and nobody else', () => {
  const r = C.runSimulation(byKey('perfect-detector'));
  assert.equal(r.error, null);
  assert.ok(r.properties.every(p => p.ok), JSON.stringify(r.properties));
  assert.deepEqual([...new Set(r.outputs.map(o => o.args[0]))], ['3'], 'only p3 is suspected');
  assert.deepEqual([...new Set(r.outputs.map(o => o.node))].sort(), [1, 2, 4], 'by every correct process');
  assert.ok(r.outputs.every(o => o.t > 1e6 && o.t < 1.5e6), 'within half a second of the crash');
  // when the network breaks the bound it relies on, the detector stops being perfect
  const slow = Object.assign(clone(byKey('perfect-detector')), {});
  slow.actual = Object.assign({}, slow.actual, { delay: 'uniform(5ms, 900ms)', bound: '' });
  const broken = C.runSimulation(slow);
  assert.equal(broken.properties.find(p => p.name === 'Accuracy').ok, false, 'a correct process gets suspected');
});

test('Ω settles on one correct leader, and moves when it crashes', () => {
  const r = C.runSimulation(byKey('omega-leader'));
  assert.equal(r.error, null);
  assert.equal(r.properties[0].name, 'EventualAgreement');
  assert.equal(r.properties[0].ok, true);
  const last = {};
  for (const o of r.outputs) last[o.node] = o.args[0];
  delete last[1];   // p1 crashed: its own last word does not count
  assert.deepEqual([...new Set(Object.values(last))], ['2'], 'every correct process ends up trusting p2');
  const before = r.outputs.filter(o => o.t < 3e6).length;
  assert.ok(before > 5, 'before GST the trusted leader changes several times: ' + before);
});

test('Ricart-Agrawala lets one process at a time into the critical section', () => {
  const r = C.runSimulation(byKey('mutual-exclusion'));
  assert.equal(r.error, null);
  assert.equal(r.properties[0].ok, true);
  const order = r.outputs.filter(o => o.ev === 'Enter').map(o => o.node);
  assert.deepEqual(order, [1, 2, 3], 'they enter in timestamp order');
  const events = r.outputs.map(o => o.ev);
  for (let i = 0; i < events.length; i += 2) assert.deepEqual([events[i], events[i + 1]], ['Enter', 'Exit'], 'never two inside');
});

test('two-phase commit commits together, and blocks when the coordinator crashes in between', () => {
  const r = C.runSimulation(byKey('two-phase-commit'));
  assert.equal(r.error, null);
  assert.ok(r.properties.every(p => p.ok));
  assert.deepEqual([...new Set(r.outputs.map(o => o.args[0]))], ['COMMIT']);
  assert.equal(r.outputs.length, 4, 'every process decides');

  const blocked = C.runSimulation(Object.assign(clone(byKey('two-phase-commit')), { faults: [{ type: 'crash', node: 1, at: '25ms' }] }));
  assert.equal(blocked.outputs.length, 0, 'nobody decides');
  assert.equal(blocked.properties.find(p => p.name === 'Agreement').ok, true, 'agreement is not the problem');
  assert.equal(blocked.properties.find(p => p.name === 'Termination').ok, false, 'the participants are blocked');

  const late = C.runSimulation(Object.assign(clone(byKey('two-phase-commit')), { faults: [{ type: 'crash', node: 1, at: '60ms' }] }));
  assert.ok(late.properties.every(p => p.ok), 'a crash after the announcement changes nothing');
});

// ---------------------------------------------------------------- faults armed by a condition
test('a fault can wait for a condition instead of a time', () => {
  const base = byKey('two-phase-commit');
  // the coordinator dies as soon as it has all but one vote: nobody ever decides
  const early = C.runSimulation(Object.assign(clone(base), { faults: [{ type: 'crash', node: 1, when: '#keys(votes[1]) = N - 2' }] }));
  assert.equal(early.error, null);
  assert.equal(early.outputs.length, 0, 'nobody decides');
  assert.equal(early.properties.find(p => p.name === 'Termination').ok, false);
  const fired = early.log.filter(e => /armed by a condition/.test(e.text));
  assert.equal(fired.length, 1);
  assert.ok(fired[0].t > 0 && fired[0].t < 100000, 'it fired where the condition became true: ' + fired[0].t);

  // the same fault armed after the last vote arrives: the announcement has already left
  const late = C.runSimulation(Object.assign(clone(base), { faults: [{ type: 'crash', node: 1, when: '#keys(votes[1]) = N - 1' }] }));
  assert.equal(late.outputs.length, 4, 'everybody decides');

  // a condition that never holds fires nothing
  const never = C.runSimulation(Object.assign(clone(base), { faults: [{ type: 'crash', node: 1, when: '#keys(votes[1]) > N' }] }));
  assert.deepEqual(never.downs, {});
  assert.equal(never.outputs.length, 4);
});

test('an armed fault that lasts uses "for", and a broken condition is reported', () => {
  const base = byKey('omega-leader');
  const paused = C.runSimulation(Object.assign(clone(base), {
    faults: [{ type: 'pause', node: 1, when: '#toset(values(defined(leader))) = 1 and t > 3s', for: '2s' }]
  }));
  assert.equal(paused.error, null);
  const pauses = paused.pauses[1];
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].to - pauses[0].from, 2000000, 'it lasts exactly two seconds');
  assert.ok(pauses[0].from > 3000000);

  const bad = C.runSimulation(Object.assign(clone(base), { faults: [{ type: 'crash', node: 1, when: 'leader' }] }));
  assert.equal(bad.error, null, 'the run continues');
  assert.ok(bad.log.some(e => e.kind === 'warn' && /is not a boolean/.test(e.text)));
  assert.throws(() => C.normalizeFault({ type: 'crash', node: 1, when: '#(' }), /does not parse/);
});

test('a partition can be one way', () => {
  const base = byKey('epfd');
  const both = C.runSimulation(Object.assign(clone(base), { faults: [{ type: 'partition', groups: '1', from: '1s', to: '3s' }] }));
  const oneWay = C.runSimulation(Object.assign(clone(base), { faults: [{ type: 'partition', groups: '1', from: '1s', to: '3s', oneWay: true }] }));
  const cut = r => [...new Set(r.msgs.filter(m => m.status === 'dropped-cut').map(m => m.from + '>' + m.to))].sort();
  assert.ok(cut(both).some(x => x.startsWith('1>')) && cut(both).some(x => x.endsWith('>1')), 'both directions');
  assert.ok(cut(oneWay).every(x => x.startsWith('1>')), 'only what leaves p1: ' + cut(oneWay).join(', '));
  assert.equal(oneWay.netFaults.partitions[0].oneWay, true);
});

test('logical clocks keep their invariants, and the Lamport counter passes what it receives', () => {
  const r = C.runSimulation(byKey('logical-clocks'));
  assert.equal(r.error, null);
  assert.ok(r.properties.every(p => p.ok), JSON.stringify(r.properties.map(p => [p.name, p.ok])));
  assert.equal(r.log.filter(e => e.kind === 'assert').length, 0, 'no assertion failed');
  const receives = r.outputs.filter(o => o.args[0] === 'RECEIVE');
  assert.ok(receives.length >= 4, 'messages are received');
  // a receive always reports a counter above the one of the send it answers
  const sends = r.outputs.filter(o => o.args[0] === 'SEND');
  assert.ok(Math.max(...receives.map(o => +o.args[1])) > Math.max(...sends.map(o => +o.args[1])) - 1);

  // without the max the counter no longer passes the timestamp, and the assert says so
  const broken = clone(byKey('logical-clocks'));
  broken.code = broken.code.replace('lc := max({lc, ts}) + 1', 'lc := lc + 1');
  const bad = C.runSimulation(broken);
  assert.ok(bad.log.some(e => e.kind === 'assert'), 'the assertion catches it');
});

test('a snapshot records a consistent cut, and loses coins without FIFO channels', () => {
  const r = C.runSimulation(byKey('snapshot'));
  assert.equal(r.error, null);
  assert.ok(r.properties.every(p => p.ok), JSON.stringify(r.properties.map(p => [p.name, p.ok])));
  const totals = r.outputs.map(o => +o.args[0]);
  assert.equal(totals.length, 4, 'every process finishes its snapshot');
  assert.equal(totals.reduce((a, b) => a + b, 0), 400, 'the cut holds every coin');

  // FIFO is the hypothesis of the algorithm, not a detail: some seeds lose coins without it
  const lost = [11, 13].map(seed => {
    const s = clone(byKey('snapshot'));
    s.seed = seed;
    s.actual = Object.assign({}, s.actual, { fifo: false });
    const run = C.runSimulation(s);
    return { seed, total: run.outputs.reduce((a, o) => a + +o.args[0], 0), ok: run.properties[0].ok };
  });
  assert.ok(lost.some(x => x.total < 400 && !x.ok), 'a non-FIFO run records less than everything: ' + JSON.stringify(lost));
});
