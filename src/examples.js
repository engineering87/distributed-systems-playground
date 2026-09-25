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
  correct ⊆ keys(defined(decision))
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

// ---- examples from the catalog: failure detection, coordination, atomic commit
const PFD_CODE = `// Perfect failure detector in a timed synchronous system.
// Every process sends a heartbeat every PERIOD; a process that misses one
// for longer than the model allows has crashed, and is suspected forever.
interface FailureDetector
  indication Suspect(p)
end

algorithm PerfectDetector
  implements FailureDetector as fd
  uses Net as net
  params
    PERIOD := 200ms
    GRACE := PERIOD + 2 * DELTA + PHI
  state
    alive := ∅
    suspected := ∅

  upon event ⟨fd, Init⟩ do
    alive := Π \\ {self}
    starttimer(beat, PERIOD)
    starttimer(check, GRACE)
  end

  upon event ⟨timer, Timeout | beat⟩ do
    forall q in Π \\ {self} do
      trigger ⟨net, Send | q, [HEARTBEAT]⟩
    end
    starttimer(beat, PERIOD)
  end

  upon event ⟨net, Deliver | p, [HEARTBEAT]⟩ do
    alive := alive ∪ {p}
  end

  upon event ⟨timer, Timeout | check⟩ do
    forall q in Π \\ {self} where q ∉ alive and q ∉ suspected do
      suspected := suspected ∪ {q}
      trigger ⟨fd, Suspect | q⟩
    end
    alive := ∅
    starttimer(check, GRACE)
  end
end

// A correct process is never suspected, and every crashed one eventually is.
property Accuracy always
  #{p in Π where #(suspected[p] \\ crashed) > 0} = 0
end

property Completeness eventually
  #{p in correct where not (crashed ⊆ suspected[p])} = 0
end
`;
const OMEGA_CODE = `// Eventual leader election (Ω) under partial synchrony.
// Heartbeats with a timeout that grows after every mistake; the leader is the
// smallest process nobody suspects. After GST every correct process trusts the
// same correct leader, forever.
interface Leader
  indication Trust(p)
end

algorithm EventualLeader
  implements Leader as om
  uses Net as net
  params
    PERIOD := 100ms
    DELTA0 := 100ms
  state
    delay := DELTA0
    alive := ∅
    suspected := ∅
    leader := nil

  upon event ⟨om, Init⟩ do
    starttimer(beat, PERIOD)
    starttimer(check, delay)
  end

  upon event ⟨timer, Timeout | beat⟩ do
    forall q in Π \\ {self} do
      trigger ⟨net, Send | q, [HEARTBEAT]⟩
    end
    starttimer(beat, PERIOD)
  end

  upon event ⟨net, Deliver | p, [HEARTBEAT]⟩ do
    alive := alive ∪ {p}
  end

  upon event ⟨timer, Timeout | check⟩ do
    if #(alive ∩ suspected) > 0 then
      delay := delay + DELTA0
      suspected := suspected \\ alive
    end
    forall q in Π \\ {self} where q ∉ alive and q ∉ suspected do
      suspected := suspected ∪ {q}
    end
    alive := ∅
    call elect()
    starttimer(check, delay)
  end

  function elect()
    candidates := Π \\ suspected
    if #candidates > 0 and leader ≠ min(candidates) then
      leader := min(candidates)
      trigger ⟨om, Trust | leader⟩
    end
  end
end

// Eventually every correct process trusts the same process, and it is a correct one.
property EventualAgreement eventually
  #toset(values(defined(leader))) = 1 and min(toset(values(defined(leader)))) ∉ crashed
end
`;
const MUTEX_CODE = `// Mutual exclusion, Ricart and Agrawala.
// A process asks everybody for permission, stamped with a logical clock, and
// enters the critical section once everybody has answered. A request that is
// older than mine gets its answer at once; a younger one waits until I leave.
interface Lock
  request Acquire()
  indication Enter()
  indication Exit()
end

algorithm RicartAgrawala
  implements Lock as lock
  uses Net as net
  params
    HOLD := 300ms
  state
    clock := 0
    myTs := nil
    replies := ∅
    deferred := ∅
    inCS := false

  upon event ⟨lock, Acquire⟩ where myTs = nil do
    clock := clock + 1
    myTs := clock
    replies := ∅
    forall q in Π \\ {self} do
      trigger ⟨net, Send | q, [REQUEST, myTs, self]⟩
    end
  end

  upon event ⟨lock, Acquire⟩ where myTs ≠ nil do
    skip    // already asking
  end

  upon event ⟨net, Deliver | p, [REQUEST, ts, from]⟩ do
    clock := max({clock, ts}) + 1
    if myTs = nil or ts < myTs or (ts = myTs and from < self) then
      trigger ⟨net, Send | from, [REPLY]⟩
    else
      deferred := deferred ∪ {from}
    end
  end

  upon event ⟨net, Deliver | p, [REPLY]⟩ do
    replies := replies ∪ {p}
  end

  upon condition myTs ≠ nil and not inCS and replies = Π \\ {self} do
    inCS := true
    trigger ⟨lock, Enter⟩
    starttimer(release, HOLD)
  end

  upon event ⟨timer, Timeout | release⟩ do
    inCS := false
    myTs := nil
    trigger ⟨lock, Exit⟩
    forall q in deferred do
      trigger ⟨net, Send | q, [REPLY]⟩
    end
    deferred := ∅
  end
end

// Never two processes inside the critical section at the same time.
property MutualExclusion always
  #{p in Π where inCS[p]} ≤ 1
end
`;
const TWOPC_CODE = `// Two-phase commit. p1 is the coordinator: it asks everybody to prepare,
// collects the votes and announces the outcome.
// Crash the coordinator between the votes and the announcement, and the
// participants are blocked: they know their vote and nothing else.
interface Transaction
  request Begin()
  indication Outcome(d)
end

algorithm TwoPhaseCommit
  implements Transaction as tx
  uses Net as net
  state
    votes := map()
    decision := nil

  upon event ⟨tx, Begin⟩ do
    forall q in Π \\ {self} do
      trigger ⟨net, Send | q, [PREPARE]⟩
    end
  end

  upon event ⟨net, Deliver | p, [PREPARE]⟩ do
    trigger ⟨net, Send | p, [VOTE, YES]⟩
  end

  upon event ⟨net, Deliver | p, [VOTE, v]⟩ do
    votes[p] := v
    if #keys(votes) = N - 1 then
      if #{q in keys(votes) where votes[q] = NO} > 0 then
        decision := ABORT
      else
        decision := COMMIT
      end
      trigger ⟨tx, Outcome | decision⟩
      forall q in Π \\ {self} do
        trigger ⟨net, Send | q, [DECISION, decision]⟩
      end
    end
  end

  upon event ⟨net, Deliver | p, [DECISION, d]⟩ do
    decision := d
    trigger ⟨tx, Outcome | d⟩
  end
end

// Nobody decides differently, and everybody that stays up decides in the end.
property Agreement always
  #toset(values(defined(decision))) ≤ 1
end

property Termination eventually
  correct ⊆ keys(defined(decision))
end
`;

