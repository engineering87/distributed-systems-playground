# Assumptions and simplifications

A simulator is a model, and every model leaves things out. This page lists what Distributed Systems Playground assumes about processes, time, networks and failures, where it simplifies the textbook algorithms, and where its analysis tools approximate. The other pages link here instead of repeating these points.

If a result in the playground surprises you, check this page first. Many surprises come from one of the choices below rather than from the algorithm.

## Contents

- [The system](#the-system)
- [Time and clocks](#time-and-clocks)
- [The network](#the-network)
- [Synchrony models](#synchrony-models)
- [Failures](#failures)
- [The language](#the-language)
- [The module library](#the-module-library)
- [Analysis and visualization](#analysis-and-visualization)
- [Hard limits](#hard-limits)
- [What the playground is not](#what-the-playground-is-not)

## The system

**The set of processes is fixed and known.** Processes are numbered 1, 2, 3 and so on. Every process knows the whole set `Π` from the start, even processes it has no link to. There are no joins, leaves or membership changes.

**The topology is static.** Links can fail and recover (see [Failures](#failures)), but they are never created or removed during a run.

**A process handles one event at a time.** Handling an event is a *step*. A step starts when the event is taken from the queue and lasts a duration sampled from the *step duration* distribution. While a process is busy, new events for it wait. The duration does not depend on what the handler does: a handler that sends a thousand messages takes as long as one that does nothing.

**Everything inside a step is atomic.** The handler runs to completion. Events a module triggers for another module of the same process (a request going down, an indication going up) are handled in the same step, in the order they were triggered, and take no extra time. Guards (`upon condition`, `upon exists`) are checked after every step, and a guard that fires runs inside that same step.

**Messages sent during a step leave at the end of the step.** Output events are also stamped with the end of the step.

**Resources are unlimited.** There is no limit on memory, message size, queue length or bandwidth, and no cost for large state.

**All processes run the same program.** Behavior can differ only through `self`, the topology, the inputs and randomness.

## Time and clocks

**Time is discrete.** The simulator counts integer microseconds. Two events can happen at the same instant; their order is then fixed by the rules in [How the engine works](engine.md#ordering-events).

**The simulator has a global clock; the algorithm does not.** Global time drives the simulation and appears on the screen. An algorithm can only read its local clock through `now()`.

**Local clocks are linear.** Process *i* reads `offset_i + (1 + drift_i) · t` at global time *t*. The offset and the drift are sampled once per process when the run starts and never change. There is no clock synchronization protocol, no clock jumps and no leap seconds. A drift below -0.5 is clamped to -0.5.

**Timers use local time.** `starttimer(t, 100ms)` fires after 100 ms of the process's own clock, which is `100ms / (1 + drift)` of global time. A timer always lasts at least one microsecond.

## The network

**Channels are point to point.** There is one channel for each ordered pair of processes connected by a link. An undirected link gives two channels, a directed link one.

**There is no routing.** A process can only send to its neighbors. A message to any other process is dropped at once and marked *no link*. The only exception is a process sending to itself, which always works and needs no link. Outside lockstep rounds it arrives with zero delay; in lockstep rounds it arrives in the round's delivery window like any other message.

**Delays are independent.** Each message draws its delay from the distribution of its link, independently of every other message. There is no congestion, no queueing inside the network, no correlation between links and no relation between message size and delay.

**Spikes are added on top.** With probability *spike probability*, a message gets the *spike delay* added to its sampled delay.

**The upper bound truncates.** If an upper bound is set, delays above it are cut to the bound. Before GST the bound does not apply, with one exception described under [partial synchrony](#partial-synchrony).

**FIFO channels delay later messages.** When a channel is FIFO, a message that would overtake an earlier one on the same channel is held back until the earlier one has arrived. This is head-of-line blocking, not a model of TCP: there are no acknowledgements, windows or retransmissions underneath.

**Loss is independent.** Each message is lost with the configured probability, regardless of what happened to the previous one. There are no bursts of loss.

**Duplication creates one copy.** With the configured probability, a message is delivered twice. The copy gets its own delay. A message is never duplicated more than once, and a lost message is never duplicated.

**Messages are never corrupted, forged or reordered by the network** beyond what independent delays produce.

**Per-link settings replace the global ones.** A link can have its own loss and delay distribution. Spikes, duplication, FIFO and the bound are global.

## Synchrony models

The *assumed* model is what the algorithm may rely on. The *actual* model is what the simulator does. They are configured separately on purpose. The playground never forces the actual model to respect the assumed one; it records a *violation* when it does not.

### Asynchronous

The algorithm may not use `DELTA`, `PHI` or `RHO`. No violation is ever recorded, because nothing was promised.

### Timed synchronous

A message whose delay exceeds `DELTA` is a violation.

Two checks apply in every model where the value is known to the algorithm, not only in this one: a step longer than `PHI` is a violation (except in lockstep rounds, where steps take no time), and a process whose drift exceeds `RHO` in absolute value is reported once, at time 0. Nothing else is checked.

### Partial synchrony

This is the variant of the Dwork, Lynch and Stockmeyer model with a Global Stabilization Time:

- Before GST, delays come from the *delay before GST* distribution, if one is set.
- After GST, delays come from the regular distribution and respect the upper bound.
- If an upper bound is set, a message sent before GST still arrives by GST plus the bound. Without an upper bound, messages sent before GST can take as long as their distribution says.
- If `DELTA` is known to the algorithm, only messages sent at or after GST are checked against it. If no GST is set, all messages are checked.

In the textbook model the bound is unknown to the algorithm. Setting `DELTA` to a value in this mode gives a different, stronger model, and the checker will let the code use it.

### Synchronous rounds, lockstep

Lockstep rounds are an idealization and ignore most of the actual model:

- Round *r* starts at `(r - 1) · R`, where *R* is the *round length on screen*. This length only affects the drawing.
- Messages sent in the first 20% of the round are delivered in the same round, at a random point between 25% and 75% of it. Messages sent later are delivered in the next round.
- The delay distribution, spikes, the bound, FIFO and duplication are **not** used. Loss is.
- Steps take no time, and `now()` and timers are not available.
- `RoundEnd` is delivered at 90% of the round.

### Synchronous rounds, emulated

Emulated rounds show what happens when the lockstep abstraction is built on real clocks:

- The round length is `R = DELTA + PHI`, so both must be known.
- Each process opens round *r* when its local clock reads `r · R`, and closes it just before `(r + 1) · R`.
- A message sent in round *r* uses the regular delay (with spikes and the bound). If it arrives before the recipient has opened round *r*, it waits. If it arrives after the recipient has closed round *r*, it is a violation.
- On a violation, *discard* drops the message, *deliver late* delivers it in whatever round the recipient is in, and *stop* ends the run.
- FIFO and duplication are not applied to round messages.
- `Deliver` does not say which round a message belongs to. An algorithm that needs it must put the round number in the message.

## Failures

**Crash.** A crashed process stops at the given instant. Events queued for it are discarded, its timers never fire, and messages that arrive while it is down are lost. A crash takes effect between steps. A step that has already started always completes, so a process can never crash halfway through a broadcast loop. To show a partially completed broadcast, combine a crash with message loss, as the reliable broadcast example does.

**Recovery.** A recovered process keeps the values of variables declared `stable` and resets every other variable to its initial value. Its timers are cleared. Each module then receives `Recovery` if it has a handler for it, and `Init` otherwise, from the bottom of the stack up. Nothing else survives a crash: there is no log and no disk. A recovery for a process that is running is ignored with a warning.

**Link failures may be symmetric or one way.** By default both directions of a channel fail together; a one-way failure drops only the messages from the first process to the second. A message is dropped if its channel is interrupted when it is sent or when it would arrive, so a partition that starts while a message is in flight drops that message. Partitions are always symmetric.

**A pause is not a crash.** A paused process handles no event for the length of the pause, then handles everything that queued up: nothing is lost, no state is reset, and its timers fire when it resumes. The pause has no effect on the messages it already sent.

**Omissions belong to a process, not to the network.** A process with a send omission drops messages as it sends them, before they reach the channel; one with a receive omission throws away messages that arrived. Each draw comes from a stream of that process, so it does not disturb the rest of the run. An omitting process keeps its state and keeps running.

**Processes outside a partition's groups form one extra group.** `3` alone isolates p3 from everybody else.

**Not modeled:** Byzantine behavior, message corruption, and processes that slow down instead of stopping (a pause is all or nothing, and every process draws its step duration from the same distribution).

## The language

**Values are immutable.** Assigning to `m[k]` builds a new map. This keeps snapshots cheap and has no visible effect on programs.

**Iteration order is deterministic.** `forall` visits sets in sorted order, `choose(S)` returns the smallest element, and `upon exists` picks the first match in that order. Real systems do not give these guarantees; an algorithm that works only because of this order may fail elsewhere.

**Guards are fair only in a weak sense.** When several guards of a module are enabled, they run in round-robin order within a step. A guard that stays true forever is an error.

**Randomness is reproducible.** `random` and `pick` draw from a stream seeded per process. The same seed gives the same choices.

**Division between integers truncates.** `5 / 2` is `2`. If either operand is not an integer, the result is exact.

**Durations are plain numbers.** `50ms` is the number 50000. The language does not stop you from adding a duration to a count.

**Inputs run in the main algorithm.** The arguments of an input line are evaluated on the target process, in the context of the main algorithm, with a random stream shared by all inputs.

## The module library

The modules follow algorithms from Cachin, Guerraoui and Rodrigues, *Introduction to Reliable and Secure Distributed Programming*, with these differences:

- **RetransmitLinks** resends each message a fixed number of times (5 by default, every 100 ms) instead of forever. The book's version never stops, which makes every run grow without end. With a lossy network and few retransmissions, a message can be lost for good.
- **EliminateDuplicates** assumes that every message is unique, as the book does. Sending the same payload twice to the same process delivers it once.
- **AckLinks** is not from the book. It numbers messages and retransmits until an acknowledgement arrives. It keeps retransmitting to a crashed process until the end of the run, and it has no flow control or congestion control.
- **Broadcast modules send to every process in `Π`.** On a topology that is not complete, messages to non-neighbors are dropped by the network. Use a complete graph, or gossip.
- **EagerGossip** uses `neighbors`, so it works on any topology. It stops forwarding after `ROUNDS` hops and does not retry.
- **MajorityAckURB** needs a majority of correct processes. With a majority crashed it stops delivering, as it should.
- **WaitingCausalBroadcast** keeps every pending message forever if a dependency never arrives, and never garbage-collects vector clocks.
- **Message identifiers** are per-process sequence numbers. They restart from zero after a recovery unless the module declares them `stable`, which the library modules do not.

## Analysis and visualization

**Violations** are recorded only for the quantities listed under [Synchrony models](#synchrony-models). A violation marks a broken promise; it does not mean the algorithm misbehaved.

**The causal cone** is computed from messages that were delivered. Lost or discarded messages create no causal link. The cone works at the level of processing steps: all events inside a step share its start time, and the analysis does not distinguish which module inside the process was involved. The counts shown refer to processing steps, not to individual local events.

**The stack view** shows events between modules within a short animation window, plus the latest group of events of the process. It is a view of what happened, not a trace of every intermediate state.

**Layer colors** show the module that *started* a chain of requests. A retransmission by the link layer is colored as link-layer traffic even if it carries an application message.

**The animation** draws at most 400 packets in flight. With more than 120 packets, labels are hidden; with more than 200, trails are hidden.

**Playback stops where the action ends.** When a run keeps going because of timers or rounds, playback stops shortly after the last message, output, fault or log entry. The *End* button and the *All* view still reach the real end of the run.

**The log shows the first 3,000 entries** that match the filter.

## Hard limits

| Limit | Value | What happens |
|---|---|---|
| Events in a run | 150,000 | the run stops and the status says so |
| Recorded events between modules | 200,000 | the stack view says the trace was cut |
| Statements in one step | 200,000 | runtime error |
| Internal events in one step | 20,000 | runtime error |
| Iterations of one `while` loop | 100,000 | runtime error |
| Nested function calls | 200 | runtime error |
| `range(a, b)` length | 100,000 | runtime error |
| Processes from a generator | 40 | larger numbers are clamped |
| Packets drawn at once | 400 | the rest is not drawn |

## What the playground is not

**It is not a model checker.** Each run is one execution out of many possible ones. A run can reveal a bug; it cannot prove that there is none. Changing the seed, or choosing *random order* for simultaneous events, explores more executions, but never all of them.

**It is not a network emulator.** Delay and loss distributions are illustrative. They are not calibrated on real networks, and they do not reproduce TCP, congestion or packet sizes.

**It is not a benchmark.** Message counts and run lengths are useful to compare two algorithms on the same scenario, not to predict production performance.
