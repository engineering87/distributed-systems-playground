# Documentation

Distributed Systems Playground is a browser tool for writing distributed algorithms in textbook pseudocode and watching them run on a simulated network. These pages explain how to use it, what it models, and where it simplifies.

The same pages are published as a [documentation site](https://engineering87.github.io/distributed-systems-playground/manual/) with navigation and search. In a copy of the repository, open `manual/index.html`.

## Where to start

| If you want to | Read |
|---|---|
| try it in twenty minutes | [Getting started](getting-started.md) |
| brush up on the theory | [Concepts](concepts.md) |
| explore ready-made scenarios | [Examples](examples.md) |
| use it in a course | [Teaching with the playground](teaching.md) |
| know what the simulator leaves out | [Assumptions and simplifications](assumptions.md) |

## Reference

| Page | Content |
|---|---|
| [The interface](interface.md) | every panel, control, visual mark and shortcut |
| [The Upon language](language.md) | syntax, semantics, built-ins, checks and errors |
| [The module library](library.md) | links and broadcast modules, their guarantees and costs |
| [The timing model](timing-model.md) | assumed and actual models, distributions, presets, rounds, GST |
| [Faults](faults.md) | crashes, recoveries, link failures, partitions |
| [How the engine works](engine.md) | event ordering, steps, message handling, determinism |
| [Running scenarios outside the browser](cli.md) | the command line tool and the batch runner API |
| [Troubleshooting](troubleshooting.md) | symptoms, causes, fixes and error messages |
| [Specification](SPEC.md) | the design document, grammar and implementation status |
| [Changelog](../CHANGELOG.md) | what changed in each version |

## A note on trust

Every run is one execution of a model. The model is described precisely in [Assumptions and simplifications](assumptions.md), and the examples in these pages were checked against the engine: the numbers quoted come from real runs with the stated seeds, and the Upon programs are compiled by the test suite. If you find a statement that does not match what the playground does, please open an issue.