const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];
const copy = o => JSON.parse(JSON.stringify(o), (k, v) => (UNSAFE_KEYS.includes(k) ? undefined : v));
function catalogScenario(opts) {
  const ids = Array.from({ length: opts.n }, (_, i) => i + 1);
  const preset = PRESETS[opts.preset];
  return {
    version: 1, seed: opts.seed, nodes: ringLayout(ids, 330, 230, 165), links: complete(ids),
    code: opts.code, top: opts.top, inputs: opts.inputs || '', faults: opts.faults || [],
    preset: opts.preset, assumed: copy(preset.assumed), actual: Object.assign(copy(preset.actual), opts.actual || {}),
    violationPolicy: preset.violationPolicy, tieBreak: 'stable', stopAt: opts.stopAt
  };
}

EXAMPLES.push({
  key: 'perfect-detector',
  title: 'Perfect failure detector (timed synchronous)',
  scenario: catalogScenario({
    n: 4, seed: 3, preset: 'sync-timed', code: PFD_CODE, top: 'PerfectDetector',
    faults: [{ type: 'crash', node: 3, at: '1s' }], stopAt: '4s'
  })
});
EXAMPLES.push({
  key: 'omega-leader',
  title: 'Eventual leader election Ω (partially synchronous)',
  scenario: catalogScenario({
    n: 5, seed: 3, preset: 'partial', code: OMEGA_CODE, top: 'EventualLeader',
    faults: [{ type: 'crash', node: 1, at: '4s' }], stopAt: '10s'
  })
});
EXAMPLES.push({
  key: 'mutual-exclusion',
  title: 'Mutual exclusion, Ricart-Agrawala (asynchronous)',
  scenario: catalogScenario({
    n: 4, seed: 3, preset: 'async', code: MUTEX_CODE, top: 'RicartAgrawala',
    inputs: '0ms 1 Acquire\n5ms 2 Acquire\n7ms 3 Acquire', stopAt: '3s'
  })
});
EXAMPLES.push({
  key: 'two-phase-commit',
  title: 'Two-phase commit and the blocked participants',
  scenario: catalogScenario({
    n: 4, seed: 3, preset: 'async', code: TWOPC_CODE, top: 'TwoPhaseCommit',
    inputs: '0ms 1 Begin', stopAt: '2s'
  })
});


