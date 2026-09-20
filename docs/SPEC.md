# SPEC — Distributed Systems Playground

Version: 0.5 (draft) · Status: proposal, partially implemented (see Appendix B)

## 1. Purpose

A fully client-side web app, deployable on GitHub Pages, to:

1. draw a topology of processes and channels interactively;
2. write distributed algorithms in executable pseudocode in the *upon event / trigger* style of Cachin, Guerraoui and Rodrigues;
3. run them in a deterministic, reproducible discrete-event simulation, and watch the run as an animation in which messages visibly travel between processes;
4. compare the **timing model the algorithm assumes** with the **timing model the network actually follows**, and show the consequences of the gap.

Primary audience: teaching (students and instructors). Secondary goal: experimenting with protocols under realistic conditions.

### 1.1 Non-goals (v1)

- Running on a real network or across machines.
- Exhaustive formal verification (model checking): v1 checks invariants on individual runs.
- Byzantine faults (on the roadmap).

---

## 2. Core principle: assumed model vs actual model

Teaching often starts from the synchronous model, but a real network never is synchronous. The simulator makes the distinction explicit with **two separate configurations**:

| Configuration | Visible to | Defines |
|---|---|---|
| **Assumed model** (`assumed`) | the algorithm (DSL) | the guarantees the algorithm may rely on: rounds, `DELTA`, `PHI`, GST |
| **Actual model** (`actual`) | the simulator only | how channels, processes and clocks really behave |

The assumed model determines **which constructs are legal** in the code (static checks, §5.6). The actual model determines **what happens** during the run.

When the two coincide, the run is the textbook one. When they differ, every **violation** of the assumption (a message beyond `DELTA`, a step beyond `PHI`, clock drift beyond `RHO`) is:

- recorded as a `TimingViolation` event in the log;
- highlighted on the topology animation and on the space-time diagram;
- handled according to a configurable policy (§3.5).

The key teaching point: in a system that believes it is synchronous, a timing violation turns into an **omission** (or performance) **failure** that the algorithm did not plan for.

---

## 3. Parametric timing model

Synchrony models are not rigid modes but **points in a parameter space**. The classical models are presets.

### 3.1 Virtual time

- Global time is an integer number of **microseconds** (a JavaScript `number`, safe up to 2^53 µs ≈ 285 years). No floats in the engine's event ordering.
- Duration literals in the DSL and in scenarios accept `us`, `ms`, `s` (e.g. `150ms`).

### 3.2 Actual model parameters (`actual`)

**Channels** (global default, overridable per link):

| Parameter | Type | Meaning |
|---|---|---|
| `delay` | distribution (§3.4) | transmission delay |
| `bound` | duration \| `none` | upper truncation of the delay; `none` = unbounded |
| `loss` | [0,1] | loss probability |
| `dup` | [0,1] | duplication probability |
| `fifo` | bool | if `true`, no overtaking on the same link |
| `spikeProb`, `spikeExtra` | probability, duration | occasional delay spikes added to `delay` |

**Processes** (global default, overridable per node in later versions):

| Parameter | Type | Meaning |
|---|---|---|
| `step` | distribution | time taken to execute one handler step |
| `pauses` | `{prob, duration}` | arbitrary pauses such as stop-the-world GC (roadmap) |

**Local clocks** (per node): `C_i(t) = offset_i + (1 + rho_i) · t`

| Parameter | Type | Meaning |
|---|---|---|
| `offset` | distribution | initial offset |
| `rho` | distribution | drift, sampled once per node |

Timers (`starttimer`) are expressed in **local time**: with non-zero drift, a timeout of `DELTA` is not exactly `DELTA` of global time.

**Stabilization** (partial synchrony, DLS model):

| Parameter | Type | Meaning |
|---|---|---|
| `gst` | duration \| `none` | Global Stabilization Time |
| `preGstDelay` | distribution | delay before GST (e.g. heavy-tailed) |

After GST the regular `delay` and `bound` apply. Messages sent before GST still arrive by `GST + bound`.

### 3.3 Assumed model parameters (`assumed`)

