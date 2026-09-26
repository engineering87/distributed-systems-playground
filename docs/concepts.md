# Concepts

This page is a short course in the ideas the playground is built around. Each section explains a concept, points to the literature, and ends with *In the playground*: where you can see the concept at work. It does not replace a textbook; the [references](#further-reading) at the end are good places to go deeper.

## Contents

- [Processes and messages](#processes-and-messages)
- [Events and handlers](#events-and-handlers)
- [Time without a shared clock](#time-without-a-shared-clock)
- [Failures](#failures)
- [Timing models](#timing-models)
- [Failure detectors](#failure-detectors)
- [Safety and liveness](#safety-and-liveness)
- [Layers of abstraction](#layers-of-abstraction)
- [Broadcast](#broadcast)
- [Consensus](#consensus)
- [Quorums](#quorums)
- [Partitions](#partitions)
- [Glossary](#glossary)
- [Further reading](#further-reading)

## Processes and messages

A distributed system is a set of **processes** that run independently and cooperate by exchanging **messages**. A process can be a program on a server, a phone, a sensor. What makes the system distributed is that processes share no memory: the only way to learn about another process is to receive a message from it.

That single fact explains most of the difficulty. A message describes the sender's state at the moment it was sent; by the time it arrives, that state may have changed, or the sender may have stopped.

**In the playground.** Processes are the numbered circles on the graph; `Π` is the set of all of them. Messages travel along links as packets. A process only sees what arrives in its `Deliver` handlers.

## Events and handlers

Textbook distributed algorithms are usually written in an **event-driven** style. A process does nothing on its own: it reacts to events, such as a message arriving, a timer expiring or a request from the application, by updating its state and triggering new events.

This style has two advantages. It matches how real systems are built, around event loops. And it makes the algorithm easy to reason about, because each handler is a small atomic piece of code.

**In the playground.** Upon is this style made executable. Each `upon event` block is a handler. A process handles one event at a time, as a *step*, and the diagram shows each step as a short bar on the process line. See [How the engine works](engine.md#anatomy-of-a-step).

## Time without a shared clock

### Physical clocks

Every computer has a clock, and no two clocks agree. They start with different **offsets** and run at slightly different rates, called **drift**. Clock synchronization protocols reduce the difference, but cannot remove it. An algorithm that compares timestamps from different machines inherits this error.

### Causality

In 1978 Leslie Lamport observed that what usually matters is not *when* something happened but *what could have influenced what*. Event *a* **happened before** event *b* if *a* and *b* are on the same process and *a* came first, or if *a* sent a message that was received at or before *b*, directly or through a chain of such messages. When neither happened before the other, the two events are **concurrent**: no information could have flowed between them, so their order does not matter to the system.

A **space-time diagram** draws exactly this: one line per process, arrows for messages. *a* happened before *b* if you can go from *a* to *b* moving forward along lines and arrows.

### Logical clocks

A **Lamport clock** is a counter that each process increments at every event and attaches to every message; on receipt, a process sets its counter above the one received. If *a* happened before *b*, *a* has the smaller timestamp. The converse does not hold.

A **vector clock**, introduced independently by Fidge and Mattern, keeps one counter per process. Comparing two vectors tells exactly whether two events are causally related or concurrent.

**In the playground.**

- Each process has a local clock with its own offset and drift, readable with `now()`. See [The timing model](timing-model.md).
- The diagram is a space-time diagram. **Causality** mode shades, for any event you click, the part of the history that happened before it and the part that happened after it; the rest is concurrent.
- *WaitingCausalBroadcast* in the [library](library.md#waitingcausalbroadcast) uses vector clocks.

## Failures

A distributed system can fail in part: some processes or links stop working while the rest continue. The literature classifies failures by how badly a component can misbehave.

| Model | A faulty process can |
|---|---|
| Crash-stop | stop and never come back |
| Crash-recovery | stop, then restart, losing what was not on stable storage |
| Omission | fail to send or receive some messages |
| Byzantine | behave arbitrarily, including lying |

Links are classified in the same spirit:

| Link | Guarantee |
|---|---|
| Fair-loss | messages can be lost, but a message sent infinitely often is delivered infinitely often |
| Stubborn | a message sent once is delivered infinitely often |
| Perfect (reliable) | a message sent between correct processes is delivered exactly once |

Stronger links are built on weaker ones with retransmission and duplicate elimination.

A process is **correct** if it never fails during the run; otherwise it is **faulty**. Most properties are stated for correct processes only.

**In the playground.** Crashes, recoveries, link failures and partitions are described in [Faults](faults.md). `Net` behaves as a fair-loss link when loss is enabled; the library builds stubborn and perfect links on top of it. Byzantine and omission failures of processes are not modeled.

## Timing models

What an algorithm can do depends on what it may assume about time.

**Synchronous.** There are known bounds on message delay, on processing time and on clock drift. An algorithm can wait for a bounded time and conclude that a silent process has crashed. Many algorithms are written in **rounds**: in each round, every process sends, receives and computes.

**Asynchronous.** No bounds at all. This is the safest assumption, because it holds everywhere, but it is also very weak. Fischer, Lynch and Paterson proved in 1985 that in an asynchronous system no deterministic algorithm can guarantee consensus if even one process may crash. The reason is that a crashed process cannot be told apart from a slow one.

**Partially synchronous.** Bounds exist but are not known, or hold only after an unknown **Global Stabilization Time**. Dwork, Lynch and Stockmeyer introduced this model in 1988 and showed that consensus is possible in it. Practical protocols such as Paxos and Raft are designed for this setting: they never violate safety, and they make progress once the network behaves.

**In the playground.** The *Timing* tab separates the model the algorithm assumes from the behavior of the simulated network, so you can see what happens when the assumption is wrong. See [The timing model](timing-model.md).

## Failure detectors

Chandra and Toueg proposed in 1996 to package timing assumptions into a module, the **failure detector**, that tells each process which others it suspects of having crashed. A failure detector may be wrong; its classes are defined by how wrong.

- **Completeness**: crashed processes are eventually suspected. *Strong completeness*: every crashed process is eventually suspected forever by every correct process.
- **Accuracy**: correct processes are not suspected. *Strong accuracy*: never. *Eventual strong accuracy*: after some time, never again.

| Detector | Completeness | Accuracy |
|---|---|---|
| P (perfect) | strong | strong |
| ◇P (eventually perfect) | strong | eventual strong |

A perfect detector can be built in a synchronous system. An eventually perfect one can be built under partial synchrony: suspect a process after a timeout, and increase the timeout every time a suspicion turns out to be wrong. Chandra, Hadzilacos and Toueg later showed that **Ω**, a detector that eventually points every correct process to the same correct leader, is the weakest one that makes consensus solvable.

**In the playground.** The two ◇P examples implement the increasing-timeout detector. Before GST it makes mistakes; afterwards it stabilizes. The partition example shows that a partition looks exactly like a crash of the other side.

## Safety and liveness

Properties of distributed algorithms come in two kinds.

- A **safety** property says that nothing bad ever happens: two processes never decide different values, a message is never delivered twice. If it is violated, there is a finite moment where it went wrong.
- A **liveness** property says that something good eventually happens: every correct process eventually decides, every message is eventually delivered. It can never be violated at a finite moment, because the good thing might still happen later.

The distinction matters when reading a run. A single run can show that a safety property was violated. It can never prove that a liveness property holds, and it can only suggest that one fails, because the run ends.

**In the playground.** Agreement in FloodSet is a safety property; the *Realistic synchronous* run shows it violated. A run that ends before a process delivers does not by itself violate a liveness property; the simulated duration may simply be too short. See also [What the playground is not](assumptions.md#what-the-playground-is-not).

## Layers of abstraction

Complex algorithms are built from simpler ones. A module offers an **interface**, a set of requests it accepts and indications it emits, together with properties it guarantees. Modules above it rely on those properties and never look inside.

A typical stack: fair-loss links, then perfect links, then best-effort broadcast, then reliable broadcast, then an application. Each layer adds a guarantee.

**In the playground.** Each Upon algorithm implements one interface and uses others. The *Stack* tab draws the resulting tree for any process and animates the events flowing between modules. **Layers** colors network messages by the module that started them.

## Broadcast

Broadcast sends a message to all processes. The guarantees vary:

| Abstraction | Adds |
|---|---|
| Best-effort | if the sender is correct, every correct process delivers |
| Reliable | if any correct process delivers, every correct process delivers, even if the sender crashed |
| Uniform reliable | if any process delivers, even one that then crashes, every correct process delivers |
| FIFO | messages of the same sender are delivered in sending order |
| Causal | a message is delivered after every message that may have influenced it |
| Total order | all processes deliver all messages in the same order |

Total-order broadcast is as hard as consensus: each can be built from the other.

**In the playground.** The library has best-effort, reliable, uniform reliable, FIFO, causal and probabilistic broadcast. The examples compare reliable with best-effort broadcast when the sender crashes, and causal with reliable broadcast when channels reorder messages.

## Consensus

In **consensus**, each process proposes a value and all must decide one. The usual properties:

- **Termination**: every correct process eventually decides.
- **Validity**: the decided value was proposed by some process.
- **Integrity**: a process decides at most once.
- **Agreement**: no two correct processes decide differently. *Uniform agreement*: no two processes at all.

Consensus underlies replicated state machines, atomic commit and leader election. FloodSet solves it in synchronous systems with up to *f* crashes, using *f* + 1 rounds: in each round every process forwards all the values it knows, and at the end all correct processes know the same set. In partially synchronous systems, Paxos and its descendants are the standard answer.

**In the playground.** The FloodSet example runs the algorithm in ideal and in realistic rounds. Paxos and other consensus algorithms are on the roadmap.

## Quorums

A **quorum** is a set of processes large enough that any two quorums intersect. With majorities, any two sets of more than half the processes share at least one process. That shared process carries information from one operation to the next, which is how many algorithms survive failures without knowing which processes failed.

The price is availability: if half or more of the processes are unreachable, no majority can be formed, and the algorithm waits.

**In the playground.** *MajorityAckURB* delivers a message only after a majority relayed it, so at least one correct process has it. Crash half the processes and it stops delivering, as it should.

## Partitions

A **network partition** splits the processes into groups that cannot communicate. Each group sees the others as crashed.

The CAP theorem, stated by Brewer in 2000 and proved by Gilbert and Lynch in 2002, says that during a partition a replicated system must choose between consistency (all replicas agree) and availability (every request gets an answer). Quorum-based systems choose consistency: the minority side stops.

**In the playground.** Partitions are scheduled in the *Scenario* tab or injected with **Isolate here**. The partition example shows two groups suspecting each other.

## Glossary

| Term | Meaning |
|---|---|
| Atom | in Upon, a constant written in capitals, such as `ACK` |
| Causal cone | the events that happened before and after a given event |
| Correct process | a process that never fails during the run |
| Drift | the rate at which a clock gains or loses time |
| GST | Global Stabilization Time, after which a partially synchronous system behaves synchronously |
| Handler | code that runs when an event matches |
| Indication | an event a module sends to the module above it |
| Instance | one copy of a module inside one process |
| Interface | the requests and indications of a module |
| Lockstep | an idealized execution in which all processes share the same rounds |
| Offset | the difference between a clock and the global time at the start |
| Quorum | a set of processes that intersects every other quorum |
| Request | an event a module sends to the module below it |
| Round | one send-receive-compute cycle of a synchronous algorithm |
| Seed | the number that fixes all random choices of a run |
| Step | the handling of one event by one process |
| Violation | a moment where the actual system broke the assumed model |

## Further reading

- C. Cachin, R. Guerraoui, L. Rodrigues. *Introduction to Reliable and Secure Distributed Programming*, 2nd ed. Springer, 2011. The notation and most library modules come from here.
- N. Lynch. *Distributed Algorithms*. Morgan Kaufmann, 1996. Synchronous algorithms, FloodSet, lower bounds.
- M. van Steen, A. S. Tanenbaum. *Distributed Systems*. A broad introduction, available free from the authors.
- M. Kleppmann. *Designing Data-Intensive Applications*. O'Reilly, 2017. The practical side: replication, partitions, consistency.
- L. Lamport. Time, Clocks, and the Ordering of Events in a Distributed System. *Communications of the ACM* 21(7), 1978.
- M. J. Fischer, N. A. Lynch, M. S. Paterson. Impossibility of Distributed Consensus with One Faulty Process. *Journal of the ACM* 32(2), 1985.
- C. Dwork, N. Lynch, L. Stockmeyer. Consensus in the Presence of Partial Synchrony. *Journal of the ACM* 35(2), 1988.
- T. D. Chandra, S. Toueg. Unreliable Failure Detectors for Reliable Distributed Systems. *Journal of the ACM* 43(2), 1996.
- T. D. Chandra, V. Hadzilacos, S. Toueg. The Weakest Failure Detector for Solving Consensus. *Journal of the ACM* 43(4), 1996.
- S. Gilbert, N. Lynch. Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services. *ACM SIGACT News* 33(2), 2002.

## Why distributed systems are hard

A distributed system is a set of independent processes that cooperate by exchanging messages. Databases that replicate data across data centers, payment networks, container orchestrators, blockchains and the services behind any large website are all distributed systems. They are built this way for fault tolerance, scale and geography, and they pay for it with a set of problems that do not exist on a single machine.

## No shared memory, no shared clock

Processes do not share memory. The only way for one process to learn something about another is to receive a message from it, and by the time the message arrives, the sender may have changed its state, or stopped.

There is also no global clock. Each machine has its own oscillator, clocks drift apart, and synchronization protocols can only bound the error, not remove it. Leslie Lamport showed in 1978 that the meaningful notion of time in such a system is causal: an event *happened before* another only if information could have flowed from the first to the second. A **space-time diagram**, with one horizontal line per process and one arrow per message, is the standard way to draw this relation, and it is the main view of this playground.

## Partial failures

On a single computer, a failure usually stops everything. In a distributed system, some processes fail while others keep running, and the survivors have to decide what to do without knowing exactly what happened. The literature classifies failures by how badly a process can misbehave:

| Failure model | What a faulty process can do |
|---|---|
| Crash-stop | stop at an arbitrary moment and never come back |
| Crash-recovery | stop and later restart, possibly losing volatile state |
| Omission | fail to send or receive some messages |
| Byzantine | behave arbitrarily, including lying or colluding |

Channels fail too. Messages can be lost, duplicated, reordered or delayed, and a link can fail while both endpoints keep working. A slow process and a crashed one look identical from the outside, which is the root of most of the difficulty.

## Timing models

What an algorithm can achieve depends heavily on what it may assume about time:

- **Synchronous.** There are known bounds on message delay, on processing time and on clock drift. Algorithms can proceed in rounds and treat a missing message as proof of failure.
- **Asynchronous.** There are no bounds at all. This is the weakest and safest assumption, but Fischer, Lynch and Paterson proved in 1985 that no deterministic algorithm can guarantee consensus in this model if even one process may crash (the FLP impossibility result).
- **Partially synchronous.** Bounds exist but are unknown, or hold only after some unknown Global Stabilization Time (GST). Dwork, Lynch and Stockmeyer introduced this model in 1988, and practical consensus protocols such as Paxos and Raft are designed for it: they are always safe, and they make progress once the network behaves.

Unreliable **failure detectors**, introduced by Chandra and Toueg, package these timing assumptions into an abstraction. An *eventually perfect* detector may suspect correct processes for a while, but eventually suspects exactly the crashed ones.

## Layers of abstraction

Textbooks, most notably *Introduction to Reliable and Secure Distributed Programming* by Cachin, Guerraoui and Rodrigues, build distributed algorithms as stacks of modules. A perfect link is built on a lossy link, a reliable broadcast on perfect links, a failure detector on timers and links, and consensus on top of broadcast and failure detection. Each module reacts to events from the layers around it:

```
upon event ⟨pl, Deliver | p, m⟩ do
  trigger ⟨beb, Deliver | p, m⟩
end
```

This notation is precise enough to reason about and close enough to code that it can be executed. The playground executes it.

## The gap between the model and the network

Proofs hold under their assumptions. When a course states that FloodSet solves consensus in f + 1 synchronous rounds, the statement is correct, and it is also silent about what happens when a round-2 message arrives 5 milliseconds after the round closed. Real networks have long-tailed latency, sporadic spikes, drifting clocks and garbage-collection pauses. The consequences of that gap are hard to see on a whiteboard, and they are the reason distributed systems fail in production.

This project exists to make that gap visible.
