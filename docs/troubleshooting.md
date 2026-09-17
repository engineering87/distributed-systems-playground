# Troubleshooting

Symptoms, likely causes and fixes. If your problem is not here, check [Assumptions and simplifications](assumptions.md): many surprising results are the model doing what it says.

## Contents

- [The run does not start](#the-run-does-not-start)
- [The run stops early](#the-run-stops-early)
- [Nothing happens](#nothing-happens)
- [Messages disappear](#messages-disappear)
- [The algorithm misbehaves](#the-algorithm-misbehaves)
- [The display](#the-display)
- [Saving and sharing](#saving-and-sharing)
- [Error messages](#error-messages)

## The run does not start

**The status says *The code contains errors*.** Open the *Code* tab. The list under the editor shows each error with its line; click it to jump there. The most common ones are listed under [Error messages](#error-messages).

**The status mentions an input line.** A line in *External inputs* does not follow `TIME NODE Event | arguments`, names an event that the main algorithm does not accept, or has the wrong number of arguments. The event must be a `request` of the main algorithm's interface.

**The status mentions a distribution or a duration.** A field in the *Timing* tab is invalid; it is outlined in red. Durations need a unit or are read as milliseconds: `50ms`, `2s`. Distributions look like `uniform(5ms, 30ms)`.

**The status says *Emulated rounds need known DELTA and PHI*.** With synchronous rounds emulated on clocks, the round length is `DELTA + PHI`, so both must have a value.

**The status says *No algorithm implements …* or *Circular dependency*.** A `uses` clause names an interface that no algorithm in the code implements, or two algorithms use each other. Add the missing module (*Add module* may have it) or break the cycle.

## The run stops early

**The status says *Runtime error*.** The line is highlighted in the editor and listed under it. Scrub to the end of the run and open *State* to see the values that led to it.

**The status says *Limit of 150000 events reached*.** Something produces a lot of events: a timer that fires too often, retransmissions to a crashed process, a gossip with a large fanout. Shorten the simulated duration in the *Scenario* tab, lengthen the timer, or reduce the parameters.

**The status says *Timing violation (policy: halt)*.** The policy in the *Timing* tab is *Stop the simulation*. That is intended: the run stops at the first broken promise.

**The status says *Assertion failed*.** *Stop at the first failed assertion* is checked and an `assert` failed. The log says which one.

## Nothing happens

**No input.** Most algorithms do nothing until the application asks. Add a line to *External inputs*, such as `0ms 1 Start`.

**The event has no handler.** The log shows a warning such as *event ⟨app, Start⟩ has no handler*. Check the spelling of the event and of the instance name in the handler.

**The wrong main algorithm.** The *Main algorithm* menu decides which algorithm receives the inputs. With several algorithms in the code, make sure the right one is selected.

**The run is over.** Playback stops where the action ends. Press ⏮ and play again, or check that **Autoplay** is on.

**The speed is too high.** With *Auto speed* on a long run, short events flash by. Use *Event by event*.

## Messages disappear

Filter the log by *Dropped messages*, or hover the arrow on the diagram to read the status.

| Status | Cause | Fix |
|---|---|---|
| no link | the recipient is not a neighbor | add a link, or use a complete graph |
| lost by the network | *Loss* is above zero | use perfect links from the library, or set loss to 0 |
| dropped by a link failure or a partition | a fault in the *Scenario* tab | check the fault list |
| discarded because late | a violation with the *Discard* policy | raise `DELTA`, change the policy, or change the actual delays |
| recipient crashed | the recipient was down | check the fault list |
| still in transit | the run ended first | lengthen the simulated duration |

Library broadcast modules send to every process in `Π`. On a topology that is not complete, the messages to non-neighbors end up as *no link*.

## The algorithm misbehaves

**A handler never runs.** Handlers for the same event are tried in order, and only the first match runs. An earlier, more general handler may catch everything. Move the specific one up or add `where` clauses.

**A tag is treated as a variable.** Atoms need at least two capital letters. `A` is a variable name; `AB` is an atom. A state variable written in capitals hides the atom with the same name.

**A division gives a whole number.** Division between two whole numbers truncates. Use `mean` for averages, or multiply first.

**The algorithm works only with one seed.** Try others with the dice button, and *random order* for simultaneous events in the *Timing* tab. If it still works only sometimes, the algorithm probably depends on a timing or ordering assumption.

**The algorithm depends on set order.** `forall`, `choose` and `upon exists` follow sorted order. Replace `choose` with `pick` to check whether the order matters.

**A timer never fires.** It was cancelled, restarted, or the process crashed. After a recovery all timers are cleared; start them again in the `Init` or `Recovery` handler.

**State is lost after a recovery.** Only variables declared `stable` survive. That is intended.

**A crash in the middle of a broadcast has no effect.** A step is never interrupted. Add message loss so that some sends need retransmission, and crash the sender before it retransmits.

**FloodSet never disagrees under realistic timing.** Disagreement needs a particular combination of late messages and is rare. Try several seeds; the FloodSet example uses one where it happens.

## The display

**The graph is too small or off-center.** Press **Fit**.

**Packets have no labels.** With more than 120 packets in flight, labels are hidden automatically. Zoom into time with a slower speed, or use a smaller scenario.

**The diagram is empty on the right.** The *Action* view fits the part of the run where things happen. Press **All** to see the whole run.

**The diagram does not follow the cursor.** Dragging the diagram turns **Follow** off. Tick it again.

**Colors are hard to distinguish.** Turn off **Layers**; colors then only indicate the status of messages. The playground follows the system's light or dark theme.

**On a phone, the page does not scroll over the graph.** Start the swipe on an empty part of the graph. A swipe that starts on a process moves the process, and with the *Node*, *Link* or *Delete* tool active the graph captures all touches.

**Part of the interface is still in English.** With the Italian language, code, checker diagnostics, examples inside the quick reference and the documentation are not translated. That is intended.

**Presentation mode does not go full screen.** Some browsers and embedded viewers do not allow it. The mode works anyway; press `F` to try again, or use the browser's own full-screen command.

**The image export does not download.** In embedded viewers, downloads may need your confirmation or may be blocked. Open the playground from GitHub Pages or from a local copy.

## Saving and sharing

**My work is gone.** The scenario is saved in the browser where you edited it, per site. A different browser, a private window, or clearing site data starts fresh. Export important scenarios.

**The link does not open my scenario.** The link must be copied whole: the scenario is in the part after `#`. Some chat applications cut long links; share the exported JSON file instead.

**Save file does nothing.** Some embedded viewers block downloads. Use **Copy JSON** and paste it into a file.

**Import says *not a scenario*.** The JSON must contain at least `nodes` and `code`. Export a scenario to see the full format.

## Error messages

| Message | Meaning |
|---|---|
| `Expected "⟩" (or ">"), found …` | an event is not closed, often because of a `>` comparison inside an ASCII `trigger`; wrap it in parentheses |
| `Expected ":=" (statements start with a keyword or an assignment)` | a line starts with a name that is not assigned, often a missing `trigger` or `call` |
| `Variable "x" is not declared` | declare it in `state` or `params`, assign it first, or check the spelling |
| `"DELTA" is not available` | the assumed model does not know `DELTA`; set it in the *Timing* tab or avoid it |
| `"Rounds" is only available when the assumed model is "synchronous rounds"` | switch the synchrony model, or use `Net` |
| `"X" is not an indication of I (only indications can be emitted upwards)` | `trigger ⟨myAlias, X⟩` must use an indication of your own interface |
| `"X" is not a request of I (only requests can be sent downwards)` | `trigger ⟨usedAlias, X⟩` must use a request of the used interface |
| `Unknown instance "x" in this algorithm` | the instance name does not match `implements … as` or `uses … as` |
| `"return" can only be used inside a function` | handlers do not return; restructure with `if` |
| `"call" is for your own functions` | built-in functions are used in expressions: `x := size(S)` |
| `Expected a boolean, found …` | a condition or `where` clause is not true or false |
| `Variable "x" is not defined` (while running) | a local variable was read on a path where it was never assigned; assign it before every use |
| `while loop exceeded 100000 iterations` | the loop condition never becomes false |
| `A guard stays true forever` | an `upon condition` or `upon exists` handler must make its condition false |
| `Function calls nested deeper than 200` | a recursive function never stops |
| `Too many statements in a single step` | a loop does not terminate |
| `min of an empty set` (and similar) | check that the collection is not empty first |