const CLOCKS_CODE = `// Logical clocks: Lamport's counter and a vector clock, side by side.
// Every message carries both. On receipt the Lamport clock jumps past the
// timestamp it received, and the vector takes the entrywise maximum.
interface Clocks
  request Tick(q)
  indication Event(kind, lc)
end

algorithm LogicalClocks
  implements Clocks as app
  uses Net as net
  state
    lc := 0
    vc := map()

  upon event ⟨app, Init⟩ do
    forall q in Π do
      vc[q] := 0
    end
  end

  upon event ⟨app, Tick | q⟩ do
    lc := lc + 1
    vc[self] := vc[self] + 1
    trigger ⟨net, Send | q, [MSG, lc, vc]⟩
    trigger ⟨app, Event | SEND, lc⟩
  end

  upon event ⟨net, Deliver | p, [MSG, ts, v]⟩ do
    lc := max({lc, ts}) + 1
    assert lc > ts
    vc[self] := vc[self] + 1
    forall q in Π do
      vc[q] := max({vc[q], v[q]})
    end
    trigger ⟨app, Event | RECEIVE, lc⟩
  end
end

// Nobody knows more about me than I do: my own entry is never behind
// the entry somebody else keeps for me.
// Processes that have not started yet have an empty vector, and are left out.
property OwnEntryIsHighest always
  #{p in Π where #vc[p] > 0 and #{q in Π where #vc[q] > 0 and vc[q][p] > vc[p][p]} > 0} = 0
end

// Every process eventually takes part.
property EverybodyTicks eventually
  #{p in Π where lc[p] > 0} = N
end
`;
const SNAPSHOT_CODE = `// Chandy-Lamport global snapshot, on FIFO channels.
// Processes move coins around. Whoever is asked first records its own balance,
// sends a marker on every channel and records what arrives on a channel until
// its marker comes: local state plus messages in flight make a consistent cut.
interface Snapshot
  request Transfer(q, amount)
  request Snap()
  indication Recorded(total)
end

algorithm ChandyLamport
  implements Snapshot as app
  uses Net as net
  params
    START := 100
  state
    balance := 0
    snapped := false
    snap := 0
    recording := ∅
    inFlight := 0
    recorded := nil

  upon event ⟨app, Init⟩ do
    balance := START
  end

  upon event ⟨app, Transfer | q, amount⟩ where balance ≥ amount do
    balance := balance - amount
    trigger ⟨net, Send | q, [COIN, amount]⟩
  end

  upon event ⟨app, Transfer | q, amount⟩ where balance < amount do
    skip
  end

  upon event ⟨app, Snap⟩ where not snapped do
    call takeSnapshot()
  end

  upon event ⟨app, Snap⟩ where snapped do
    skip
  end

  upon event ⟨net, Deliver | p, [COIN, amount]⟩ do
    balance := balance + amount
    if snapped and p ∈ recording then
      inFlight := inFlight + amount
    end
  end

  upon event ⟨net, Deliver | p, [MARKER]⟩ do
    if not snapped then
      call takeSnapshot()
    end
    recording := recording \\ {p}
    if #recording = 0 and recorded = nil then
      recorded := snap + inFlight
      trigger ⟨app, Recorded | recorded⟩
    end
  end

  function takeSnapshot()
    snapped := true
    snap := balance
    inFlight := 0
    recording := Π \\ {self}
    forall q in Π \\ {self} do
      trigger ⟨net, Send | q, [MARKER]⟩
    end
  end
end

// The recorded cut holds every coin: local balances plus what was in flight.
// The recorded cut holds every coin: local balances plus what was in flight.
// sum() over the map keeps repeated amounts, which values() would merge into a set.
property Conservation eventually
  #{p in Π where recorded[p] = nil} = 0 and sum(defined(recorded)) = N * 100
end

// A process records its own state once, and never after it has finished.
property SnapshotOnce always
  #{p in Π where recorded[p] ≠ nil and not snapped[p]} = 0
end
`;

