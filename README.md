<div align="center">

# Distributed Systems Playground

**Watch distributed algorithms run, message by message, on the network you actually have.**

[![CI](https://github.com/engineering87/distributed-systems-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/engineering87/distributed-systems-playground/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)
[![Live demo](https://img.shields.io/badge/demo-GitHub%20Pages-2350a3.svg)](https://engineering87.github.io/distributed-systems-playground/)

[Live demo](https://engineering87.github.io/distributed-systems-playground/) · [Specification](docs/SPEC.md) · [Examples](#examples)

<img src="docs/demo.gif" alt="A flooding broadcast on a 3×4 grid: labeled packets travel along the links while the space-time diagram below fills in" width="100%">

</div>

Most textbook algorithms are stated for a model the network will never honor: lockstep rounds, bounded delays, clocks that agree. Distributed Systems Playground lets you write an algorithm in the pseudocode you already know from the book, pick the model it *assumes*, then run it on a network whose behavior you set separately. The two models are kept apart on purpose, so you can see exactly where the algorithm stops being correct.

It runs entirely in the browser: one HTML file, no server, no install.

## What you can do with it

**Draw the system.** Place processes and links on a canvas, or generate a ring, grid, star, tree, complete or random graph. Links can be directed, disabled, or given their own loss rate and delay distribution.

**Write the algorithm as in the book.** Algorithms are written in *Upon*, an executable version of the event-driven notation of Cachin, Guerraoui and Rodrigues. The checker knows the timing model: referring to `DELTA` in an asynchronous system is a compile error, not a runtime surprise.

**Separate belief from reality.** The *assumed* model sets what the algorithm may rely on (rounds, `DELTA`, `PHI`, `RHO`, GST). The *actual* model sets what the network does: delay distributions with heavy tails and spikes, loss, duplication, FIFO or not, step times, clock offset and drift, and a stabilization time. When reality breaks the assumption, the message turns red and a policy decides what happens next: deliver late, discard, or stop.

**Watch it happen.** Messages move along the links as labeled packets. Processes glow while they handle an event, a clock icon marks a timeout, outputs appear as speech bubbles, and a cross marks the spot where a message was lost. A space-time diagram below the graph follows the same cursor.

**Rewrite the past.** Pause anywhere, pick a process and crash it or inject an event at that instant. The run is recomputed from that point and playback resumes. Everything before the cursor stays identical, because the engine is deterministic.

**Inspect anything.** Click a packet for its payload and timings. Select a process to see its local clock, current round and every state variable at the cursor, with the last changes highlighted.

## A quick look at Upon

```
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
end
```

Handlers match events by pattern and can carry a `where` guard. Indications travel up the stack and requests travel down; the checker enforces both directions and the number of arguments. The simulator provides two modules, `Net` and `Rounds`. Anything above them, from perfect links to consensus, is written in Upon and wired together by the interface it implements.

Every Unicode symbol has an ASCII spelling (`<` `>` for `⟨` `⟩`, `union`, `notin`, `!=`, `Procs` for `Π`), so a plain keyboard is enough. The full grammar is in the [specification](docs/SPEC.md#52-grammar-ebnf).

## Examples

| Example | Assumed model | Worth trying |
|---|---|---|
| Flooding broadcast | asynchronous | Raise the loss rate on a few links and see which processes never deliver. |
| Chang-Roberts leader election | asynchronous | Give one link a slow delay distribution and follow the election token around it. |
| FloodSet consensus | synchronous rounds | Switch to *Realistic synchronous* with seed 3: one process decides a different value. |
| Eventually perfect failure detector | partially synchronous | Watch the wrong suspicions before GST, then the timeout growing until they stop. |

## Timing presets

| Preset | The algorithm believes | The network does |
|---|---|---|
| Ideal synchronous | lockstep rounds | exactly that |
| Realistic synchronous | lockstep rounds | long-tailed delays, spikes, drifting clocks |
| Timed synchronous | delays never exceed `DELTA` | respects `DELTA`, clocks do not drift |
| Partially synchronous | a bound exists after GST, value unknown | heavy tails before GST, bounded after |
| Asynchronous | nothing | unbounded delays |

Presets are starting points. Every parameter stays editable, and a histogram shows the delay distribution next to `DELTA` together with the share of messages that will exceed it.

## Getting started

Open the [live demo](https://engineering87.github.io/distributed-systems-playground/), or clone the repository and open `index.html` in a recent browser. A scenario loads and starts playing right away.

| Key | Action |
|---|---|
| `Ctrl` / `Cmd` + `Enter` | Run |
| `Space` | Play or pause |
| `←` `→` | Previous or next event |
| `Home` `End` | Start or end of the run |
| `V` `N` `L` `D` | Select, add node, add link, delete |
| `Ctrl` + wheel on the diagram | Zoom |

Scenarios are saved in the browser as you work. **Export** produces a JSON file, or a link that carries the whole scenario compressed in its fragment, so a colleague or a student can open exactly the run you are looking at.

<img src="docs/screenshot.png" alt="The simulator after a flooding run: topology on the left, code editor on the right, space-time diagram and event log at the bottom" width="100%">

## How it works

The engine is a discrete-event simulator with integer virtual time in microseconds. Randomness comes from `xoshiro128**`, with an independent stream for every link, process and clock, so changing one link leaves the rest of the run untouched. The same scenario and seed always produce the same trace; CI checks this on every example.

A run is computed in full, then replayed. Playback, stepping and the state inspector read from the recorded trace, which is why moving backwards costs nothing.

Parser, checker, interpreter and engine live in `src/core.js` with no DOM dependency, so the same code runs in the browser and under Node for the tests.

```
src/
  core.js          lexer, parser, static checks, interpreter, engine
  examples.js      example scenarios and timing presets
  ui.js            interface and animation
  style.css        light and dark themes
  template.html    page structure
scripts/build.mjs  bundles src/ into index.html
test/              engine and language tests (node:test)
docs/SPEC.md       specification and implementation status
```

## Development

Requires Node.js 18 or later. There are no dependencies to install.

```sh
npm test         # run the test suite
npm run build    # rebuild index.html from src/
npm run check    # fail if index.html is out of date (used in CI)
```

`index.html` is a build output, but it is committed so that GitHub Pages can serve the repository root directly. Rebuild it before committing changes to `src/`.

## Roadmap

- Crash-recovery with `stable` variables, and scheduled network partitions
- Global invariants such as agreement and validity, checked at every step
- Failure detector oracles (P, ◇P, Ω) as built-in modules
- Two runs side by side
- Byzantine processes

Details and the current differences from the specification are in [docs/SPEC.md](docs/SPEC.md#appendix-b--implementation-status-v02).

## Contributing

Issues and pull requests are welcome. New example algorithms are especially useful: add the scenario to `src/examples.js`, a test to `test/core.test.cjs`, and run `npm test && npm run build`.

## References

- C. Cachin, R. Guerraoui, L. Rodrigues. *Introduction to Reliable and Secure Distributed Programming*, 2nd ed. Springer, 2011.
- L. Lamport. Time, Clocks, and the Ordering of Events in a Distributed System. *Communications of the ACM* 21(7), 1978.
- C. Dwork, N. Lynch, L. Stockmeyer. Consensus in the Presence of Partial Synchrony. *Journal of the ACM* 35(2), 1988.
- T. D. Chandra, S. Toueg. Unreliable Failure Detectors for Reliable Distributed Systems. *Journal of the ACM* 43(2), 1996.
- E. Chang, R. Roberts. An Improved Algorithm for Decentralized Extrema-Finding in Circular Configurations of Processes. *Communications of the ACM* 22(5), 1979.
- N. Lynch. *Distributed Algorithms*. Morgan Kaufmann, 1996.

## License

[MIT](LICENSE) © Francesco Del Re
