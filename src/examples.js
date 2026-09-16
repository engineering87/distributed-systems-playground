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
    decided := false

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

  upon event ⟨net, RoundEnd | r⟩ where r = f + 1 and not decided do
    decided := true
    trigger ⟨c, Decide | min(W)⟩
  end
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
      const ids = [1, 2, 3, 4, 5];
      return {
        version: 1, seed: 3, nodes: ringLayout(ids, 330, 230, 160), links: complete(ids),
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