EXAMPLES.push({
  key: 'logical-clocks',
  title: 'Logical clocks: Lamport and vector',
  scenario: catalogScenario({
    n: 4, seed: 3, preset: 'async', code: CLOCKS_CODE, top: 'LogicalClocks',
    inputs: '0ms 1 Tick | 2\n5ms 2 Tick | 3\n8ms 3 Tick | 4\n12ms 4 Tick | 1\n20ms 2 Tick | 1', stopAt: '500ms'
  })
});
EXAMPLES.push({
  key: 'snapshot',
  title: 'Chandy-Lamport snapshot on FIFO channels',
  scenario: catalogScenario({
    n: 4, seed: 3, preset: 'async', code: SNAPSHOT_CODE, top: 'ChandyLamport', actual: { fifo: true },
    inputs: '0ms 1 Transfer | 2, 30\n2ms 2 Transfer | 3, 20\n4ms 3 Transfer | 4, 10\n6ms 1 Snap\n8ms 4 Transfer | 1, 25',
    stopAt: '1s'
  })
});

const REGISTER_CODE = `// A read-write register replicated on every process, kept correct by majority quorums.
// Writing: stamp the value and wait for a majority to store it.
// Reading: ask everybody, take the value with the highest stamp, write it back to a
// majority before returning it, so that the next reader cannot see anything older.
interface Register
  request Write(v)
  request Read()
  indication WriteReturn()
  indication ReadReturn(v)
end

algorithm MajorityRegister
  implements Register as reg
  uses Net as net
  state
    stable ts := 0
    stable val := nil
    stable wrote := nil
    sn := 0
    acks := 0
    answers := map()
    phase := nil
    pending := nil
    got := nil

  // ---- the replica every process keeps
  upon event ⟨net, Deliver | p, [READ, r]⟩ do
    trigger ⟨net, Send | p, [VALUE, r, ts, val]⟩
  end

  upon event ⟨net, Deliver | p, [STORE, r, t, v]⟩ do
    if t > ts then
      ts := t
      val := v
    end
    trigger ⟨net, Send | p, [ACK, r]⟩
  end

  // ---- the operation this process is running
  upon event ⟨reg, Write | v⟩ where phase = nil do
    sn := sn + 1
    phase := READING
    pending := v
    wrote := v
    answers := map()
    acks := 0
    forall q in Π do
      trigger ⟨net, Send | q, [READ, sn]⟩
    end
  end

  upon event ⟨reg, Read⟩ where phase = nil do
    sn := sn + 1
    phase := READING
    pending := nil
    answers := map()
    acks := 0
    forall q in Π do
      trigger ⟨net, Send | q, [READ, sn]⟩
    end
  end

  upon event ⟨net, Deliver | p, [VALUE, r, t, v]⟩ where r = sn and phase = READING do
    answers[p] := [t, v]
    if 2 * #keys(answers) > N then
      call impose()
    end
  end

  upon event ⟨net, Deliver | p, [ACK, r]⟩ where r = sn and phase = WRITING do
    acks := acks + 1
    if 2 * acks > N then
      phase := nil
      if pending ≠ nil then
        trigger ⟨reg, WriteReturn⟩
      else
        got := val
        trigger ⟨reg, ReadReturn | val⟩
      end
    end
  end

  // second phase: store the value that will be returned, on a majority
  function impose()
    best := 0
    chosen := nil
    forall q in keys(answers) do
      if answers[q][0] ≥ best then
        best := answers[q][0]
        chosen := answers[q][1]
      end
    end
    phase := WRITING
    acks := 0
    if pending ≠ nil then
      ts := best + 1
      val := pending
    else
      ts := best
      val := chosen
    end
    forall q in Π do
      trigger ⟨net, Send | q, [STORE, sn, ts, val]⟩
    end
  end
end

// A read never returns a value nobody wrote, and never an older one than what the writer holds.
property ReadsAreValid always
  #{p in Π where got[p] ≠ nil and got[p] ≠ wrote[1]} = 0
end

// The operations finish: both readers get an answer.
property OperationsReturn eventually
  #{p in Π where got[p] ≠ nil} ≥ 2
end
`;

