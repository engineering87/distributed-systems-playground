/* What each algorithm does, as a protocol rather than as a run: roles, phases, messages, and the
   sentence that says why it works. Read by scripts/make-diagrams.mjs, which draws one schematic per
   entry. Keeping this apart from the drawing code means the picture and the explanation are one thing. */
'use strict';

const PROTOCOLS = {
  flooding: {
    title: 'Flooding broadcast',
    subtitle: 'Every process forwards a message it has not seen, once, to all its neighbours.',
    roles: [{ name: 'sender' }, { name: 'a neighbour' }, { name: 'a neighbour of that one' }],
    steps: [
      { from: 0, to: 1, label: '⟨FLOOD, m⟩', phase: 'spread' },
      { from: 1, to: 1, label: 'first time it sees m: deliver it', color: 'reply', phase: 'spread' },
      { from: 1, to: 2, label: '⟨FLOOD, m⟩ to every neighbour', phase: 'spread' },
      { from: 2, to: 1, label: '⟨FLOOD, m⟩ comes back', color: 'quiet', dash: true, phase: 'stop' },
      { from: 1, to: 1, label: 'already seen: drop it', color: 'quiet', phase: 'stop' }
    ],
    why: 'Every connected process is reached, because a message stops only where it has already been.',
    cost: 'one message per link per broadcast'
  },

  'chang-roberts': {
    title: 'Chang-Roberts leader election',
    subtitle: 'Identifiers travel one way around a ring; only the largest survives a full lap.',
    roles: [{ name: 'a process' }, { name: 'its successor' }, { name: 'the largest identifier' }],
    steps: [
      { from: 0, to: 1, label: '⟨ELECTION, my id⟩', phase: 'election' },
      { from: 1, to: 1, label: 'smaller than mine: swallow it, send mine', color: 'quiet', phase: 'election' },
      { from: 1, to: 2, label: '⟨ELECTION, larger id⟩ passes on', phase: 'election' },
      { from: 2, to: 2, label: 'my own id came back: I am the leader', color: 'reply', phase: 'announce' },
      { from: 2, to: 0, label: '⟨ELECTED, id⟩ around the ring', color: 'reply', phase: 'announce' }
    ],
    why: 'Only the largest identifier is never swallowed, so exactly one process sees its own return.',
    cost: 'O(n²) messages in the worst case, O(n log n) on average'
  },

  floodset: {
    title: 'FloodSet consensus',
    subtitle: 'In f + 1 synchronous rounds everybody ends up with the same set of values.',
    roles: [{ name: 'a process' }, { name: 'everybody else' }, { name: 'the decision' }],
    steps: [
      { from: 0, to: 1, label: 'round 1: my set of known values', phase: 'rounds' },
      { from: 1, to: 0, label: 'their sets come back, union them', color: 'reply', phase: 'rounds' },
      { from: 0, to: 1, label: 'round 2 … f + 1: the union again', phase: 'rounds' },
      { from: 0, to: 2, label: 'after f + 1 rounds: decide min of the set', color: 'reply', phase: 'decide' }
    ],
    why: 'With at most f crashes, one of the f + 1 rounds is clean, and a clean round makes every set equal.',
    cost: 'f + 1 rounds, n² messages per round'
  },

  epfd: {
    title: 'Eventually perfect failure detector (◇P)',
    subtitle: 'Suspect whoever is silent; when you are proved wrong, wait longer next time.',
    roles: [{ name: 'the monitor' }, { name: 'a live process' }, { name: 'a crashed process' }],
    steps: [
      { from: 1, to: 0, label: '⟨HEARTBEAT⟩ every period', color: 'reply', phase: 'watch' },
      { from: 0, to: 0, label: 'timeout with no heartbeat: suspect', color: 'bad', phase: 'watch' },
      { from: 1, to: 0, label: 'a late heartbeat arrives after all', color: 'reply', dash: true, phase: 'correct' },
      { from: 0, to: 0, label: 'restore, and raise the timeout', color: 'reply', phase: 'correct' },
      { from: 2, to: 0, label: 'nothing ever again', color: 'bad', dash: true, phase: 'settle' },
      { from: 0, to: 0, label: 'suspicion becomes permanent', color: 'bad', phase: 'settle' }
    ],
    why: 'After GST the timeout grows past the real delay, so mistakes stop: completeness always, accuracy eventually.',
    cost: 'one heartbeat per process per period'
  },

  'epfd-partition': {
    title: '◇P across a partition',
    subtitle: 'A partition looks exactly like a crash to the side that cannot hear.',
    roles: [{ name: 'side A' }, { name: 'the network' }, { name: 'side B' }],
    steps: [
      { from: 0, to: 2, label: 'heartbeats both ways', phase: 'before' },
      { from: 1, to: 1, label: 'the network splits', color: 'bad', phase: 'partition' },
      { from: 0, to: 0, label: 'A suspects everybody in B', color: 'bad', phase: 'partition' },
      { from: 2, to: 2, label: 'B suspects everybody in A', color: 'bad', phase: 'partition' },
      { from: 1, to: 1, label: 'the network heals', color: 'reply', phase: 'after' },
      { from: 0, to: 2, label: 'heartbeats resume, suspicions are withdrawn', color: 'reply', phase: 'after' }
    ],
    why: 'No detector can tell a partition from a crash: the difference is only visible afterwards.',
    cost: 'both sides believe they are the survivors'
  },

  'reliable-broadcast': {
    title: 'Eager reliable broadcast',
    subtitle: 'Everybody relays what it delivers, so a crash mid-broadcast cannot leave half the system out.',
    roles: [{ name: 'the sender' }, { name: 'a process that received it' }, { name: 'a process the sender never reached' }],
    steps: [
      { from: 0, to: 1, label: '⟨DATA, m⟩ to everybody', phase: 'broadcast' },
      { from: 0, to: 0, label: 'the sender crashes here', color: 'bad', phase: 'broadcast' },
      { from: 1, to: 1, label: 'deliver m', color: 'reply', phase: 'relay' },
      { from: 1, to: 2, label: 'relay ⟨DATA, m⟩ before delivering', phase: 'relay' },
      { from: 2, to: 2, label: 'deliver m as well', color: 'reply', phase: 'relay' }
    ],
    why: 'If one correct process delivers, it has already relayed: all or none, whatever the sender does.',
    cost: 'n² messages instead of n'
  },

  'causal-broadcast': {
    title: 'Causal order broadcast',
    subtitle: 'A message waits until everything its sender had seen has been delivered here too.',
    roles: [{ name: 'the asker' }, { name: 'the answerer' }, { name: 'a third process' }],
    steps: [
      { from: 0, to: 2, label: '⟨question, vector clock⟩', phase: 'question' },
      { from: 0, to: 1, label: 'same message, arrives quickly', phase: 'question' },
      { from: 1, to: 2, label: '⟨answer, vector clock includes the question⟩', phase: 'answer' },
      { from: 2, to: 2, label: 'the answer arrives first: hold it back', color: 'quiet', phase: 'order' },
      { from: 2, to: 2, label: 'the question arrives: deliver both, in order', color: 'reply', phase: 'order' }
    ],
    why: 'The vector clock names what the sender had seen, so nothing is delivered before its cause.',
    cost: 'a vector of n counters on every message'
  },

  gossip: {
    title: 'Gossip (epidemic broadcast)',
    subtitle: 'Tell a few random neighbours, a few times; the rumour does the rest.',
    roles: [{ name: 'a process that knows' }, { name: 'f random neighbours' }, { name: 'the rest' }],
    steps: [
      { from: 0, to: 1, label: 'round 1: the rumour to f random neighbours', phase: 'rounds' },
      { from: 1, to: 1, label: 'first time: deliver it', color: 'reply', phase: 'rounds' },
      { from: 1, to: 2, label: 'round 2: they tell f others each', phase: 'rounds' },
      { from: 2, to: 2, label: 'already heard: stay quiet', color: 'quiet', phase: 'rounds' }
    ],
    why: 'Reach grows fast in the number of rounds and cheaply in messages, but nothing is guaranteed.',
    cost: 'fanout × rounds messages per process'
  },

  'perfect-detector': {
    title: 'Perfect failure detector (P)',
    subtitle: 'With known bounds, silence for longer than the bounds allow can only mean a crash.',
    roles: [{ name: 'the monitor' }, { name: 'a live process' }, { name: 'a crashed process' }],
    steps: [
      { from: 1, to: 0, label: '⟨HEARTBEAT⟩ every period', color: 'reply', phase: 'watch' },
      { from: 0, to: 0, label: 'heard within period + 2Δ + φ: alive', color: 'reply', phase: 'watch' },
      { from: 2, to: 2, label: 'crash', color: 'bad', phase: 'detect' },
      { from: 0, to: 0, label: 'the window passes with no heartbeat', color: 'bad', phase: 'detect' },
      { from: 0, to: 0, label: 'suspect, and never take it back', color: 'bad', phase: 'detect' }
    ],
    why: 'Correct only because the model is timed: raise the delays above Δ and the perfect detector starts lying.',
    cost: 'detection within period + 2Δ + φ'
  },

  'omega-leader': {
    title: 'Ω, eventual leader',
    subtitle: 'Trust the smallest process nobody suspects, and grow the timeout after every mistake.',
    roles: [{ name: 'a process' }, { name: 'the current leader' }, { name: 'the next leader' }],
    steps: [
      { from: 1, to: 0, label: 'heartbeats from the leader', color: 'reply', phase: 'before GST' },
      { from: 0, to: 0, label: 'a slow heartbeat looks like a crash: change leader', color: 'bad', phase: 'before GST' },
      { from: 0, to: 0, label: 'it was wrong: raise the timeout', color: 'quiet', phase: 'before GST' },
      { from: 1, to: 0, label: 'after GST the heartbeats are on time', color: 'reply', phase: 'after GST' },
      { from: 1, to: 1, label: 'the leader crashes', color: 'bad', phase: 'handover' },
      { from: 2, to: 0, label: 'everybody trusts the next smallest, together', color: 'reply', phase: 'handover' }
    ],
    why: 'The timeout eventually exceeds the real delay, so the mistakes stop and one correct leader remains.',
    cost: 'the weakest detector that makes consensus possible'
  },

  'mutual-exclusion': {
    title: 'Ricart-Agrawala mutual exclusion',
    subtitle: 'Ask everybody, enter when everybody has answered, and answer the ones you kept waiting.',
    roles: [{ name: 'the asker' }, { name: 'a process not interested' }, { name: 'a process asking too' }],
    steps: [
      { from: 0, to: 1, label: '⟨REQUEST, my timestamp⟩', phase: 'ask' },
      { from: 1, to: 0, label: '⟨REPLY⟩ at once', color: 'reply', phase: 'ask' },
      { from: 0, to: 2, label: '⟨REQUEST, my timestamp⟩', phase: 'ask' },
      { from: 2, to: 2, label: 'my request is older: defer the reply', color: 'quiet', phase: 'ask' },
      { from: 0, to: 0, label: 'every reply in: enter the critical section', color: 'reply', phase: 'enter' },
      { from: 0, to: 2, label: 'on leaving: ⟨REPLY⟩ to the deferred one', color: 'reply', phase: 'leave' }
    ],
    why: 'Timestamps order the requests and every pair of processes agrees on that order, so only one can be inside.',
    cost: '2(n − 1) messages per entry, no coordinator'
  },

  'two-phase-commit': {
    title: 'Two-phase commit',
    subtitle: 'Ask everybody, decide once, tell everybody. And that is the problem.',
    roles: [{ name: 'the coordinator' }, { name: 'a participant' }, { name: 'another participant' }],
    steps: [
      { from: 0, to: 1, label: '⟨PREPARE⟩', phase: 'phase 1' },
      { from: 1, to: 0, label: '⟨VOTE, yes⟩', color: 'reply', phase: 'phase 1' },
      { from: 2, to: 0, label: '⟨VOTE, yes⟩', color: 'reply', phase: 'phase 1' },
      { from: 0, to: 0, label: 'all yes: decide commit', phase: 'phase 2' },
      { from: 0, to: 1, label: '⟨DECISION, commit⟩', color: 'reply', phase: 'phase 2' },
      { from: 0, to: 0, label: 'a crash here instead, and nobody can decide', color: 'bad', phase: 'blocking' }
    ],
    why: 'A participant that voted yes cannot decide alone: the missing coordinator might have decided either way.',
    cost: 'blocking; consensus-based commit exists to avoid exactly this'
  },

  'logical-clocks': {
    title: 'Logical clocks: Lamport and vector',
    subtitle: 'A counter that respects causality, and a vector that also refuses to invent an order.',
    roles: [{ name: 'a process' }, { name: 'the message' }, { name: 'the receiver' }],
    steps: [
      { from: 0, to: 0, label: 'local event: clock + 1', phase: 'send' },
      { from: 0, to: 2, label: 'the message carries the clock', phase: 'send' },
      { from: 2, to: 2, label: 'Lamport: clock := max(mine, yours) + 1', color: 'reply', phase: 'receive' },
      { from: 2, to: 2, label: 'vector: entrywise max, then my own + 1', color: 'reply', phase: 'receive' }
    ],
    why: 'Lamport orders what is causally related and invents an order for the rest; a vector leaves the concurrent pairs unordered.',
    cost: 'one number, or one number per process'
  },

  snapshot: {
    title: 'Chandy-Lamport snapshot',
    subtitle: 'Record your own state, send a marker on every channel, and record what arrives until its marker comes.',
    roles: [{ name: 'the initiator' }, { name: 'a channel' }, { name: 'another process' }],
    steps: [
      { from: 0, to: 0, label: 'record my own state', phase: 'start' },
      { from: 0, to: 2, label: '⟨MARKER⟩ on every outgoing channel', phase: 'start' },
      { from: 2, to: 2, label: 'first marker: record my state, send markers', color: 'reply', phase: 'spread' },
      { from: 1, to: 2, label: 'messages arriving before the marker belong to the channel', color: 'quiet', phase: 'record' },
      { from: 2, to: 2, label: 'a marker on every channel: my part of the cut is done', color: 'reply', phase: 'record' }
    ],
    why: 'On FIFO channels the markers cut every channel at a consistent point: local states plus messages in flight.',
    cost: 'one marker per channel; FIFO is the hypothesis'
  },

  'quorum-register': {
    title: 'Majority-quorum register',
    subtitle: 'Write to a majority; read from a majority and write back what you found.',
    roles: [{ name: 'the client' }, { name: 'a majority of replicas' }, { name: 'the replicas left behind' }],
    steps: [
      { from: 0, to: 1, label: 'write: ⟨STORE, timestamp, value⟩', phase: 'write' },
      { from: 1, to: 0, label: '⟨ACK⟩ from a majority: the write returns', color: 'reply', phase: 'write' },
      { from: 0, to: 1, label: 'read: ⟨READ⟩ to everybody', phase: 'read' },
      { from: 1, to: 0, label: 'values with their timestamps, from a majority', color: 'reply', phase: 'read' },
      { from: 0, to: 1, label: 'write back the highest one, to a majority', phase: 'write back' },
      { from: 0, to: 0, label: 'return it', color: 'reply', phase: 'write back' }
    ],
    why: 'Every two majorities share a replica, so a read cannot miss a completed write; the write-back stops a later read from going backwards.',
    cost: 'safety under any fault, progress only while a majority answers'
  },

  'total-order': {
    title: 'Total order broadcast with a sequencer',
    subtitle: 'One process decides the order; everybody delivers in that order and no other.',
    roles: [{ name: 'a sender' }, { name: 'the sequencer' }, { name: 'a receiver' }],
    steps: [
      { from: 0, to: 1, label: '⟨DATA, m⟩ to everybody, including the sequencer', phase: 'submit' },
      { from: 1, to: 1, label: 'assign the next sequence number', phase: 'order' },
      { from: 1, to: 2, label: '⟨ORDER, n, m⟩ to everybody', color: 'reply', phase: 'order' },
      { from: 2, to: 2, label: 'deliver n only after n − 1', color: 'reply', phase: 'deliver' },
      { from: 1, to: 1, label: 'the sequencer crashes: nothing is ordered any more', color: 'bad', phase: 'the catch' }
    ],
    why: 'The order is whatever the sequencer saw: cheap, total, and dependent on a single process.',
    cost: 'two messages per broadcast; consensus is what removes the single point'
  },

  paxos: {
    title: 'Paxos: consensus on one value',
    subtitle: 'Two majorities always meet, and a proposer adopts what it hears instead of insisting.',
    roles: [{ name: 'a proposer' }, { name: 'a majority of acceptors' }, { name: 'the learners' }],
    steps: [
      { from: 0, to: 1, label: '⟨PREPARE, ballot b⟩', phase: 'phase 1' },
      { from: 1, to: 0, label: '⟨PROMISE, b, the value I accepted, if any⟩', color: 'reply', phase: 'phase 1' },
      { from: 0, to: 0, label: 'adopt the value of the highest ballot heard', phase: 'phase 2' },
      { from: 0, to: 1, label: '⟨ACCEPT, b, value⟩', phase: 'phase 2' },
      { from: 1, to: 0, label: '⟨ACCEPTED, b⟩ from a majority', color: 'reply', phase: 'phase 2' },
      { from: 0, to: 2, label: '⟨DECIDED, value⟩', color: 'reply', phase: 'learn' }
    ],
    why: 'A value accepted by a majority is seen by every later ballot, so no two ballots can fix different values.',
    cost: 'safety always; termination needs a leader that stops being outbid'
  },

  'ben-or': {
    title: 'Ben-Or: consensus with a coin',
    subtitle: 'When a round does not converge, everybody tosses a coin; the schedule cannot win for ever.',
    roles: [{ name: 'a process' }, { name: 'everybody else' }, { name: 'the decision' }],
    steps: [
      { from: 0, to: 1, label: 'phase 1: my value', phase: 'phase 1' },
      { from: 1, to: 0, label: 'N − f values back: more than half equal?', color: 'reply', phase: 'phase 1' },
      { from: 0, to: 1, label: 'phase 2: that value, or NONE', phase: 'phase 2' },
      { from: 1, to: 0, label: 'N − f proposals back', color: 'reply', phase: 'phase 2' },
      { from: 0, to: 2, label: 'more than f equal proposals: decide', color: 'reply', phase: 'decide' },
      { from: 0, to: 0, label: 'none at all: toss a coin and go round again', color: 'bad', phase: 'decide' }
    ],
    why: 'Agreement never depends on the coin; termination does, and its probability grows with every round.',
    cost: 'terminates with probability one, not within a bound'
  }
};

module.exports = { PROTOCOLS };
