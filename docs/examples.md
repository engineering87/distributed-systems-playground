# Examples

Each example is a complete scenario: topology, code, timing model, inputs and faults. Load one from the *Example* menu; the run starts playing right away. Loading an example replaces the current scenario, and the notification offers **Undo**.

For every example this page gives the setup, what to watch, a few experiments, and the simplifications that matter for it. The numbers quoted come from the default seed; a different seed gives a different but equally reproducible run.

## Contents

- [Flooding broadcast](#flooding-broadcast)
- [Ring leader election, Chang-Roberts](#ring-leader-election-chang-roberts)
- [FloodSet consensus](#floodset-consensus)
- [Failure detector ◇P](#failure-detector-p)
- [Failure detector across a partition and a recovery](#failure-detector-across-a-partition-and-a-recovery)
- [Reliable broadcast when the sender crashes](#reliable-broadcast-when-the-sender-crashes)
- [Causal order broadcast: questions before answers](#causal-order-broadcast-questions-before-answers)
- [Gossip: spreading a rumor](#gossip-spreading-a-rumor)
- [Empty scenario](#empty-scenario)

## Flooding broadcast

**Topic:** broadcast on an arbitrary graph · **Model:** asynchronous · **Topology:** 3×4 grid · **Seed:** 7

Every process that receives a message for the first time delivers it and forwards it to all its neighbors except the one it came from. p1 broadcasts `"hello"` at time 0 and p12 broadcasts `"ok"` 40 ms later.

**What to watch.** The two waves spread across the grid and cross in the middle. Each process delivers each message exactly once; the second handler silently drops copies that arrive by another path. The run uses 46 messages and ends after about 200 ms.

**Try this.**

- Set *Loss* to `0.3` in the *Timing* tab. Flooding has no retransmission, so whether a process still gets a message depends on whether some path survived. With seed 7, ten processes deliver `"hello"` and eight deliver `"ok"`; with seed 2 everybody delivers both.
- Disable two links with the *Enabled* checkbox and see which processes become unreachable.
- Generate a random or tree topology with the same code. The algorithm needs no change.

**Keep in mind.** Messages are identified by their content, so broadcasting the same text twice delivers it only once.

## Ring leader election, Chang-Roberts

**Topic:** leader election · **Model:** asynchronous · **Topology:** directed ring of 8, identifiers in the order 3, 7, 1, 5, 2, 8, 4, 6 · **Seed:** 11

Every process starts an election by sending its own identifier clockwise. A process forwards identifiers larger than its own, replaces smaller ones with its own if it has not already done so, and declares itself leader when its own identifier comes back. The winner then circulates an `ELECTED` message.

**What to watch.** Small identifiers disappear quickly; 8 travels the whole ring. Every process outputs `Elected | 8`. The run uses 20 election messages and 8 announcement messages.

**Try this.**

- Change the input to `0ms 1 Start` so that only one process starts. Count the messages.
- Give one link a slow delay distribution, such as `uniform(100ms, 200ms)`, and follow the election around it.
- Rebuild the ring with identifiers in increasing order, using the ring generator with *Directed* checked, and compare the number of messages.

**Keep in mind.** The algorithm assumes reliable FIFO channels and no crashes. A crash breaks the ring and the election never ends.

## FloodSet consensus

**Topic:** consensus with crash failures · **Model:** synchronous rounds · **Topology:** complete graph of 4 · **Seed:** 5

Each process proposes a random value from 1 to 9. In each of the first f + 1 rounds (f = 1 here) every process sends the set of values it knows to everybody; at the end of round f + 1 it decides the minimum of its set.

**What to watch.** With the *Ideal synchronous* preset, the proposals are 8, 7, 7 and 3, and every process decides 3. The dashed vertical lines on the diagram mark the rounds. No violation is possible.

**Try this.**

- Switch to *Realistic synchronous* and run with the same seed. Rounds are now built on drifting clocks, delays have a long tail, and late messages are discarded. The run records 11 violations and 9 discarded messages, and p2 decides 7 while everybody else decides 3: the value 3 never reached p2 in time. The algorithm is correct; its assumption is not.
- Change the policy to *Deliver late* and run again. Late messages now reach processes in a later round, and with this seed everybody decides 3 again.
- Try other seeds with the dice button. Disagreement is rare: the minimum has many paths to every process, and all of them must fail. It shows up in roughly 1 seed out of 50.
- Back in *Ideal synchronous*, crash p4 at `0ms`. Its value never spreads, and the others agree on 7.

**Keep in mind.** In lockstep rounds a process cannot crash in the middle of its sends, so the classic scenario where a crashing process reaches only some of the others is not reproduced by a crash alone. See [Faults](faults.md#crash).

## Failure detector ◇P

**Topic:** failure detection under partial synchrony · **Model:** partially synchronous, GST at 3 s · **Topology:** complete graph of 4 · **Seed:** 5

Every process periodically asks everybody for a heartbeat. A process that does not answer before the timeout is suspected; if an answer later arrives from a suspected process, the suspicion is withdrawn and the timeout grows by `DELTA0`. Process p3 crashes at 6 s.

**What to watch.**

- Before GST, heavy-tailed delays cause wrong suspicions: 44 `Suspect` and `Restore` outputs in the first three seconds.
- After GST, a few corrections, then silence while the timeouts have grown enough.
- After the crash, p1, p2 and p4 suspect p3 within a second, and nothing else.

Open the *State* tab on any process to follow `suspected` and `delay`.

**Try this.**

- Move GST to `8s`. The crash happens during the unstable period, and it becomes harder to tell apart from slowness.
- Remove GST. Wrong suspicions continue for the whole run.
- Lower `DELTA0` to `20ms` and watch the timeout grow more slowly.

**Keep in mind.** The algorithm uses `DirectLinks`, a perfect link only because the network does not lose messages here. With loss, replace it with `AckLinks` from the library.

## Failure detector across a partition and a recovery

**Topic:** partitions, crash-recovery · **Model:** partially synchronous, GST at 1 s · **Topology:** complete graph of 5 · **Seed:** 5

The same detector runs on five processes, with three scheduled faults: the network splits into {p1, p2} and {p3, p4, p5} from 4 s to 7 s, p5 crashes at 9 s and recovers at 11 s.

**What to watch.**

- Just before the partition heals, p1 and p2 suspect {p3, p4, p5}, and p3, p4 and p5 suspect {p1, p2}. Each side believes the other crashed.
- After the partition, the suspicions are withdrawn.
- While p5 is down, everybody suspects p5.
- p5 restarts with its state reset and its `Init` handler restarts the heartbeats. By the end of the run nobody suspects anybody.

**Try this.**

- Make the partition permanent by emptying *Until*. Which suspicions never go away?
- Add `stable` in front of `delay` in the code, rerun, and compare p5's timeout after the recovery.
- Pause at 5 s, select p1 and press **Isolate here** to add a second partition from that moment.

**Keep in mind.** Messages in flight when the partition starts are dropped when they arrive. The detector cannot distinguish a partition from a crash, which is exactly the point.

## Reliable broadcast when the sender crashes

**Topic:** reliable broadcast, layering · **Model:** asynchronous, 40% message loss · **Topology:** complete graph of 5 · **Seed:** 4

A newsroom application publishes through a stack of library modules: *EagerReliableBroadcast* on top of *BasicBroadcast* on top of *AckLinks*. p1 publishes `"news"` at time 0 and crashes at 40 ms, before its first retransmission.

**What to watch.**

- Many of p1's first messages are lost, and p1 is gone before it can resend them.
- p2 received the news and relays it; the relays reach p3, p4 and p5.
- Every process reads the news once.
- Tick **Layers** to color messages by their origin: the application's broadcast, the relays, and the link layer's acknowledgements and retransmissions. Open the *Stack* tab to follow the events through the modules.

**Try this.**

- In the first algorithm, replace `uses ReliableBroadcast` with `uses BestEffortBroadcast` and run with the same seed. Only p2 reads the news.
- Remove the crash. With best-effort broadcast, everybody reads the news again: the difference only shows when the sender fails.
- Replace `ReliableBroadcast` with `UniformReliableBroadcast` and add *MajorityAckURB* from *Add module*.

**Keep in mind.** The crash has to happen before retransmissions, because a step is never interrupted (see [Faults](faults.md#crash)). The loss rate is what makes the partial broadcast possible.

## Causal order broadcast: questions before answers

**Topic:** causal order, vector clocks · **Model:** asynchronous, channels without FIFO, delays from 5 to 120 ms · **Topology:** complete graph of 5 · **Seed:** 5

p1 posts a question. p2 answers as soon as it reads it. Everything goes through *WaitingCausalBroadcast*, which attaches a vector clock to each message.

**What to watch.** Every process reads the question before the answer, even when the answer arrives first: it waits in the pending set until the question has been delivered.

**Try this.**

- Replace `uses CausalOrderBroadcast` with `uses ReliableBroadcast` and run with the same seed. p4 and p5 read the answer before the question.
- Tick **Causality**, click the event where p2 reads the question, and see which events it could have influenced. The answer is in its future everywhere.
- Open the *State* tab on p4 and watch `pending` hold the answer for a while.

**Keep in mind.** The test suite checks 30 seeds for this example: none delivers an answer before its question.

## Gossip: spreading a rumor

**Topic:** probabilistic broadcast · **Model:** asynchronous · **Topology:** 16 processes on a ring with chords, 4 neighbors each · **Seed:** 7

p1 spreads a rumor. Each process that hears it for the first time forwards it to `FANOUT` random neighbors, for at most `ROUNDS` hops.

**What to watch.** With `FANOUT := 2` and `ROUNDS := 4`, 10 of the 16 processes hear the rumor, using 16 messages. Nobody hears it twice.

**Try this.** Change the parameters at the top of *EagerGossip*:

| FANOUT | ROUNDS | Processes reached | Messages |
|---|---|---|---|
| 2 | 4 | 10 | 16 |
| 2 | 6 | 14 | 24 |
| 3 | 4 | 16 | 39 |
| 4 | 4 | 16 | 64 |

Try several seeds with the dice button: coverage varies from run to run, which is what *probabilistic* means.

**Keep in mind.** Targets are chosen among neighbors, so the topology shapes the spread. Gossip never retries.

## Empty scenario

A ring of five processes and a small program that greets its neighbors and counts replies. Use it as a starting point for your own algorithms, and see [Getting started](getting-started.md) for a guided first program.