| Parameter | Values | Effect in the DSL |
|---|---|---|
| `timing` | `synchronous-rounds` \| `synchronous-timed` \| `partial` \| `asynchronous` | enables or disables constructs |
| `DELTA` | duration \| `unknown` | exposes the constant `DELTA` if known |
| `PHI` | duration \| `unknown` | exposes the constant `PHI` if known |
| `RHO` | number \| `unknown` | exposes the constant `RHO` if known |
| `failures` | `none` \| `crash` \| `crash-recovery` \| `omission` | informative; used for invariants and warnings (roadmap) |

### 3.4 Distributions

`const(d)` · `uniform(a, b)` · `exp(mean)` · `normal(mu, sigma)` (truncated at 0) · `lognormal(mu, sigma)` (in log ms) · `pareto(xm, alpha)` · `empirical(d1, d2, ...)`

Unitless arguments are milliseconds, except shape parameters. Every sample comes from a **dedicated PRNG substream** derived from `(seed, source)`, where the source is a link, a node or a clock. Changing one link does not alter the randomness of the others, so runs stay comparable.

### 3.5 Violation policies

Applied when `actual` exceeds `assumed`:

| Policy | Behavior |
|---|---|
| `deliver-late` | the message is delivered anyway, late (default for timed models) |
| `drop` | the late message is discarded and recorded as an omission |
| `next-round` | rounds only: deliver in the next round (with emulated rounds, `deliver-late` already has this effect) |
| `halt` | the run stops at the first violation (useful in class) |

### 3.6 Presets

| Preset | `assumed.timing` | `actual` | Use |
|---|---|---|---|
| **Ideal synchronous** | `synchronous-rounds` | perfect lockstep, no violation possible | explain the algorithm |
| **Realistic synchronous** | `synchronous-rounds` | rounds emulated on local clocks; `lognormal` delays with spikes; `rho` ≠ 0 | show what breaks |
| **Timed synchronous** | `synchronous-timed` | `bound` = `DELTA`, `rho` = 0 | algorithms with exact timeouts |
| **Partially synchronous** | `partial` (`DELTA` unknown) | `gst` = 3s, heavy-tailed before, bounded after | ◇P, Paxos, Raft |
| **Asynchronous** | `asynchronous` | `bound: none` | FLP, reliable broadcast |

In the UI a preset is only a starting point: every parameter stays editable, and any edit turns the preset into "Custom".

### 3.7 Round execution

- **Lockstep (ideal):** round `r` consists of `RoundStart(r)`, sending, delivery of every message of round `r`, then `RoundEnd(r)`. It is atomic with respect to virtual time.
- **Emulated (realistic):** each node opens round `r` when its local clock reaches `r · R`, with `R = DELTA + PHI`. A round-`r` message that arrives after the recipient's local end of round `r` is a violation (§3.5).

---

## 4. Simulation engine

- Discrete-event simulation with a priority queue.
- Ordering key: `(time, class, node, sequence)`.
- Configurable tie-break:
  - `stable`: deterministic by id;
  - `shuffle(seed)`: explores different interleavings of simultaneous events.
- Handlers are **atomic**: no other event of the same node runs while a handler executes. A node busy with a step defers its next events until the step ends.
- Guards (`upon condition`) are re-evaluated after every step of the node, with weak round-robin fairness among enabled guards.
- **Reproducibility:** same scenario and same seed produce the same trace, byte for byte. Verified in CI.
- **What-if:** adding an input or a fault at time `t` does not change the trace before `t`, so the UI can inject events at the playback cursor and re-run from there.
- The engine records, besides messages and log entries, an **activity trace** (`t`, `end`, node, event type) that the UI uses to animate processing.

### 4.1 Faults

| Type | Fields | Semantics |
|---|---|---|
| `crash` | `node`, `at` | the node stops; deliveries to it are recorded as `lost-crash`; pending timers are discarded |
| `recover` | `node`, `at` | the node restarts: non-`stable` state variables are re-initialized, timers are cleared, and each instance receives `Recovery` if it handles it, `Init` otherwise, bottom-up; ignored with a warning if the node is running |
| `link` | `a`, `b`, `from`, `to` | the channel between `a` and `b` is down in both directions during `[from, to)`; `to` empty means forever |
| `partition` | `groups`, `from`, `to` | during `[from, to)` messages between different groups are dropped; nodes not listed form one more group |