EXAMPLES.push({
  key: 'quorum-register',
  title: 'Majority-quorum register (read and write)',
  scenario: catalogScenario({
    n: 5, seed: 3, preset: 'async', code: REGISTER_CODE, top: 'MajorityRegister',
    inputs: '0ms 1 Write | 42\n60ms 3 Read\n80ms 5 Read', stopAt: '2s'
  })
});

const TOB_CODE = `// Total order broadcast with a sequencer.
// Everybody sends its message to all; p1, the sequencer, is the only one that
// decides the order, and announces it. A process delivers a message only when
// every earlier sequence number has arrived, so all of them deliver the same
// sequence, in the same order.
interface TotalOrder
  request Broadcast(m)
  indication Deliver(s, m)
end

algorithm SequencerTotalOrder
  implements TotalOrder as tob
  uses Net as net
  params
    SEQ := 1
  state
    dlv := []
    order := map()
    next := 1
    assigned := 0

  upon event ⟨tob, Broadcast | m⟩ do
    forall q in Π do
      trigger ⟨net, Send | q, [DATA, self, m]⟩
    end
  end

  upon event ⟨net, Deliver | p, [DATA, s, m]⟩ where self = SEQ do
    assigned := assigned + 1
    forall q in Π do
      trigger ⟨net, Send | q, [ORDER, assigned, s, m]⟩
    end
  end

  upon event ⟨net, Deliver | p, [DATA, s, m]⟩ where self ≠ SEQ do
    skip
  end

  upon event ⟨net, Deliver | p, [ORDER, n, s, m]⟩ do
    order[n] := [s, m]
    call flush()
  end

  function flush()
    while order[next] ≠ nil do
      dlv := append(dlv, order[next])
      trigger ⟨tob, Deliver | order[next][0], order[next][1]⟩
      next := next + 1
    end
  end
end

// What one process has delivered is a prefix of what any other has delivered:
// nobody ever sees two messages in a different order.
property TotalOrder always
  #{p in Π where #{q in Π where #dlv[p] ≤ #dlv[q] and slice(dlv[q], 0, #dlv[p]) ≠ dlv[p]} > 0} = 0
end

// Everything that was broadcast reaches everybody.
property EverybodyDelivers eventually
  #{p in Π where #dlv[p] < 3} = 0
end
`;

EXAMPLES.push({
  key: 'total-order',
  title: 'Total order broadcast with a sequencer',
  scenario: catalogScenario({
    n: 4, seed: 3, preset: 'async', code: TOB_CODE, top: 'SequencerTotalOrder',
    inputs: '0ms 2 Broadcast | "a"\n1ms 3 Broadcast | "b"\n2ms 4 Broadcast | "c"', stopAt: '500ms'
  })
});

