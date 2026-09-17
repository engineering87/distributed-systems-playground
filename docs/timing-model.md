# The timing model

Most distributed algorithms are correct only under some assumption about time: messages arrive within a bound, clocks drift by at most so much, the network eventually calms down. The *Timing* tab is where you choose that assumption, and, separately, how the simulated system actually behaves.

This page explains both halves, the parameters, the presets, and how to read the result. The precise rules the engine applies are collected in [Assumptions and simplifications](assumptions.md#synchrony-models).

## Contents

- [Two models, on purpose](#two-models-on-purpose)
- [The assumed model](#the-assumed-model)
- [The actual model](#the-actual-model)
- [Distributions](#distributions)
- [Presets](#presets)
- [Rounds](#rounds)
- [Partial synchrony and GST](#partial-synchrony-and-gst)
- [Violations](#violations)
- [Choosing values](#choosing-values)

## Two models, on purpose

The **assumed model** is a promise made to the algorithm. It decides which constants the code may use and whether rounds exist.

The **actual model** is what the simulator does. The algorithm cannot see it.

Keeping them apart lets you ask the question that matters in practice: *what happens to this algorithm when the promise is broken?* A textbook proof covers the case where the two models agree. The playground also shows the other cases, and marks every message that broke the promise.

A small example. FloodSet assumes synchronous rounds. Run it with the **Ideal synchronous** preset and every process decides the same value. Switch to **Realistic synchronous**, keep the seed, and run again: the algorithm still believes in rounds, but rounds are now built on drifting clocks over a network with long delays. Some round-2 messages arrive after the round has closed, get discarded, and one process decides differently. The code did not change. The environment did.

## The assumed model

| Setting | What it means for the algorithm |
|---|---|
| **Synchrony** | *Synchronous rounds*: the algorithm uses `Rounds` and reacts to `RoundStart` and `RoundEnd`. *Timed synchronous*: known bounds hold at all times. *Partially synchronous*: bounds hold after an unknown time. *Asynchronous*: no bounds at all. |
| **DELTA** | The maximum message delay, or `unknown`. If known, the code can read it as `DELTA`. |
| **PHI** | The maximum duration of a processing step, or `unknown`. |
| **RHO** | The maximum clock drift (a plain number such as `0.0001`), or `unknown`. |
| **Round execution** | Only with synchronous rounds: *ideal lockstep* or *emulated on local clocks*. See [Rounds](#rounds). |
| **When reality exceeds the assumption** | *Deliver late*, *Discard* (the message becomes an omission) or *Stop the simulation*. |

`unknown` means "a bound may exist, but the algorithm does not know its value". With *Asynchronous*, the three constants are forced to `unknown`, and code that reads them does not compile.

The checker uses the assumed model:

- `DELTA`, `PHI` or `RHO` in the code require a known value;
- `Rounds` requires synchronous rounds, and `Net` is not available with them;
- `now()` and timers are not available in lockstep rounds.

## The actual model

| Setting | Meaning | Unit |
|---|---|---|
| **Delay** | distribution of message delays | distribution |
| **Upper bound** | delays above it are cut to it; empty for none | duration |
| **FIFO channels** | later messages never overtake earlier ones on the same channel | on/off |
| **Spike probability** | chance that a message gets an extra delay | 0 to 1 |
| **Spike delay** | the extra delay | duration |
| **Loss** | chance that a message is lost | 0 to 1 |
| **Duplication** | chance that a message is delivered twice | 0 to 1 |
| **Step duration** | time a process takes to handle one event | distribution |
| **Clock offset** | initial offset of each local clock | distribution |
| **Clock drift** | rate error of each local clock | distribution of plain numbers |
| **GST** | Global Stabilization Time; empty for none | duration |
| **Delay before GST** | delay distribution used before GST; empty to use *Delay* | distribution |
| **Simultaneous events** | *stable order* or *random order* derived from the seed | choice |

A single link can override **Loss** and **Delay**: select the link on the graph and fill in its fields.

Offsets and drifts are drawn once per process when the run starts. A drift of `0.0001` means the clock gains 100 µs per simulated second.

The histogram under **Delay** samples the distribution, with spikes and the bound, and marks `DELTA` and the bound. The line below it gives the median, the 99th percentile and, when `DELTA` is known, the share of messages that exceed it. Check it before running: if 20% of the messages exceed `DELTA`, a synchronous algorithm will not have a good day.

## Distributions

Durations are written with a unit: `300us`, `40ms`, `2s`. A number without a unit is read as milliseconds.

| Distribution | Parameters | Shape |
|---|---|---|
| `const(d)` | the value | always `d` |
| `uniform(a, b)` | bounds | every value between `a` and `b` equally likely |
| `exp(mean)` | mean | many short values, a moderate tail |
| `normal(mu, sigma)` | mean and standard deviation | bell curve, negative values cut to zero |
| `lognormal(mu, sigma)` | in log-milliseconds | skewed, with a long tail; the median is `exp(mu)` ms |
| `pareto(xm, alpha)` | minimum and shape | heavy tail; smaller `alpha` means rarer but much larger delays |
| `empirical(a, b, c, …)` | observed values | picks one of the values with equal probability |

Some reference points:

- `lognormal(3, 0.6)` has a median of about 20 ms, and roughly 1 message in 15 above 50 ms.
- `lognormal(3.2, 0.8)` has a median of about 25 ms and a noticeably longer tail.
- `pareto(20ms, 1.1)` never goes below 20 ms and has a median around 38 ms, but about 1 message in 80 takes more than a second.

For **Clock drift** the arguments are plain numbers: `uniform(-0.0001, 0.0001)`.

These distributions are there to create realistic *shapes* of behavior. They are not measurements of any real network.

## Presets

A preset sets the assumed model, the actual model and the violation policy together. Changing any value afterwards turns the preset into *Custom*.

| Preset | Assumed | Actual | Policy |
|---|---|---|---|
| **Ideal synchronous** | rounds, `DELTA` 40 ms, `PHI` 10 ms, `RHO` 0.0001 | lockstep rounds, `uniform(5ms, 30ms)`, no drift | discard |
| **Realistic synchronous** | same as above | emulated rounds, `lognormal(3.2, 0.8)`, 3% spikes of 60 ms, steps up to 2 ms, offsets up to 8 ms, drift up to ±0.0005 | discard |
| **Timed synchronous** | `DELTA` 50 ms, `PHI` 5 ms | `uniform(5ms, 45ms)` with a 50 ms bound, steps up to 1 ms, no drift | deliver late |
| **Partially synchronous** | nothing known | `pareto(20ms, 1.1)` before GST at 3 s, then `uniform(5ms, 40ms)` with a 50 ms bound; offsets up to 20 ms, drift ±0.0001 | deliver late |
| **Asynchronous** | nothing known | `lognormal(3, 0.6)`, 5% spikes of 150 ms, steps up to 1 ms | deliver late |

One preset deliberately breaks its own promise: **Realistic synchronous** lets delays exceed the round length and clocks drift more than `RHO` allows, which is the point of it. The other presets keep the actual model within the assumed one.

## Rounds

Synchronous algorithms such as FloodSet are written in rounds: in each round every process sends, receives and computes. The playground offers two ways to run them.

**Ideal lockstep** is the textbook model. All processes share the same rounds, every message sent at the start of a round arrives in that round, and nothing can go wrong with timing. Delays are drawn from a fixed window inside the round rather than from the delay distribution, so only **Loss** has an effect. The *round length on screen* only changes how wide the rounds look.

**Emulated on local clocks** is how rounds are built in a real system. Each process opens round *r* when its own clock reads `r · (DELTA + PHI)`. Because clocks have different offsets and drifts, processes disagree slightly on when a round starts, and a message with a long delay can reach a process that has already moved to the next round. That message is a violation, and the policy decides its fate.

With emulated rounds the useful window for a message is about `DELTA + PHI`, minus the difference between the clocks of sender and receiver. The line under the histogram reminds you of this.

The exact scheduling rules are in [Assumptions](assumptions.md#synchronous-rounds-lockstep).

## Partial synchrony and GST

The partially synchronous model says: the system may behave badly for a while, but from some point on, which nobody knows in advance, bounds hold. That point is GST.

In the playground:

- before GST, delays come from **Delay before GST**, usually a heavy-tailed distribution;
- after GST, they come from **Delay** and respect the **Upper bound**;
- a message sent before GST still arrives by GST plus the bound, when a bound is set.

The last rule matters. Without it, a message sent just before GST with a huge delay would arrive long after GST, and the system would never really stabilize. With it, the model matches the classic definition by Dwork, Lynch and Stockmeyer.

On the space-time diagram GST is an amber vertical line. The ◇P example shows the typical picture: wrong suspicions before the line, a growing timeout, and calm afterwards.

## Violations

A violation is a broken promise, recorded when:

- a message takes longer than a known `DELTA` (with partial synchrony, only for messages sent after GST);
- a step takes longer than a known `PHI`;
- a clock drifts more than a known `RHO` (reported at time 0);
- with emulated rounds, a message arrives after its round has ended at the recipient.

Violations are counted in the summary, drawn in red on the graph and on the diagram, and listed in the event log.

The policy applies to late messages:

| Policy | Effect | Typical use |
|---|---|---|
| Deliver late | the message is delivered anyway | see whether the algorithm tolerates lateness |
| Discard | the message is dropped and counted as an omission | model a synchronous system that treats late messages as missing |
| Stop | the run ends at the first violation | find the first broken promise quickly |

A violation does not mean that the algorithm failed. FloodSet with many violations may still decide correctly if the discarded messages carried nothing new. Check the outputs to know.

## Choosing values

- **Start from a preset** and change one parameter at a time. Comparing runs is much easier that way.
- **Keep the seed** while you compare. The seed fixes all random choices, so two runs with the same seed differ only because of what you changed.
- **Look at the histogram** before running a synchronous algorithm. The share of messages above `DELTA` is a good predictor of trouble.
- **Try several seeds** once you have a hypothesis. The dice button next to the seed picks a new one and runs again.
- **Use loss sparingly** with algorithms that rely on `Net` directly. Most textbook algorithms assume perfect links; use a module from the [library](library.md) to build them on a lossy network.
