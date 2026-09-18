# How the engine works

This page explains what happens between pressing **Run** and seeing the animation. You do not need it to use the playground, but it helps when a run behaves in a way you did not expect, and it is the reference for anyone changing `src/core.js`.

For the list of modeling choices, see [Assumptions and simplifications](assumptions.md).

## Contents

- [From code to a run](#from-code-to-a-run)
- [The event queue](#the-event-queue)
- [Ordering events](#ordering-events)
- [Anatomy of a step](#anatomy-of-a-step)
- [Sending a message](#sending-a-message)
- [Rounds](#rounds)
- [Faults](#faults)
- [Randomness and determinism](#randomness-and-determinism)
- [What a run produces](#what-a-run-produces)
- [From a run to the screen](#from-a-run-to-the-screen)

## From code to a run

A run goes through five stages. Each one can stop the run with a message in the status bar.

1. **Configuration.** The scenario is normalized: durations and distributions are parsed, faults are validated, input lines are parsed. A malformed distribution or input line stops here.
2. **Parsing.** The Upon source becomes a syntax tree. A syntax error stops here, with its line and column.
3. **Checking.** The tree is checked against the assumed timing model (see [the language reference](language.md#what-the-checker-verifies)). Any error stops here. Warnings are shown but do not stop the run.
4. **Stack resolution.** Starting from the main algorithm, every `uses` clause is bound to an algorithm or to a provided module. The result is a tree of *instances*. Every process gets its own copy of the tree, with its own state.
5. **Simulation.** Events are taken from a priority queue until the queue is empty, the simulated duration is over, the event limit is reached, a violation stops the run, or a runtime error occurs.

A runtime error does not throw the run away. Everything up to the error is kept, so you can replay the run and see the state that led to it.

## The event queue

The queue holds *external* events, the ones that arrive at a process from outside:

| Event | Created by |
|---|---|
| `init` | the start of the run, one per process at time 0 |
| `input` | a line in the *External inputs* box, or **Inject event** |
| `deliver` | a message sent over `Net` or `Rounds` |
| `timer` | `starttimer` |
| `roundStart`, `roundEnd` | the rounds schedule |
| `crash`, `recover` | a fault |
| `netlog` | the start or end of a link failure or partition (for the log only) |

Events between modules of the same process are *internal*. They never enter the queue; they are handled inside the step that produced them (see [Anatomy of a step](#anatomy-of-a-step)).

## Ordering events

Events are ordered by four keys, in this order:

1. **Time**, in microseconds.
2. **Class.** At the same instant, faults come first, then `init`, then inputs, then round starts, then deliveries and timers, then round ends.
3. **Tie-break.** With *stable order* this key is zero for every event. With *random order* it is a random number drawn when the event is created, from a stream derived from the seed.
4. **Process, then creation order.** Processes in the order they appear in the topology, then first created first.

So, with the default settings, two messages that reach p2 at the same microsecond are handled in the order they were sent. Switching to *random order* lets you explore other interleavings of simultaneous events while keeping the run reproducible.

## Anatomy of a step

When the engine takes an event for process *p* at time *t*:

1. If *p* is crashed, the event is dropped. A message is marked *recipient crashed*.
2. If *p* is still busy with an earlier step, the event is put back in the queue for the moment *p* becomes free. It keeps its place among events with the same key.
3. A step duration *d* is sampled (zero in lockstep rounds). The step runs from *t* to *t + d*. If `PHI` is known and *d* exceeds it, a violation is recorded.
4. The event is dispatched to the right module instance, which runs the first handler whose pattern and `where` clause match. If no handler matches, a warning is logged, once per process, module and event name.
5. The handler may trigger internal events: requests to lower modules and indications to upper modules. These go into a local FIFO queue and are dispatched in order, each to its first matching handler, until the queue is empty.
6. Guards are checked. For each module, the enabled `upon condition` and `upon exists` handlers are tried in round-robin order. When one fires, its internal events are processed as in the previous point, and the guards are checked again. The step ends when no guard is enabled and the local queue is empty.
7. Everything the step produced carries the time *t + d*: messages leave at that time, timers start counting from it, outputs are stamped with it.
8. The state of every module of *p* is recorded if something changed, along with the current round.
9. Global properties are evaluated, if the program declares any (see [Properties](language.md#properties)).

Steps 5 and 6 are bounded: more than 20,000 internal events or guard firings in one step, or more than 200,000 statements, stop the run with an error. Both usually mean a handler that keeps re-enabling itself.

`Init` is special: at time 0 every module of a process receives it, from the deepest module to the main algorithm, within a single step.

## Sending a message

A `Send` to `Net` from process *p* to process *q* at time *s* goes through these checks, in this order:

1. **Unknown recipient or missing link.** The message is dropped immediately (*no link*). Sending to yourself is always allowed.
2. **Random draws.** The loss draw, the delay (from the per-link or global distribution, or from the pre-GST distribution before GST), the spike draw and, when duplication is enabled, the duplication draw are made from the channel's random stream. They are made for every message, whether or not it survives, so that later messages on the channel see the same random numbers whatever happened to this one.
3. **Truncation.** The delay is cut to the upper bound, if any; before GST, the arrival is cut to GST plus the bound, if a bound is set.
4. **Loss.** A lost message is marked *lost by the network* and goes no further. It is never duplicated.
5. **Interrupted channel at send time.** If a link failure or a partition interrupts the channel at *s*, the message is dropped.
6. **Violation.** If `DELTA` is known and applies (see [Assumptions](assumptions.md#synchrony-models)) and the delay exceeds it, a violation is recorded and the policy is applied.
7. **FIFO.** If channels are FIFO, the arrival is moved after the last arrival on the same channel, and the channel remembers this arrival.
8. **Interrupted channel at arrival time.** If the channel is interrupted when the message would arrive, the message is dropped.
9. **Delivery.** Otherwise a `deliver` event is queued at the arrival time.
10. **Duplicate.** If the duplication draw succeeded, a copy with its own delay goes through steps 7 to 9, whatever happened to the original in step 8.

The order matters for the [what-if property](#randomness-and-determinism): a fault that starts at time *t* can only change the fate of messages sent at or after *t* (step 5) or arriving at or after *t* (step 8). Random numbers and FIFO state are consumed exactly as they would be without the fault.

The message is recorded with its sender, recipient, payload, send and arrival times, status, whether it violated the model, whether it is a copy, and the module that originated it.

### Message statuses

| Status | Meaning |
|---|---|
| delivered | handled by the recipient |
| still in transit | the run ended before it arrived |
| lost by the network | lost by the loss draw |
| discarded because late | a violation with the *discard* policy |
| dropped by a link failure or a partition | its channel was interrupted |
| recipient crashed | it arrived while the recipient was down |
| no link | the sender had no link to the recipient |

### The origin of a message

Each internal request carries the module that started its chain. A module that handles a request from above keeps that origin when it sends further requests down. A module that reacts to an indication from below, a timer or an input starts a new chain with itself as origin. The origin of a network message is the origin of the `Send` that created it.

In practice, the application's broadcast, a reliable broadcast relaying a message it received, and a link layer sending an acknowledgement end up with three different origins. **Layers** uses this to color messages.

## Rounds

With the *synchronous rounds* model, the engine schedules `RoundStart` and `RoundEnd` for every process up to the end of the run, and messages go through `Rounds` instead of `Net`.

In **lockstep** mode all processes share the same rounds. A message sent early in a round is delivered in the same round, one sent later in the next one. Delays come from a fixed window inside the round, not from the delay distribution. The exact rules are in [Assumptions](assumptions.md#synchronous-rounds-lockstep).

In **emulated** mode each process computes its own round boundaries from its local clock, so offsets and drift make processes disagree on when a round starts. Messages use the real delay distribution. A message that arrives after the recipient's round has ended is a violation. The exact rules are in [Assumptions](assumptions.md#synchronous-rounds-emulated).

`RoundStart(r)` is delivered to every module that uses `Rounds`, and so is `RoundEnd(r)`. The built-in `round` holds the current round of the process.

## Faults

Crashes and recoveries are queue events with the highest priority at their instant. A crash marks the process as down and opens a *down interval*. A recovery closes it, resets volatile state and timers, and dispatches `Recovery` or `Init` to every module from the bottom up, all within a single step.

Link failures and partitions are not queue events. They are intervals that the engine consults when a message is sent and when it would arrive. Their start and end are logged through `netlog` events so that they appear in the event log at the right time.

See [Faults](faults.md) for how to use them.

## Randomness and determinism

The generator is `xoshiro128**`. Each source of randomness has its own stream, derived from the seed and a name:

| Stream | Used for |
|---|---|
| one per channel | loss, delay, spikes and duplication of messages on that channel |
| one per process, for steps | step durations |
| one per process, for clocks | clock offset and drift |
| one per process, for the program | `random` and `pick` |
| inputs | `random` inside input lines |
| tie-break | the random order of simultaneous events |

Two consequences follow.

**Runs are reproducible.** The same scenario with the same seed gives the same trace, event for event. The test suite checks this on every example.

**The past survives changes to the future.** Adding an input or a fault at time *t* does not change any random number used before *t*, because each stream is consumed only by its own channel or process, in time order. That is why **Inject event**, **Crash here** and the other controls can re-run the simulation and continue from the cursor with an identical history.

The second property has one caveat: it holds for events strictly before the injected one. Events at the very same microsecond may be reordered, because the new event takes part in the tie-break.

## What a run produces

`runSimulation` returns a plain object. The fields the interface uses are:

| Field | Content |
|---|---|
| `msgs` | every message, with the fields described above |
| `log` | log entries: inputs, outputs, faults, drops, violations, warnings, `log` and `assert` statements, errors |
| `outputs` | indications emitted by the main algorithm |
| `activity` | one entry per step except the initial one: process, start, end and event type |
| `snaps` | per process, the state of every module after each step that changed it |
| `localEvents` | events between modules, inputs, deliveries and timeouts, per process |
| `downs` | per process, the intervals during which it was crashed |
| `netFaults` | link failures and partitions, in microseconds |
| `specs` | the module tree: algorithm, interface, alias, parent and depth |
| `rounds` | round length and per-process round starts, when rounds are used |
| `properties` | per declared property: kind, whether it held, and the instant and process of the first violation |
| `violations`, `stopReason`, `error`, `errorLine`, `endT` | summary |

The engine never touches the page, so the same function runs in the browser, in the Node test suite and in the [command line tool](cli.md).

## From a run to the screen

The interface computes the whole run first and then replays it. Moving the cursor never re-runs the simulation; it looks up the trace at the cursor time:

- packets in flight are messages whose send time is before the cursor and whose arrival time is after it;
- a process glows while the cursor is inside one of its steps, and for a short fade afterwards;
- the state inspector shows the last snapshot before the cursor;
- the causal cone is computed once, when you click an event, with the rules in [Assumptions](assumptions.md#analysis-and-visualization).

This is why scrubbing backwards is instant, and why changing the scenario requires pressing **Run** again.