const PAXOS_CODE = `// Single-value Paxos. Every process is acceptor and learner; the ones that
// receive a Propose act as proposers too.
// A proposer picks a ballot number nobody else can use, asks a majority to
// promise not to accept anything older, adopts the most recent value it hears
// about (or its own, if nobody accepted anything yet), and then asks the same
// majority to accept it. Two majorities always meet, which is why two ballots
// can never fix two different values.
interface Consensus
  request Propose(v)
  indication Decide(v)
end

algorithm Paxos
  implements Consensus as cons
  uses Net as net
  state
    promised := 0
    accTs := 0
    accVal := nil
    ballot := self
    proposed := nil
    myVal := nil
    promises := map()
    accepts := 0
    phase := nil
    decided := nil

  // ---- proposer
  upon event ⟨cons, Propose | v⟩ where phase = nil do
    proposed := v
    myVal := v
    ballot := ballot + N
    phase := PREPARING
    promises := map()
    accepts := 0
    forall q in Π do
      trigger ⟨net, Send | q, [PREPARE, ballot]⟩
    end
  end

  upon event ⟨cons, Propose | v⟩ where phase ≠ nil do
    skip
  end

  // ---- acceptor
  upon event ⟨net, Deliver | p, [PREPARE, b]⟩ do
    if b > promised then
      promised := b
      trigger ⟨net, Send | p, [PROMISE, b, accTs, accVal]⟩
    end
  end

  upon event ⟨net, Deliver | p, [ACCEPT, b, v]⟩ do
    if b ≥ promised then
      promised := b
      accTs := b
      accVal := v
      trigger ⟨net, Send | p, [ACCEPTED, b]⟩
    end
  end

  // ---- proposer, phase one: a majority promised
  upon event ⟨net, Deliver | p, [PROMISE, b, t, v]⟩ do
    if b = ballot and phase = PREPARING then
      promises[p] := [t, v]
      if 2 * #keys(promises) > N then
        call chooseAndAccept()
      end
    end
  end

  // ---- proposer, phase two: a majority accepted
  upon event ⟨net, Deliver | p, [ACCEPTED, b]⟩ do
    if b = ballot and phase = ACCEPTING then
      accepts := accepts + 1
      if 2 * accepts > N and decided = nil then
        phase := nil
        decided := myVal
        trigger ⟨cons, Decide | decided⟩
        forall q in Π do
          trigger ⟨net, Send | q, [DECIDED, decided]⟩
        end
      end
    end
  end

  // ---- learner
  upon event ⟨net, Deliver | p, [DECIDED, v]⟩ do
    if decided = nil then
      decided := v
      trigger ⟨cons, Decide | v⟩
    end
  end

  // The value carried forward is the one accepted at the highest ballot,
  // which is what keeps two majorities from fixing two different values.
  function chooseAndAccept()
    best := 0
    chosen := nil
    forall q in keys(promises) do
      if promises[q][0] > best then
        best := promises[q][0]
        chosen := promises[q][1]
      end
    end
    if chosen ≠ nil then
      myVal := chosen
    end
    phase := ACCEPTING
    accepts := 0
    forall q in Π do
      trigger ⟨net, Send | q, [ACCEPT, ballot, myVal]⟩
    end
  end
end

// Nobody decides differently, and a decided value is one that somebody proposed.
property Agreement always
  #toset(values(defined(decided))) ≤ 1
end

property Validity always
  #{p in Π where decided[p] ≠ nil and decided[p] ∉ toset(values(defined(proposed)))} = 0
end

// Every correct process decides — which asynchrony does not promise, only this run does.
property Termination eventually
  #{p in correct where decided[p] = nil} = 0
end
`;

EXAMPLES.push({
  key: 'paxos',
  title: 'Paxos: consensus on one value',
  scenario: catalogScenario({
    n: 5, seed: 3, preset: 'async', code: PAXOS_CODE, top: 'Paxos',
    inputs: '0ms 1 Propose | "A"\n5ms 2 Propose | "B"', stopAt: '2s'
  })
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
  'gossip': { category: 'Broadcast', summary: 'A rumor spreads to random neighbors; reach and cost depend on fanout and rounds.' },
  'perfect-detector': { category: 'Failure detection', summary: 'With known bounds, a missed heartbeat means a crash: nobody correct is ever suspected.' },
  'omega-leader': { category: 'Leader election', summary: 'Heartbeats with a growing timeout: after GST everybody trusts the same correct leader.' },
  'mutual-exclusion': { category: 'Coordination', summary: 'Timestamped requests and deferred replies keep two processes out of the critical section.' },
  'two-phase-commit': { category: 'Coordination', summary: 'Everybody commits together; crash the coordinator before it announces and the others are blocked.' },
  'logical-clocks': { category: 'Logical time', summary: 'A Lamport counter and a vector clock side by side: what each one can and cannot tell you.' },
  'snapshot': { category: 'Global state', summary: 'Markers cut the execution consistently — until the channels stop being FIFO and coins go missing.' },
  'quorum-register': { category: 'Replication', summary: 'Majorities keep a replicated register correct; lose one and reads and writes simply stop.' },
  'total-order': { category: 'Broadcast', summary: 'One process decides the order and everybody follows it — until that process is the one that crashes.' },
  'paxos': { category: 'Consensus', summary: 'Two proposers compete, majorities meet, and one value wins: safety never depends on who crashes.' }
};
for (const ex of EXAMPLES) Object.assign(ex, META[ex.key] || { category: 'Other', summary: '' });

const Examples = { EXAMPLES, PRESETS, ringLayout, complete };
if (typeof module !== 'undefined' && module.exports) module.exports = Examples;
else root.SimExamples = Examples;
})(typeof self !== 'undefined' ? self : this);
