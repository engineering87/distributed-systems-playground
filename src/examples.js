(function (root) {
'use strict';

function ringLayout(ids, cx, cy, r) {
  return ids.map((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
    return { id, x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  });
}
function complete(ids) {
  const l = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) l.push({ a: ids[i], b: ids[j], directed: false, enabled: true });
  return l;
}

const FLOODING = `// Flooding broadcast on an arbitrary topology.
// Every process forwards a new message to all neighbors
// except the one it came from.

interface Broadcast
  request Broadcast(m)
  indication Deliver(p, m)
end

algorithm Flooding
  implements Broadcast as fb
  uses Net as net
  state
    seen := ∅

  upon event ⟨fb, Broadcast | m⟩ do
    seen := seen ∪ {m}
    trigger ⟨fb, Deliver | self, m⟩
    forall q in neighbors do
      trigger ⟨net, Send | q, [FLOOD, self, m]⟩
    end
  end

  upon event ⟨net, Deliver | p, [FLOOD, o, m]⟩ where m ∉ seen do
    seen := seen ∪ {m}
    trigger ⟨fb, Deliver | o, m⟩
    forall q in neighbors where q ≠ p do
      trigger ⟨net, Send | q, [FLOOD, o, m]⟩
    end
  end

  upon event ⟨net, Deliver | p, [FLOOD, o, m]⟩ where m ∈ seen do
    skip  // already seen: do not forward
  end
end
`;

const CHANG_ROBERTS = `// Leader election on a directed ring (Chang-Roberts).
// The process with the highest identifier wins.

interface LeaderElection
  request Start()
  indication Elected(l)
end

algorithm ChangRoberts
  implements LeaderElection as le
  uses Net as net
  state
    participant := false
    leader := nil

  upon event ⟨le, Start⟩ do
    if not participant then
      participant := true
      trigger ⟨net, Send | choose(neighbors), [ELECTION, self]⟩
    end
  end

  upon event ⟨net, Deliver | p, [ELECTION, id]⟩ do
    if id > self then
      participant := true
      trigger ⟨net, Send | choose(neighbors), [ELECTION, id]⟩
    elif id < self and not participant then
      participant := true
      trigger ⟨net, Send | choose(neighbors), [ELECTION, self]⟩
    elif id = self then
      trigger ⟨net, Send | choose(neighbors), [ELECTED, self]⟩
    end
  end

  upon event ⟨net, Deliver | p, [ELECTED, l]⟩ do
    leader := l
    trigger ⟨le, Elected | l⟩
    if l ≠ self then
      trigger ⟨net, Send | choose(neighbors), [ELECTED, l]⟩
    end
  end
end
`;

const FLOODSET = `// FloodSet consensus in the synchronous rounds model (complete graph).
// Tolerates f crashes with f + 1 rounds.
// Try the "Realistic synchronous" preset: late messages become
// omissions the algorithm does not expect.

interface Consensus
  request Propose(v)
  indication Decide(v)
end

algorithm FloodSet
  implements Consensus as c
  uses Rounds as net
  params
    f := 1
  state
    W := ∅
    decision := nil

  upon event ⟨c, Propose | v⟩ do
    W := W ∪ {v}
  end

  upon event ⟨net, RoundStart | r⟩ where r ≤ f + 1 do
    forall q in neighbors do
      trigger ⟨net, Send | q, [VALUES, W]⟩
    end
  end

  upon event ⟨net, Deliver | p, [VALUES, V]⟩ do
    W := W ∪ V
  end

  upon event ⟨net, RoundEnd | r⟩ where r = f + 1 and decision = nil do
    decision := min(W)
    trigger ⟨c, Decide | decision⟩
  end
end

// Properties are checked after every step, on the state of every process at once.
// A state variable reads as a map from process to its value there.
property Agreement always
  #toset(values(defined(decision))) ≤ 1
end

property Validity always
  #{p in keys(defined(decision)) where decision[p] ∉ W[p]} = 0
end

property Termination eventually
  keys(defined(decision)) = correct
end
`;

const EPFD = `// Eventually perfect failure detector (◇P) with increasing timeout.
// It does not use DELTA, so it works even when the bound is unknown.
// Before GST it suspects wrongly; afterwards the timeout adapts.

interface PerfectLinks
  request Send(q, m)
  indication Deliver(p, m)
end

interface EventuallyPerfectFailureDetector
  indication Suspect(p)
  indication Restore(p)
end

// Direct link over the network: it is "perfect" only if the network
// does not lose messages (loss = 0).
algorithm DirectLinks
  implements PerfectLinks as pl
  uses Net as net

  upon event ⟨pl, Send | q, m⟩ do
    trigger ⟨net, Send | q, m⟩
  end

  upon event ⟨net, Deliver | p, m⟩ do
    trigger ⟨pl, Deliver | p, m⟩
  end
end

algorithm IncreasingTimeout
  implements EventuallyPerfectFailureDetector as epfd
  uses PerfectLinks as pl
  params
    DELTA0 := 100ms
  state
    alive := Π
    suspected := ∅
    delay := DELTA0

  upon event ⟨epfd, Init⟩ do
    starttimer(t, delay)
  end

  upon event ⟨timer, Timeout | t⟩ do
    if alive ∩ suspected ≠ ∅ then
      delay := delay + DELTA0
    end
    forall p in Π do
      if p ∉ alive and p ∉ suspected then
        suspected := suspected ∪ {p}
        trigger ⟨epfd, Suspect | p⟩
      elif p ∈ alive and p ∈ suspected then
        suspected := suspected \\ {p}
        trigger ⟨epfd, Restore | p⟩
      end
      trigger ⟨pl, Send | p, [HEARTBEAT_REQUEST]⟩
    end
    alive := ∅
    starttimer(t, delay)
  end

  upon event ⟨pl, Deliver | q, [HEARTBEAT_REQUEST]⟩ do
    trigger ⟨pl, Send | q, [HEARTBEAT_REPLY]⟩
  end

  upon event ⟨pl, Deliver | p, [HEARTBEAT_REPLY]⟩ do
    alive := alive ∪ {p}
  end
end
`;

function gridScenario() {
  const nodes = [], links = [];
  let id = 1;
  const W = 4, H = 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) nodes.push({ id: id++, x: 110 + x * 150, y: 90 + y * 130 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x + 1;
    if (x < W - 1) links.push({ a: i, b: i + 1, directed: false, enabled: true });
    if (y < H - 1) links.push({ a: i, b: i + W, directed: false, enabled: true });
  }
  return { nodes, links };
}

const EXAMPLES = [
  {
    key: 'flooding',
    title: 'Flooding broadcast (asynchronous)',
    scenario: Object.assign(gridScenario(), {
      version: 1, seed: 7, code: FLOODING, top: 'Flooding',
      inputs: '0ms 1 Broadcast | "hello"\n40ms 12 Broadcast | "ok"',
      faults: [], preset: 'async',
      assumed: { timing: 'asynchronous', DELTA: 'unknown', PHI: 'unknown', RHO: 'unknown' },
      actual: { delay: 'lognormal(3, 0.6)', bound: '', loss: 0, dup: 0, fifo: true, spikeProb: 0.05, spikeExtra: '150ms',
        step: 'uniform(100us, 1ms)', offset: 'const(0ms)', rho: '0', gst: '', preGstDelay: '', roundMode: 'lockstep', roundLen: '1s' },
      violationPolicy: 'deliver-late', tieBreak: 'stable', stopAt: '2s'
    })
  },
  {
    key: 'chang-roberts',
    title: 'Ring leader election, Chang-Roberts (asynchronous)',
    scenario: (function () {
      const ids = [3, 7, 1, 5, 2, 8, 4, 6];
      const nodes = ringLayout(ids, 330, 230, 170);
      const links = ids.map((id, i) => ({ a: id, b: ids[(i + 1) % ids.length], directed: true, enabled: true }));
      return {
        version: 1, seed: 11, nodes, links, code: CHANG_ROBERTS, top: 'ChangRoberts',
        inputs: '0ms * Start', faults: [], preset: 'async',
        assumed: { timing: 'asynchronous', DELTA: 'unknown', PHI: 'unknown', RHO: 'unknown' },
        actual: { delay: 'exp(20ms)', bound: '', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
          step: 'uniform(100us, 1ms)', offset: 'const(0ms)', rho: '0', gst: '', preGstDelay: '', roundMode: 'lockstep', roundLen: '1s' },
        violationPolicy: 'deliver-late', tieBreak: 'stable', stopAt: '3s'
      };
    })()
  },
  {
    key: 'floodset',
    title: 'FloodSet consensus (synchronous rounds)',
    scenario: (function () {
      const ids = [1, 2, 3, 4];
      return {
        version: 1, seed: 5, nodes: ringLayout(ids, 330, 230, 160), links: complete(ids),
        code: FLOODSET, top: 'FloodSet',
        inputs: '0ms * Propose | random(1, 9)', faults: [], preset: 'sync-ideal',
        assumed: { timing: 'synchronous-rounds', DELTA: '40ms', PHI: '10ms', RHO: '0.0001' },
        actual: { delay: 'uniform(5ms, 30ms)', bound: '', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
          step: 'const(0ms)', offset: 'const(0ms)', rho: '0', gst: '', preGstDelay: '', roundMode: 'lockstep', roundLen: '1s' },
        violationPolicy: 'drop', tieBreak: 'stable', stopAt: '3s'
      };
    })()
  },
  {
    key: 'epfd',
    title: 'Failure detector ◇P (partially synchronous)',
    scenario: (function () {
      const ids = [1, 2, 3, 4];
      return {
        version: 1, seed: 5, nodes: ringLayout(ids, 330, 230, 150), links: complete(ids),
        code: EPFD, top: 'IncreasingTimeout',
        inputs: '', faults: [{ type: 'crash', node: 3, at: '6s' }], preset: 'partial',
        assumed: { timing: 'partial', DELTA: 'unknown', PHI: 'unknown', RHO: 'unknown' },
        actual: { delay: 'uniform(5ms, 40ms)', bound: '50ms', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
          step: 'uniform(100us, 1ms)', offset: 'uniform(0ms, 20ms)', rho: 'uniform(-0.0001, 0.0001)',
          gst: '3s', preGstDelay: 'pareto(20ms, 1.1)', roundMode: 'lockstep', roundLen: '1s' },
        violationPolicy: 'deliver-late', tieBreak: 'stable', stopAt: '12s'
      };
    })()
  }
];

EXAMPLES.push({
  key: 'epfd-partition',
  title: 'Failure detector across a partition and a recovery',
  scenario: (function () {
    const ids = [1, 2, 3, 4, 5];
    return {
      version: 1, seed: 5, nodes: ringLayout(ids, 330, 230, 160), links: complete(ids),
      code: EPFD.replace(
        '// Eventually perfect failure detector (◇P) with increasing timeout.',
        '// Eventually perfect failure detector (◇P) with increasing timeout.\n' +
        '// In this scenario the network splits into {p1, p2} and {p3, p4, p5}\n' +
        '// from 4s to 7s, then p5 crashes at 9s and recovers at 11s.'),
      top: 'IncreasingTimeout',
      inputs: '',
      faults: [
        { type: 'partition', groups: '1 2 | 3 4 5', from: '4s', to: '7s' },
        { type: 'crash', node: 5, at: '9s' },
        { type: 'recover', node: 5, at: '11s' }
      ],
      preset: 'custom',
      assumed: { timing: 'partial', DELTA: 'unknown', PHI: 'unknown', RHO: 'unknown' },
      actual: { delay: 'uniform(5ms, 40ms)', bound: '50ms', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
        step: 'uniform(100us, 1ms)', offset: 'uniform(0ms, 20ms)', rho: 'uniform(-0.0001, 0.0001)',
        gst: '1s', preGstDelay: 'pareto(20ms, 1.1)', roundMode: 'lockstep', roundLen: '1s' },
      violationPolicy: 'deliver-late', tieBreak: 'stable', stopAt: '14s'
    };
  })()
});

// ---- examples built from the library of communication abstractions
const Lib = (typeof module !== 'undefined' && module.exports) ? require('./library.js') : root.SimLibrary;

const RB_APP = `// Application on top of the broadcast stack.
// Swap "ReliableBroadcast" for "BestEffortBroadcast" in the uses line
// and run again with the same seed: when the sender crashes before its
// retransmissions, only some processes get the news.
interface News
  request Publish(m)
  indication Read(from, m)
end

algorithm Newsroom
  implements News as app
  uses ReliableBroadcast as rb

  upon event ⟨app, Publish | m⟩ do
    trigger ⟨rb, Broadcast | m⟩
  end

  upon event ⟨rb, Deliver | p, m⟩ do
    trigger ⟨app, Read | p, m⟩
  end
end
`;

const CAUSAL_APP = `// p1 asks a question, p2 answers as soon as it reads it.
// With causal order every process reads the question before the answer.
// Swap "CausalOrderBroadcast" for "ReliableBroadcast" and run again with
// the same seed: p4 and p5 read the answer first.
interface Forum
  request Post(m)
  indication Read(from, m)
end

algorithm Discussion
  implements Forum as app
  uses CausalOrderBroadcast as cb

  upon event ⟨app, Post | m⟩ do
    trigger ⟨cb, Broadcast | m⟩
  end

  upon event ⟨cb, Deliver | p, m⟩ do
    trigger ⟨app, Read | p, m⟩
    if m = "question" and self = 2 then
      trigger ⟨cb, Broadcast | "answer"⟩
    end
  end
end
`;

const GOSSIP_APP = `// A rumor spreads by gossip: each process forwards it to FANOUT random
// neighbors, for at most ROUNDS hops. Change FANOUT and ROUNDS in EagerGossip
// and compare how many processes hear it and how many messages it costs.
interface Rumors
  request Spread(m)
  indication Heard(from, m)
end

algorithm Village
  implements Rumors as app
  uses ProbabilisticBroadcast as pb

  upon event ⟨app, Spread | m⟩ do
    trigger ⟨pb, Broadcast | m⟩
  end

  upon event ⟨pb, Deliver | p, m⟩ do
    trigger ⟨app, Heard | p, m⟩
  end
end
`;

function libStack(keys) {
  const seen = new Set(), ifaces = [], mods = [];
  for (const k of keys) {
    const p = Lib.plan(k, mods.map(m => m.implements), ifaces);
    for (const i of p.interfaces) if (!seen.has('i' + i)) { seen.add('i' + i); ifaces.push(i); }
    for (const m of p.modules) if (!seen.has('m' + m.key)) { seen.add('m' + m.key); mods.push(m); }
  }
  return '// Library modules (Code tab → Add module)\n\n' +
    ifaces.map(i => Lib.IFACES[i]).concat(mods.map(m => m.source)).join('\n\n') + '\n\n';
}
function asyncActual(extra) {
  return Object.assign({ delay: 'uniform(5ms, 30ms)', bound: '', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
    step: 'uniform(100us, 1ms)', offset: 'const(0ms)', rho: '0', gst: '', preGstDelay: '', roundMode: 'lockstep', roundLen: '1s' }, extra);
}
const ASYNC = { timing: 'asynchronous', DELTA: 'unknown', PHI: 'unknown', RHO: 'unknown' };

EXAMPLES.push({
  key: 'reliable-broadcast',
  title: 'Reliable broadcast when the sender crashes',
  scenario: (function () {
    const ids = [1, 2, 3, 4, 5];
    return {
      version: 1, seed: 4, nodes: ringLayout(ids, 330, 230, 160), links: complete(ids),
      code: RB_APP + '\n' + libStack(['beb', 'erb']), top: 'Newsroom',
      inputs: '0ms 1 Publish | "news"',
      faults: [{ type: 'crash', node: 1, at: '40ms' }],
      preset: 'async', assumed: Object.assign({}, ASYNC), actual: asyncActual({ loss: 0.4 }),
      violationPolicy: 'deliver-late', tieBreak: 'stable', stopAt: '2s'
    };
  })()
});
EXAMPLES.push({
  key: 'causal-broadcast',
  title: 'Causal order broadcast: questions before answers',
  scenario: (function () {
    const ids = [1, 2, 3, 4, 5];
    return {
      version: 1, seed: 5, nodes: ringLayout(ids, 330, 230, 160), links: complete(ids),
      code: CAUSAL_APP + '\n' + libStack(['causal']), top: 'Discussion',
      inputs: '0ms 1 Post | "question"',
      faults: [],
      preset: 'custom', assumed: Object.assign({}, ASYNC), actual: asyncActual({ fifo: false, delay: 'uniform(5ms, 120ms)' }),
      violationPolicy: 'deliver-late', tieBreak: 'stable', stopAt: '2s'
    };
  })()
});
EXAMPLES.push({
  key: 'gossip',
  title: 'Gossip: spreading a rumor',
  scenario: (function () {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const links = [];
    const L = (a, b) => links.push({ a, b, directed: false, enabled: true });
    // a ring with chords: every process has four neighbors
    ids.forEach((id, i) => { L(id, ids[(i + 1) % 16]); if (i < 8) L(id, ids[(i + 8) % 16]); if (i % 2 === 0) L(id, ids[(i + 5) % 16]); });
    return {
      version: 1, seed: 7, nodes: ringLayout(ids, 360, 260, 220), links,
      code: GOSSIP_APP + '\n' + libStack(['gossip']), top: 'Village',
      inputs: '0ms 1 Spread | "rumor"',
      faults: [],
      preset: 'async', assumed: Object.assign({}, ASYNC), actual: asyncActual({ delay: 'uniform(10ms, 60ms)' }),
      violationPolicy: 'deliver-late', tieBreak: 'stable', stopAt: '2s'
    };
  })()
});

// Gallery metadata
const META = {
  'flooding': { category: 'Broadcast', summary: 'Two messages spread across a grid; each process forwards what it has not seen yet.' },
  'chang-roberts': { category: 'Leader election', summary: 'Identifiers travel around a directed ring until the largest one comes back.' },
  'floodset': { category: 'Consensus', summary: 'Consensus in f + 1 rounds, and what happens when the rounds are only an assumption.' },
  'epfd': { category: 'Failure detection', summary: 'Heartbeats and a growing timeout: wrong suspicions before GST, a crash detected after.' },
  'epfd-partition': { category: 'Failure detection', summary: 'The same detector through a network partition, a crash and a recovery.' },
  'reliable-broadcast': { category: 'Broadcast', summary: 'The sender crashes on a lossy network; relays make sure every correct process gets the news.' },
  'causal-broadcast': { category: 'Broadcast', summary: 'Vector clocks keep answers after their questions, even when the network reorders them.' },
  'gossip': { category: 'Broadcast', summary: 'A rumor spreads to random neighbors; reach and cost depend on fanout and rounds.' }
};
for (const ex of EXAMPLES) Object.assign(ex, META[ex.key] || { category: 'Other', summary: '' });

// Timing model presets: they only change assumed/actual/policy
const PRESETS = {
  'sync-ideal': {
    label: 'Ideal synchronous',
    note: 'Lockstep rounds: no violation can happen. This is the textbook model.',
    assumed: { timing: 'synchronous-rounds', DELTA: '40ms', PHI: '10ms', RHO: '0.0001' },
    actual: { delay: 'uniform(5ms, 30ms)', bound: '', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
      step: 'const(0ms)', offset: 'const(0ms)', rho: '0', gst: '', preGstDelay: '', roundMode: 'lockstep', roundLen: '1s' },
    violationPolicy: 'drop'
  },
  'sync-real': {
    label: 'Realistic synchronous',
    note: 'The algorithm believes in rounds; the network has long tails and clocks drift. Late messages become omissions.',
    assumed: { timing: 'synchronous-rounds', DELTA: '40ms', PHI: '10ms', RHO: '0.0001' },
    actual: { delay: 'lognormal(3.2, 0.8)', bound: '', loss: 0, dup: 0, fifo: true, spikeProb: 0.03, spikeExtra: '60ms',
      step: 'uniform(100us, 2ms)', offset: 'uniform(0ms, 8ms)', rho: 'uniform(-0.0005, 0.0005)', gst: '', preGstDelay: '',
      roundMode: 'emulated', roundLen: '1s' },
    violationPolicy: 'drop'
  },
  'sync-timed': {
    label: 'Timed synchronous',
    note: 'DELTA is known and respected by the network; clocks do not drift.',
    assumed: { timing: 'synchronous-timed', DELTA: '50ms', PHI: '5ms', RHO: 'unknown' },
    actual: { delay: 'uniform(5ms, 45ms)', bound: '50ms', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
      step: 'uniform(100us, 1ms)', offset: 'const(0ms)', rho: '0', gst: '', preGstDelay: '', roundMode: 'lockstep', roundLen: '1s' },
    violationPolicy: 'deliver-late'
  },
  'partial': {
    label: 'Partially synchronous',
    note: 'Before GST delays are heavy-tailed; after GST a bound exists, unknown to the algorithm.',
    assumed: { timing: 'partial', DELTA: 'unknown', PHI: 'unknown', RHO: 'unknown' },
    actual: { delay: 'uniform(5ms, 40ms)', bound: '50ms', loss: 0, dup: 0, fifo: true, spikeProb: 0, spikeExtra: '0ms',
      step: 'uniform(100us, 1ms)', offset: 'uniform(0ms, 20ms)', rho: 'uniform(-0.0001, 0.0001)', gst: '3s',
      preGstDelay: 'pareto(20ms, 1.1)', roundMode: 'lockstep', roundLen: '1s' },
    violationPolicy: 'deliver-late'
  },
  'async': {
    label: 'Asynchronous',
    note: 'No bounds on delays, steps or clocks. DELTA, PHI and RHO do not exist for the algorithm.',
    assumed: { timing: 'asynchronous', DELTA: 'unknown', PHI: 'unknown', RHO: 'unknown' },
    actual: { delay: 'lognormal(3, 0.6)', bound: '', loss: 0, dup: 0, fifo: true, spikeProb: 0.05, spikeExtra: '150ms',
      step: 'uniform(100us, 1ms)', offset: 'const(0ms)', rho: '0', gst: '', preGstDelay: '', roundMode: 'lockstep', roundLen: '1s' },
    violationPolicy: 'deliver-late'
  }
};

const Examples = { EXAMPLES, PRESETS, ringLayout, complete };
if (typeof module !== 'undefined' && module.exports) module.exports = Examples;
else root.SimExamples = Examples;
})(typeof self !== 'undefined' ? self : this);
