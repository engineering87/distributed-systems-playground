/* Distributed Systems Playground — library of communication abstractions written in Upon */
(function (root) {
'use strict';

const IFACES = {
  StubbornLinks: `interface StubbornLinks
  request Send(q, m)
  indication Deliver(p, m)
end`,
  PerfectLinks: `interface PerfectLinks
  request Send(q, m)
  indication Deliver(p, m)
end`,
  FifoPerfectLinks: `interface FifoPerfectLinks
  request Send(q, m)
  indication Deliver(p, m)
end`,
  BestEffortBroadcast: `interface BestEffortBroadcast
  request Broadcast(m)
  indication Deliver(p, m)
end`,
  ReliableBroadcast: `interface ReliableBroadcast
  request Broadcast(m)
  indication Deliver(p, m)
end`,
  UniformReliableBroadcast: `interface UniformReliableBroadcast
  request Broadcast(m)
  indication Deliver(p, m)
end`,
  FifoReliableBroadcast: `interface FifoReliableBroadcast
  request Broadcast(m)
  indication Deliver(p, m)
end`,
  CausalOrderBroadcast: `interface CausalOrderBroadcast
  request Broadcast(m)
  indication Deliver(p, m)
end`,
  ProbabilisticBroadcast: `interface ProbabilisticBroadcast
  request Broadcast(m)
  indication Deliver(p, m)
end`
};

const MODULES = [
  {
    key: 'stubborn-links', name: 'RetransmitLinks', implements: 'StubbornLinks', group: 'Links', uses: [],
    summary: 'Stubborn links: every message is sent again periodically, a bounded number of times.',
    properties: 'Stubborn delivery (within the retransmission budget), no creation.',
    source: `// Stubborn links over the lossy network, after "Retransmit Forever"
// (Cachin, Guerraoui, Rodrigues). The book retransmits forever; here each message is resent RETRIES times,
// so that runs stay short.
algorithm RetransmitLinks
  implements StubbornLinks as sl
  uses Net as net
  params
    PERIOD := 100ms
    RETRIES := 5
  state
    sent := map()            // [q, m] -> retransmissions left

  upon event ⟨sl, Init⟩ do
    starttimer(retransmit, PERIOD)
  end

  upon event ⟨sl, Send | q, m⟩ do
    trigger ⟨net, Send | q, m⟩
    sent[[q, m]] := RETRIES
  end

  upon event ⟨timer, Timeout | retransmit⟩ do
    forall e in keys(sent) do
      trigger ⟨net, Send | e[0], e[1]⟩
      if sent[e] <= 1 then
        sent := remove(sent, e)
      else
        sent[e] := sent[e] - 1
      end
    end
    starttimer(retransmit, PERIOD)
  end

  upon event ⟨net, Deliver | p, m⟩ do
    trigger ⟨sl, Deliver | p, m⟩
  end
end`
  },
  {
    key: 'eliminate-duplicates', name: 'EliminateDuplicates', implements: 'PerfectLinks', group: 'Links', uses: ['StubbornLinks'],
    summary: 'Perfect links built on stubborn links by discarding duplicates.',
    properties: 'Reliable delivery, no duplication, no creation (messages are assumed unique).',
    source: `// Perfect links on top of stubborn links, after "Eliminate Duplicates"
// (Cachin, Guerraoui, Rodrigues).
// Like the book, it assumes that every message is unique.
algorithm EliminateDuplicates
  implements PerfectLinks as pl
  uses StubbornLinks as sl
  state
    delivered := ∅

  upon event ⟨pl, Send | q, m⟩ do
    trigger ⟨sl, Send | q, m⟩
  end

  upon event ⟨sl, Deliver | p, m⟩ where [p, m] ∉ delivered do
    delivered := delivered ∪ {[p, m]}
    trigger ⟨pl, Deliver | p, m⟩
  end

  upon event ⟨sl, Deliver | p, m⟩ where [p, m] ∈ delivered do
    skip    // duplicate
  end
end`
  },
  {
    key: 'ack-links', name: 'AckLinks', implements: 'PerfectLinks', group: 'Links', uses: [],
    summary: 'Perfect links with sequence numbers, acknowledgements and retransmission until acknowledged.',
    properties: 'Reliable delivery to correct processes, no duplication, no creation.',
    source: `// Perfect links with acknowledgements: each message carries a sequence number
// and is retransmitted until the recipient acknowledges it. Duplicates are
// recognized by (sender, sequence number), so equal payloads are fine.
algorithm AckLinks
  implements PerfectLinks as pl
  uses Net as net
  params
    TIMEOUT := 150ms
  state
    seq := 0
    pending := map()         // [q, n] -> message not yet acknowledged
    delivered := ∅           // [p, n] already delivered

  upon event ⟨pl, Init⟩ do
    starttimer(resend, TIMEOUT)
  end

  upon event ⟨pl, Send | q, m⟩ do
    seq := seq + 1
    pending[[q, seq]] := m
    trigger ⟨net, Send | q, [DATA, seq, m]⟩
  end

  upon event ⟨net, Deliver | p, [DATA, n, m]⟩ do
    trigger ⟨net, Send | p, [ACK, n]⟩
    if [p, n] ∉ delivered then
      delivered := delivered ∪ {[p, n]}
      trigger ⟨pl, Deliver | p, m⟩
    end
  end

  upon event ⟨net, Deliver | q, [ACK, n]⟩ do
    pending := remove(pending, [q, n])
  end

  upon event ⟨timer, Timeout | resend⟩ do
    forall k in keys(pending) do
      trigger ⟨net, Send | k[0], [DATA, k[1], pending[k]]⟩
    end
    starttimer(resend, TIMEOUT)
  end
end`
  },
  {
    key: 'fifo-links', name: 'SequencedFifoLinks', implements: 'FifoPerfectLinks', group: 'Links', uses: ['PerfectLinks'],
    summary: 'FIFO perfect links: per-sender sequence numbers and a reorder buffer.',
    properties: 'Perfect link properties, plus FIFO delivery per pair of processes.',
    source: `// FIFO perfect links on top of perfect links: messages from each sender are
// numbered, buffered on arrival and delivered in order.
algorithm SequencedFifoLinks
  implements FifoPerfectLinks as fpl
  uses PerfectLinks as pl
  state
    next := map()            // q -> sequence number of the next message to q
    expected := map()        // p -> sequence number expected from p
    buffer := ∅              // [p, n, m] received but not delivered

  function expectedFrom(p)
    return get(expected, p, 0)
  end

  upon event ⟨fpl, Send | q, m⟩ do
    n := get(next, q, 0)
    next[q] := n + 1
    trigger ⟨pl, Send | q, [FIFO, n, m]⟩
  end

  upon event ⟨pl, Deliver | p, [FIFO, n, m]⟩ do
    buffer := buffer ∪ {[p, n, m]}
  end

  upon exists e in buffer where e[1] = expectedFrom(e[0]) do
    buffer := buffer \\ {e}
    expected[e[0]] := e[1] + 1
    trigger ⟨fpl, Deliver | e[0], e[2]⟩
  end
end`
  },
  {
    key: 'beb', name: 'BasicBroadcast', implements: 'BestEffortBroadcast', group: 'Broadcast', uses: ['PerfectLinks'],
    summary: 'Best-effort broadcast: send the message to every process over perfect links.',
    properties: 'Validity, no duplication, no creation. If the sender crashes, some processes may miss the message.',
    source: `// Best-effort broadcast, after "Basic Broadcast" (Cachin, Guerraoui, Rodrigues).
algorithm BasicBroadcast
  implements BestEffortBroadcast as beb
  uses PerfectLinks as pl

  upon event ⟨beb, Broadcast | m⟩ do
    forall q in Π do
      trigger ⟨pl, Send | q, m⟩
    end
  end

  upon event ⟨pl, Deliver | p, m⟩ do
    trigger ⟨beb, Deliver | p, m⟩
  end
end`
  },
  {
    key: 'erb', name: 'EagerReliableBroadcast', implements: 'ReliableBroadcast', group: 'Broadcast', uses: ['BestEffortBroadcast'],
    summary: 'Reliable broadcast without failure detection: every process relays each message once.',
    properties: 'Validity, no duplication, no creation, agreement among correct processes.',
    source: `// Reliable broadcast, after "Eager Reliable Broadcast" (Cachin, Guerraoui, Rodrigues).
// Messages are identified by (original sender, sequence number).
algorithm EagerReliableBroadcast
  implements ReliableBroadcast as rb
  uses BestEffortBroadcast as beb
  state
    seq := 0
    delivered := ∅

  upon event ⟨rb, Broadcast | m⟩ do
    seq := seq + 1
    trigger ⟨beb, Broadcast | [RB, self, seq, m]⟩
  end

  upon event ⟨beb, Deliver | p, [RB, s, n, m]⟩ where [s, n] ∉ delivered do
    delivered := delivered ∪ {[s, n]}
    trigger ⟨rb, Deliver | s, m⟩
    trigger ⟨beb, Broadcast | [RB, s, n, m]⟩
  end

  upon event ⟨beb, Deliver | p, [RB, s, n, m]⟩ where [s, n] ∈ delivered do
    skip    // already relayed
  end
end`
  },
  {
    key: 'urb', name: 'MajorityAckURB', implements: 'UniformReliableBroadcast', group: 'Broadcast', uses: ['BestEffortBroadcast'],
    summary: 'Uniform reliable broadcast: deliver only after a majority has relayed the message.',
    properties: 'Uniform agreement: if any process delivers, every correct process delivers. Needs a correct majority.',
    source: `// Uniform reliable broadcast, after "Majority-Ack Uniform Reliable Broadcast"
// (Cachin, Guerraoui, Rodrigues).
// A message is delivered once more than half of the processes relayed it,
// so it survives the crash of the processes that delivered it first.
algorithm MajorityAckURB
  implements UniformReliableBroadcast as urb
  uses BestEffortBroadcast as beb
  state
    seq := 0
    pending := ∅             // [s, n, m] seen and relayed
    ack := map()             // [s, n] -> processes that relayed it
    delivered := ∅           // [s, n]

  function acks(s, n)
    return #get(ack, [s, n], ∅)
  end

  upon event ⟨urb, Broadcast | m⟩ do
    seq := seq + 1
    pending := pending ∪ {[self, seq, m]}
    trigger ⟨beb, Broadcast | [URB, self, seq, m]⟩
  end

  upon event ⟨beb, Deliver | p, [URB, s, n, m]⟩ do
    ack[[s, n]] := get(ack, [s, n], ∅) ∪ {p}
    if [s, n, m] ∉ pending then
      pending := pending ∪ {[s, n, m]}
      trigger ⟨beb, Broadcast | [URB, s, n, m]⟩
    end
  end

  upon exists e in pending where [e[0], e[1]] ∉ delivered and acks(e[0], e[1]) > N / 2 do
    delivered := delivered ∪ {[e[0], e[1]]}
    trigger ⟨urb, Deliver | e[0], e[2]⟩
  end
end`
  },
  {
    key: 'fifo-rb', name: 'BroadcastWithSequenceNumber', implements: 'FifoReliableBroadcast', group: 'Broadcast', uses: ['ReliableBroadcast'],
    summary: 'FIFO reliable broadcast: messages of each sender are delivered in the order they were sent.',
    properties: 'Reliable broadcast properties, plus FIFO delivery per sender.',
    source: `// FIFO reliable broadcast, after "Broadcast with Sequence Number"
// (Cachin, Guerraoui, Rodrigues).
algorithm BroadcastWithSequenceNumber
  implements FifoReliableBroadcast as frb
  uses ReliableBroadcast as rb
  state
    lsn := 0                 // messages broadcast by this process
    next := map()            // s -> sequence number expected from s
    pending := ∅             // [s, n, m]

  function nextFrom(s)
    return get(next, s, 1)
  end

  upon event ⟨frb, Broadcast | m⟩ do
    lsn := lsn + 1
    trigger ⟨rb, Broadcast | [FIFO, lsn, m]⟩
  end

  upon event ⟨rb, Deliver | s, [FIFO, n, m]⟩ do
    pending := pending ∪ {[s, n, m]}
  end

  upon exists e in pending where e[1] = nextFrom(e[0]) do
    pending := pending \\ {e}
    next[e[0]] := e[1] + 1
    trigger ⟨frb, Deliver | e[0], e[2]⟩
  end
end`
  },
  {
    key: 'causal', name: 'WaitingCausalBroadcast', implements: 'CausalOrderBroadcast', group: 'Broadcast', uses: ['ReliableBroadcast'],
    summary: 'Causal order broadcast with vector clocks: a message waits until everything it depends on is delivered.',
    properties: 'Reliable broadcast properties, plus causal delivery order.',
    source: `// Causal-order broadcast with vector clocks, after "Waiting Causal Broadcast"
// (Cachin, Guerraoui, Rodrigues).
algorithm WaitingCausalBroadcast
  implements CausalOrderBroadcast as crb
  uses ReliableBroadcast as rb
  state
    V := map()               // q -> messages of q delivered here
    lsn := 0                 // messages broadcast by this process
    pending := ∅             // [s, W, m]

  function entry(W, q)
    return get(W, q, 0)
  end

  // true when W ≤ V in every component
  function satisfied(W)
    forall q in keys(W) do
      if entry(W, q) > entry(V, q) then
        return false
      end
    end
    return true
  end

  upon event ⟨crb, Broadcast | m⟩ do
    W := V
    W[self] := lsn
    lsn := lsn + 1
    trigger ⟨rb, Broadcast | [CRB, W, m]⟩
  end

  upon event ⟨rb, Deliver | s, [CRB, W, m]⟩ do
    pending := pending ∪ {[s, W, m]}
  end

  upon exists e in pending where satisfied(e[1]) do
    pending := pending \\ {e}
    V[e[0]] := entry(V, e[0]) + 1
    trigger ⟨crb, Deliver | e[0], e[2]⟩
  end
end`
  },
  {
    key: 'gossip', name: 'EagerGossip', implements: 'ProbabilisticBroadcast', group: 'Broadcast', uses: [],
    summary: 'Probabilistic broadcast: each process forwards a new message to a few random neighbors for a few rounds.',
    properties: 'Probabilistic validity: most processes deliver with high probability; no duplication.',
    source: `// Gossip, after "Eager Probabilistic Broadcast" (Cachin, Guerraoui, Rodrigues).
// Each hop forwards to FANOUT random neighbors, for at most ROUNDS hops.
algorithm EagerGossip
  implements ProbabilisticBroadcast as pb
  uses Net as net
  params
    FANOUT := 2
    ROUNDS := 4
  state
    seq := 0
    delivered := ∅           // [s, n]

  function targets(k)
    chosen := ∅
    left := neighbors
    while #chosen < k and #left > 0 do
      q := pick(left)
      chosen := chosen ∪ {q}
      left := left \\ {q}
    end
    return chosen
  end

  function gossip(msg)
    forall q in targets(FANOUT) do
      trigger ⟨net, Send | q, msg⟩
    end
  end

  upon event ⟨pb, Broadcast | m⟩ do
    seq := seq + 1
    delivered := delivered ∪ {[self, seq]}
    trigger ⟨pb, Deliver | self, m⟩
    call gossip([GOSSIP, self, seq, m, ROUNDS])
  end

  upon event ⟨net, Deliver | p, [GOSSIP, s, n, m, r]⟩ do
    if [s, n] ∉ delivered then
      delivered := delivered ∪ {[s, n]}
      trigger ⟨pb, Deliver | s, m⟩
      if r > 1 then
        call gossip([GOSSIP, s, n, m, r - 1])
      end
    end
  end
end`
  }
];

const byKey = new Map(MODULES.map(m => [m.key, m]));
const byName = new Map(MODULES.map(m => [m.name, m]));
// default implementation for an interface when a module needs it
const DEFAULT_FOR = {
  StubbornLinks: 'stubborn-links', PerfectLinks: 'ack-links', FifoPerfectLinks: 'fifo-links',
  BestEffortBroadcast: 'beb', ReliableBroadcast: 'erb', UniformReliableBroadcast: 'urb',
  FifoReliableBroadcast: 'fifo-rb', CausalOrderBroadcast: 'causal', ProbabilisticBroadcast: 'gossip'
};

// Modules to add, dependencies first, so that `key` works in a program that already
// declares `interfaces` and implements `implemented`.
function plan(key, implemented, interfaces) {
  const order = [], seen = new Set();
  const impl = new Set(implemented || []);
  const visit = k => {
    const m = byKey.get(k);
    if (!m || seen.has(k)) return;
    seen.add(k);
    for (const iface of m.uses) if (!impl.has(iface)) visit(DEFAULT_FOR[iface]);
    impl.add(m.implements);
    order.push(m);
  };
  visit(key);
  const have = new Set(interfaces || []);
  const ifaces = [];
  for (const m of order) {
    for (const i of [m.implements].concat(m.uses)) {
      if (IFACES[i] && !have.has(i)) { have.add(i); ifaces.push(i); }
    }
  }
  return { modules: order, interfaces: ifaces };
}

// Full source for a stack whose top is `key` (used by the examples)
function source(key) {
  const p = plan(key, [], []);
  return p.interfaces.map(i => IFACES[i]).concat(p.modules.map(m => m.source)).join('\n\n') + '\n';
}

const Library = { IFACES, MODULES, byKey, byName, DEFAULT_FOR, plan, source };
if (typeof module !== 'undefined' && module.exports) module.exports = Library;
else root.SimLibrary = Library;
})(typeof self !== 'undefined' ? self : this);