- A message is dropped (`dropped-cut`) if its channel is interrupted at send time or at arrival time. Random samples for the message are drawn before the check, so a fault never changes the random streams.
- Each fault start and end is logged with kind `fault`.
- Links can also be disabled for the whole run from the topology.
- **Interactive injection** during playback: crash, recover or isolate a node, cut a link, or inject an event at the cursor time. The cursor is rounded up to a whole microsecond, so that the fault is in effect at the cursor after the re-run.
- The result exposes `downs` (per node, a list of `{from, to}` intervals) and `netFaults` (links and partitions in microseconds) for the UI.
- Roadmap: node pauses, send and receive omissions, one-way link failures.

---

## 5. Language (DSL)

### 5.1 Lexical structure

Every Unicode symbol has an ASCII equivalent:

| Unicode | ASCII | | Unicode | ASCII |
|---|---|---|---|---|
| `⟨` `⟩` | `<` `>` | | `∈` `∉` | `in` `notin` |
| `∪` `∩` `\` | `union` `inter` `minus` | | `∅` | `{}` |
| `≠` `≤` `≥` | `!=` `<=` `>=` | | `∧` `∨` `¬` | `and` `or` `not` |
| `Π` | `Procs` | | `⊆` | `subseteq` |
| `←` / `:=` | `:=` | | `∀` | `forall` |

- Comments: `// ...` and `/* ... */`.
- Undeclared all-uppercase identifiers of at least two characters are **atoms** (symbolic constants), e.g. `HEARTBEAT`.
- `_` is the wildcard in patterns.

### 5.2 Grammar (EBNF)

```ebnf
program        = { interface | algorithm } ;

(* ---------- Interfaces ---------- *)
interface      = "interface" IDENT { iface_event } "end" ;
iface_event    = ( "request" | "indication" ) IDENT [ "(" [ ident_list ] ")" ] ;

(* ---------- Algorithms ---------- *)
algorithm      = "algorithm" IDENT
                 "implements" IDENT "as" IDENT
                 { "uses" IDENT "as" IDENT [ "via" IDENT ] }
                 [ params ] [ state ]
                 { handler | function }
                 "end" ;

function       = "function" IDENT "(" [ ident_list ] ")" block "end" ;

params         = "params" { IDENT ":=" expr [ ";" ] } ;
state          = "state" { [ "stable" ] IDENT ":=" expr [ ";" ] } ;

handler        = "upon" trigger_cond "do" block "end" ;
trigger_cond   = "event" event_pat [ "where" expr ]
               | "condition" expr
               | "exists" IDENT "in" expr "where" expr ;

event_pat      = LANGLE IDENT "," IDENT [ "|" pattern { "," pattern } ] RANGLE ;
pattern        = "_" | IDENT | literal
               | "[" [ pattern { "," pattern } ] "]" ;

(* ---------- Statements ---------- *)
block          = { stmt [ ";" ] } ;
property       = "property" IDENT ( "always" | "eventually" ) expr "end" ;

stmt           = assign | trigger | if | forall | while
               | timer | assert | log | "skip"
               | "call" IDENT "(" [ expr_list ] ")"
               | "return" [ expr ] ;                        (* only inside functions *)
assign         = IDENT { "[" expr "]" } ":=" expr ;
trigger        = "trigger" LANGLE IDENT "," IDENT [ "|" expr { "," expr } ] RANGLE ;
if             = "if" expr "then" block
                 { "elif" expr "then" block }
                 [ "else" block ] "end" ;
forall         = "forall" IDENT "in" expr [ "where" expr ] "do" block "end" ;
while          = "while" expr "do" block "end" ;
timer          = "starttimer" "(" IDENT "," expr ")"
               | "canceltimer" "(" IDENT ")" ;
assert         = "assert" expr [ "," expr ] ;
log            = "log" expr { "," expr } ;

(* ---------- Expressions (increasing precedence) ---------- *)
expr           = or_expr ;
or_expr        = and_expr { "or" and_expr } ;
and_expr       = not_expr { "and" not_expr } ;
not_expr       = "not" not_expr | cmp_expr ;
cmp_expr       = set_expr [ cmp_op set_expr ] ;          (* no chaining *)
cmp_op         = "=" | "!=" | "<" | "<=" | ">" | ">="
               | "in" | "notin" | "subseteq" ;
set_expr       = add_expr { ( "union" | "inter" | "minus" ) add_expr } ;
add_expr       = mul_expr { ( "+" | "-" ) mul_expr } ;
mul_expr       = unary { ( "*" | "/" | "%" ) unary } ;
unary          = ( "-" | "#" ) unary | postfix ;          (* # = cardinality *)
postfix        = primary { "[" expr "]" | "(" [ expr_list ] ")" } ;
primary        = literal | IDENT | "(" expr ")"
               | "{" [ expr_list ] "}"                     (* set *)
               | "{" IDENT "in" expr "where" expr "}"      (* comprehension *)
               | "[" [ expr_list ] "]" ;                   (* tuple / message *)

literal        = NUMBER | DURATION | STRING | "true" | "false" | "nil" ;
expr_list      = expr { "," expr } ;
ident_list     = IDENT { "," IDENT } ;

(* ---------- Terminals ---------- *)
DURATION       = NUMBER ( "us" | "ms" | "s" ) ;
LANGLE         = "<" | "⟨" ;
RANGLE         = ">" | "⟩" ;
```

