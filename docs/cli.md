# Running scenarios outside the browser

The engine does not depend on the page, so the same scenario can be run from a terminal. This is useful to try an algorithm over many seeds, to compare timing models, to grade exercises, and to check a scenario in continuous integration.

You need Node.js 18 or later and a copy of the repository. There is nothing to install.

## Contents

- [The command line tool](#the-command-line-tool)
- [Running a scenario](#running-a-scenario)
- [Comparing outcomes](#comparing-outcomes)
- [Changing the model from the command line](#changing-the-model-from-the-command-line)
- [Checking a program](#checking-a-program)
- [Exit codes and continuous integration](#exit-codes-and-continuous-integration)
- [The batch runner API](#the-batch-runner-api)
- [What it does not do yet](#what-it-does-not-do-yet)

## The command line tool

```sh
node bin/dsp.mjs --help          # or: npm run dsp -- --help
node bin/dsp.mjs examples        # the built-in examples and their timing model
node bin/dsp.mjs presets         # the timing presets
```

A scenario is a JSON file exported from the playground (**Export** → *Save file* or *Copy JSON*), `-` to read it from standard input, or `--example <key>` for a built-in one. A scenario carries its own code, topology, timing model, inputs, faults and seed, so a run from the terminal matches the one in the browser exactly.

## Running a scenario

```sh
node bin/dsp.mjs run --example floodset --seeds 1..8
```

```text
seed  status                events  msgs   lost  viol  outputs time
   1 ok                        60     24     0     0       4     2 s
   2 ok                        60     24     0     0       4     2 s
…

8 run(s), 0 failed, 0 with failed assertions, 0 with violations
average per run:  60 events  24 messages  0 lost  0 violations  4 outputs
took 24 ms
```

| Option | Effect |
|---|---|
| `--seeds 1..50`, `--seeds 7`, `--seeds 1,4,9` | which seeds to run; by default the seed stored in the scenario |
| `--preset <key>` | replace the whole timing model with a preset |
| `--set <path=value>` | change one scenario field, repeatable |
| `--stop-on-failure` | stop at the first run that fails |
| `--outputs` | print the outputs of every run |
| `--outcomes` | group the runs by the outputs they produced |
| `--json` | print summaries as JSON |
| `--quiet` | print only the summary |

A run counts as failed when the code does not compile or the simulation stops with a runtime error. Violations and failed assertions are reported separately, because a violation is a broken assumption, not a broken program.

## Properties across a batch

When the program declares [properties](language.md#properties), every run reports whether each one held, and the batch says in which seed each was first broken:

```sh
node bin/dsp.mjs run --example floodset --preset sync-real --seeds 1..8
```

```text
     5 Agreement broken             741     24     9    11       4   2.999 s
       property Agreement: violated at 150 ms on p2
…
property Agreement       (always)      held in 7/8 run(s), first broken at seed 5
property Validity        (always)      held in 8/8 run(s)
property Termination     (eventually)  held in 8/8 run(s)
```

The exit code is 1, so this command is a test: FloodSet keeps agreement under ideal rounds and loses it under rounds built on drifting clocks. Open seed 5 in the browser to watch the moment it happens.

## Comparing outcomes

`--outcomes` answers the question a batch is usually run for: did every seed end the same way?

```sh
node bin/dsp.mjs run --example floodset --preset sync-real --seeds 1..8 --outcomes
```

```text
outcomes (5 distinct):
     4 run(s)  seeds 3, 6, 7, 8
           Decide | 1 | Decide | 1 | Decide | 1 | Decide | 1
…
     1 run(s)  seeds 5
           Decide | 3 | Decide | 3 | Decide | 3 | Decide | 7
```

The last group is a run where the processes did not agree. Open that seed in the browser to see why: the scenario is the same, so `--seeds 5` in the terminal and seed 5 in the page are the same execution.

Each seed of FloodSet draws different proposals, so different groups are normal. What matters is whether the values inside one run are all equal.

## Changing the model from the command line

`--set` follows the same field names as the exported JSON:

```sh
node bin/dsp.mjs run --example flooding --set actual.loss=0.3 --seeds 1..20 --quiet
node bin/dsp.mjs run --example epfd --set actual.gst=8s --set stopAt=15s
node bin/dsp.mjs run scenario.json --preset async --set actual.delay="lognormal(3, 0.8)"
```

Values that look like numbers or booleans are converted; everything else stays a string, which is what durations and distributions need. Property names that could reach an object's prototype are refused.

## Checking a program

```sh
node bin/dsp.mjs check scenario.json
```

Parses the code and checks it against the assumed model of the scenario, exactly like the editor does, and prints errors and warnings. It runs nothing, so it is fast enough for a pre-commit hook.

## Exit codes and continuous integration

| Code | Meaning |
|---|---|
| 0 | every run finished without errors or failed assertions |
| 1 | at least one run failed, broke a property or failed an assertion, or `check` found errors |
| 2 | usage error, unreadable file, invalid JSON, unknown example or preset |

A workflow step that keeps an exercise honest:

```yaml
- run: node bin/dsp.mjs check solution.json
- run: node bin/dsp.mjs run solution.json --seeds 1..100 --quiet
```

With `assert` statements in the algorithm and *Stop at the first failed assertion* in the scenario, a violated property makes the step fail and names the seed that produced it.

## The batch runner API

`src/runner.js` is the module behind the tool. It has no dependency on the page and can be required from Node or loaded in a browser page.

```js
const R = require('./src/runner.js');

const res = R.runBatch(scenario, {
  seeds: '1..200',              // range, list, array or { from, to }
  preset: 'sync-real',          // optional, replaces the timing model
  set: { 'actual.loss': '0.2' },// optional field overrides
  stopOnFailure: false,
  onRun: (summary, done, total) => { /* progress; return false to stop */ }
});

res.summary;   // runs, failed, firstFailure, withViolations, per-property results, averages
res.runs;      // one compact summary per seed
R.outcomes(res.runs);      // runs grouped by the outputs they produced
R.checkScenario(scenario); // { ok, errors, warnings }
```

A summary holds what a batch needs and not the whole trace: counts of messages by status, violations, failed assertions, the outputs with their times, the stop reason and any error. A full run, with every message and snapshot, is what `SimCore.runSimulation` returns; see [How the engine works](engine.md#what-a-run-produces).

## What it does not do yet

- **Properties are checked, not proved.** Global invariants are evaluated on the runs of the batch: more executions than a single run, never all of them. See the roadmap in the [specification](SPEC.md#10-roadmap).
- **Fault schedules are fixed.** A batch varies the seed and the fields you override; generating crash and partition schedules automatically is the next step.
- **Runs are sequential.** The tool runs one seed at a time in one process. It is fast enough for a few hundred runs of a small scenario; the interface will run batches in parallel workers.
- **One run is one execution.** A batch explores more executions than a single run, never all of them. See [Assumptions and simplifications](assumptions.md#what-the-playground-is-not).