Implementation note: inside a `trigger`, the ASCII `>` closes the event, so comparisons in `trigger` arguments must be wrapped in parentheses. With `⟨ ⟩` there is no ambiguity. Error messages mention this.

### 5.3 Semantics

- **State:** each algorithm instance has local state per node. `stable` variables survive recovery; the others are reinitialized from their declaration.
- **Instances and composition:** `implements X as a` names the instance the algorithm exposes to upper layers; `uses Y as b` binds a lower-layer instance. v0.x binds automatically (§6).
- **Events:**
  - `trigger ⟨b, Req | ...⟩` sends a *request* downwards;
  - `trigger ⟨a, Ind | ...⟩` emits an *indication* upwards;
  - the checker verifies direction and arity against the interface.
- **Init and Recovery:** each instance receives `⟨a, Init⟩` at start-up, bottom-up. After a recovery it receives `⟨a, Recovery⟩` if it has a handler for it, and `⟨a, Init⟩` otherwise.
- **Pattern matching:**
  - new identifiers bind;
  - already bound identifiers and atoms must be equal;
  - in `⟨timer, Timeout | t⟩`, `t` is the timer name and matches literally;
  - an event with no matching handler is logged once as a warning.
- **Values:** integers, booleans, strings, atoms, durations, sets, tuples (0-indexed) and maps (`map()`, `m[k]`). All immutable; assignment rebuilds the value, which keeps snapshots cheap.
- **Deterministic choice:** `choose(S)` returns the minimum of `S` in a total order defined over all values.
- **Functions:** declared inside an algorithm, they see its state and parameters, have their own local variables, may assign state, trigger events and start timers, and may recurse (up to 200 nested calls). A function used in an expression returns the value of `return`, or `nil`.
- **Binding:** `uses X as a via Y` binds `a` to algorithm `Y`, which must implement `X`. Without `via`, the first algorithm implementing `X` is used, with a warning when there are several.
- **Origin of messages:** every request carries the module that started its chain. A module handling a request from above keeps that origin; a module reacting to an indication, a timer or an input starts a new chain. Network messages record their origin, which the UI uses to color them by layer.

### 5.4 Built-ins

| Name | Availability | Meaning |
|---|---|---|
| `self` | always | node id |
| `Π` / `Procs` | always | set of processes |
| `neighbors` | always | out-neighbors in the topology |
| `N` | always | number of processes |
| `now()` | timed models | **local** clock |
| `DELTA`, `PHI`, `RHO` | if known in `assumed` | synchrony constants |
| `round` | `synchronous-rounds` | current round |
| `random(a, b)` | always | from the node's PRNG substream |
| `min`, `max`, `choose`, `size`, `keys`, `values`, `map`, `append`, `toset`, `str`, `abs` | always | pure functions |
| `head`, `last`, `tail`, `sort`, `reverse`, `slice`, `range`, `get`, `remove`, `sum`, `mean`, `argmin`, `argmax`, `sqrt`, `ln`, `exp`, `pow`, `floor`, `ceil`, `round` | always | pure functions on sequences, collections and numbers |
| `pick(S)` | always | random element from the node's PRNG substream |

### 5.5 Modules provided by the simulator

- `Net`: raw channel with `Send(q, m)` / `Deliver(p, m)`, whose properties come from `actual`. It behaves as a *fair-loss link* when `loss > 0`.
- `timer`: implicit instance with the indication `Timeout(id)`.
- `Rounds` (only with `synchronous-rounds`): `RoundStart(r)`, `RoundEnd(r)`, `Send(q, m)`, `Deliver(p, m)`.

Every higher abstraction (stubborn link, perfect link, broadcast, failure detector, consensus) is **written in the DSL**. Its source code is part of the teaching material.

### 5.7 Batch runner, workers and command line

`src/runner.js` runs a scenario several times without the page: it clones the scenario, applies optional field overrides and a timing preset, runs one simulation per seed and returns a compact summary of each (counts of messages by status, violations, failed assertions, outputs with their times, stop reason, error) plus an aggregate and, on request, the runs grouped by the outputs they produced. `bin/dsp.mjs` is a dependency-free command line front end for it, with exit codes suitable for continuous integration. The page uses the same module inside Web Workers, whose source (engine, library, examples and runner) is inlined in the bundle as a plain text script and turned into a blob URL at run time; where workers are refused, batches run on the page one seed at a time. Both are described in [Running scenarios outside the browser](cli.md).

### 5.8 Module library

`src/library.js` holds modules written in Upon, each with the interface it implements, the interfaces it uses, a summary and its guarantees: `RetransmitLinks` (stubborn links, bounded retransmissions), `EliminateDuplicates` and `AckLinks` (perfect links), `SequencedFifoLinks` (FIFO perfect links), `BasicBroadcast`, `EagerReliableBroadcast`, `MajorityAckURB`, `BroadcastWithSequenceNumber` (FIFO reliable broadcast), `WaitingCausalBroadcast` (vector clocks) and `EagerGossip`. Adding a module inserts the missing interfaces and, for every used interface that the program does not implement yet, a default module that does.

### 5.6 Static checks

- Using `DELTA`, `PHI` or `RHO` while `unknown` in `assumed`: error with an explanation (e.g. "`DELTA` is not available: its value is unknown in the assumed model (asynchronous system)").
- Using `Rounds` outside `synchronous-rounds`, or `Net` inside it; `now()` and timers in lockstep mode: error.
- Triggering an event not declared in the interface, or in the wrong direction: error.
- Undeclared variables, wrong arity: error.
- Indications of lower layers without a handler; timers never started: warning.

---

## 6. Scenario (JSON format)

A scenario is self-contained and can be shared as a file or as a URL (deflate-compressed, base64url).

```json
{
  "version": 1,
  "seed": 5,
  "nodes": [{ "id": 1, "x": 330, "y": 80 }, { "id": 2, "x": 480, "y": 230 }],
  "links": [{ "a": 1, "b": 2, "directed": false, "enabled": true, "loss": "", "delay": "" }],
  "code": "interface … algorithm … end",
  "top": "IncreasingTimeout",
  "inputs": "0ms * Start",
  "faults": [
    { "type": "crash", "node": 2, "at": "6s" },
    { "type": "recover", "node": 2, "at": "8s" },
    { "type": "link", "a": 1, "b": 2, "from": "1s", "to": "2s" },
    { "type": "partition", "groups": "1 2 | 3", "from": "3s", "to": "" }
  ],
  "preset": "partial",
  "assumed": { "timing": "partial", "DELTA": "unknown", "PHI": "unknown", "RHO": "unknown" },
  "actual": {
    "delay": "uniform(5ms, 40ms)", "bound": "50ms", "loss": 0, "dup": 0, "fifo": true,
    "spikeProb": 0, "spikeExtra": "0ms", "step": "uniform(100us, 1ms)",
    "offset": "uniform(0ms, 20ms)", "rho": "uniform(-0.0001, 0.0001)",
    "gst": "3s", "preGstDelay": "pareto(20ms, 1.1)", "roundMode": "lockstep", "roundLen": "1s"
  },
  "violationPolicy": "deliver-late",
  "tieBreak": "stable",
  "haltOnAssert": false,
  "stopAt": "12s"
}
```

- `inputs` holds external events, one per line: `TIME NODE Event | arguments`, where `NODE` is a number or `*` and the arguments are DSL expressions.
- `faults` follows §4.1; `groups` may also be an array of arrays of node ids.
- `top` is the main algorithm; its interface requests are the events accepted as inputs. For each `uses X`, the first algorithm implementing `X` is instantiated.
- An explicit `stack` of instances and global `invariants` are planned (Appendix B).

---

## 7. User interface

1. **Topology editor:** add and remove processes and links, drag, generators (ring, grid, complete, star, line, binary tree, random), a properties bar per node and per link.
2. **Code editor:** syntax highlighting, inline diagnostics, a symbol palette, a quick reference.
3. **Timing panel:** presets, `assumed` and `actual` parameters, a delay histogram with `bound` and `DELTA` markers and the share of messages exceeding `DELTA`.
4. **Animated execution on the topology:**
   - messages travel along links as labeled packets (the first atom of the payload, e.g. `FLOOD`) with a trail; red for violations, amber for messages the network will lose, gray for messages to a crashed process;
   - arrival ripples on the recipient, ✕ marks where a message is lost or discarded;
   - processing glow while a node executes a step, a timer icon when a timeout fires, a round badge;
   - an output bubble when a process emits an indication, a flash when it crashes or recovers;
   - links interrupted by a failure or a partition drawn as dashed red lines with a ✂ mark;
   - clicking a packet pauses and shows its details, with shortcuts to its send and arrival times.
5. **Playback:** play, pause, previous and next event, time scrubber; speeds from 2 ms to 5 s of simulated time per second, "auto" (the interesting part of the run in about 25 s), and **event by event** (each step animated at a constant pace regardless of the time scale). Optional autoplay after each run.
6. **Interaction during playback:** with a process selected, inject an event (a request of the main algorithm), a crash, a recovery or an isolation at the cursor time; with a link selected, take it down for a given duration. The simulation re-runs and continues from that point.
7. **Faults list** in the Scenario tab, with a form for every fault type.
8. **Stack view:** the module tree of a process with the application on top and the network at the bottom; the latest requests (down) and indications (up) between modules at the cursor, event counts per module, and a list of recent local events.
9. **Layer colors:** messages and packets colored by the module that originated them, with a legend.
10. **Causality mode:** clicking an event computes its causal past and future (the happened-before relation over delivered messages); the diagram shades both, fades unrelated messages and reports how many events precede, follow or are concurrent with it; the graph marks the processes the event has reached at the cursor.
11. **Space-time diagram** synchronized with the cursor: processing bars, messages, violations, outputs, round lines, GST, down intervals with crash and recovery markers, shaded partitions and link failures; pan, zoom, "Action" and "All" views; hovering shows message details, clicking selects the message.
12. **State inspector:** local clock, round and every variable of every instance at the cursor, with changes highlighted.
13. **Event log:** filterable; clicking an entry moves the cursor.
14. **Comparison** of two runs side by side (roadmap).

---

## 8. Architecture and repository

Target architecture (see Appendix B for what v0.x does instead):

- TypeScript, Vite, React.
- Parser: Lezer, sharing the grammar with CodeMirror 6 highlighting.
- Graph: React Flow for editing, a dedicated canvas for animation beyond a few hundred nodes.
- Engine in a Web Worker; PRNG `xoshiro128**` with substreams derived via `splitmix32`.
- Deployment on GitHub Pages.

The parser and the engine have no DOM dependencies and also run under Node, which the CI uses for automated tests.

---

## 9. Acceptance criteria (MVP)

- Same scenario and seed produce identical traces, verified in CI on every example.
- With the "Ideal synchronous" preset no `TimingViolation` ever occurs.
- With "Realistic synchronous" and FloodSet, some seeds produce disagreement, and the trace that causes it can be replayed.
- The static checker rejects `DELTA` in the asynchronous model.
- Injecting an event or a fault at time `t` leaves the trace before `t` unchanged.
- Under a partition, each side of the ◇P example suspects the other side, and the suspicions are withdrawn after the partition heals and after a crashed process recovers.
- Examples include at least: flooding, Chang-Roberts, FloodSet, IncreasingTimeout (◇P).

## 10. Roadmap

| Version | Content |
|---|---|
| **v0.1** | DSL, `Net`/`timer`/`Rounds`, crashes, presets, space-time diagram, time travel |
| **v0.2** | English UI, animated execution on the topology, event-by-event playback, interactive injection |
| **v0.3** | crash-recovery with `stable`, link failures and partitions over time, fault injection at the cursor |
| **v0.4** | responsive layouts and touch support, faster rendering of large runs, robustness fixes |
| **v0.5** | functions and `via` in Upon, more built-ins, module library for links and broadcast, stack view, layer colors, causality mode, full user documentation |
| **v0.6** | visual identity, settings (theme, palette, language), presentation mode, documentation site, batch runner and command line tool |
| **v0.7** | batch runner and command line tool |
| **v0.8** | global invariants checked across processes, reported in the interface and by the batch runner |
| **v0.9** | one-way link failures, process pauses and omission faults |
| **v0.10** | batch runs over many seeds in workers, browser suites in the repository, interface split by area |
| **v1.0** | test suites over generated fault schedules, counterexample minimization |
| **v1.1** | failure detectors (P, ◇P ping-pong, Ω, φ-accrual, SWIM) with suspicion matrix and quality metrics |
| **v1.2** | algorithm catalog (clocks, snapshots, elections, mutual exclusion, consensus, replication, 2PC) with the properties they must satisfy |
| **v1.1** | global invariants, node pauses and omissions, one-way link failures, side-by-side comparison |
| **v1.2** | failure detector oracles (P, ◇P, Ω) as provided modules, to study consensus on top of the abstraction |
| **v2** | Byzantine faults (adversarial nodes written in the DSL), systematic exploration of interleavings, trace export |

---

## Appendix A — Examples

### A.1 FloodSet (synchronous rounds, complete graph)

```
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
```

### A.2 Eventually perfect failure detector with increasing timeout (partial synchrony)

```
interface EventuallyPerfectFailureDetector
  indication Suspect(p)
  indication Restore(p)
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
        suspected := suspected \ {p}
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
```

`IncreasingTimeout` does not use `DELTA`, so it compiles with `DELTA: unknown`, which is exactly the point of the algorithm under partial synchrony.

---

## Appendix B — Implementation status (v0.5)

### Implemented

- The full DSL of §5.2, including `condition` and `exists` guards, comprehensions, maps and the ASCII syntax.
- The static checks of §5.6.
- The parametric timing model of §3 with its five presets, violation policies (`next-round` is covered by `deliver-late` with emulated rounds), lockstep and emulated rounds, GST with the DLS constraint.
- Deterministic engine with activity trace; crashes and recoveries; link failures and partitions over time; disabled links; per-link loss and delay.
- The whole UI of §7 except side-by-side comparison, in English.

### Differences from the specification

| Specification | v0.2 | Reason |
|---|---|---|
| TypeScript, Vite, React, Lezer, CodeMirror, React Flow | dependency-free JavaScript, SVG and canvas, custom highlighting editor | one static file, no build step needed to use it |
| Engine in a Web Worker | engine on the main thread, capped at 150,000 events | simplicity; enough for teaching scenarios |
| Canvas for animation beyond a few hundred nodes | SVG with a static layer redrawn only on topology changes, a separate composited layer for animations, pooled elements, and batched canvas drawing for the diagram; packets switch to a compact form when many are in flight | keeps editing simple while playing large runs smoothly |
| Periodic snapshots for time travel | the whole run is computed first and then replayed; state recorded at every step that changes it | equivalent thanks to determinism, and simpler |
| Explicit `stack` in the scenario | binding in the code: `via` when needed, otherwise the first algorithm implementing `X` | the choice lives next to the code that depends on it |
| Standard library in `.dalg` files | a library of Upon modules in `library.js`, added from the editor; `RetransmitLinks` retransmits a bounded number of times | textbook stubborn links retransmit forever and make traces grow too much |
| Global invariants | local `assert` only, with an optional halt | v1.1 |
| Per-node process parameters, GC pauses, `pauses` | global `step` distribution only | v1.1 |
| Omission failures of a process | omissions come from channel loss only | v1.1 |

### Suggested next steps

1. Failure detectors (P, ◇P ping-pong, Ω, φ-accrual, simplified SWIM), a suspicion matrix over time and quality metrics.
2. An algorithm catalog grouped by topic, with automatic checks of agreement, validity, termination and mutual exclusion.
3. Global invariants written by the user, checked at every step and shown on the timeline.
4. Node pauses, send and receive omissions, one-way link failures.
5. Engine in a Web Worker for larger traces.
