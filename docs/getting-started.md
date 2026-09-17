# Getting started

This walkthrough takes about twenty minutes. You will look around the interface, write a small algorithm from scratch, break it with a crash and a lossy network, and fix it with a module from the library.

You need a recent browser. Open the [live demo](https://engineering87.github.io/distributed-systems-playground/), or `index.html` from a copy of the repository.

## Contents

- [1. Look around](#1-look-around)
- [2. Start from an empty scenario](#2-start-from-an-empty-scenario)
- [3. Write a first algorithm](#3-write-a-first-algorithm)
- [4. Add a deadline](#4-add-a-deadline)
- [5. Break it](#5-break-it)
- [6. Make it reliable](#6-make-it-reliable)
- [7. Keep your work](#7-keep-your-work)
- [Where to go next](#where-to-go-next)

## 1. Look around

The playground opens on the *Flooding broadcast* example and starts playing it.

- **Top left, the graph.** Twelve processes on a grid. Blue labeled packets move along the links; a ring appears on a process when a message arrives; green bubbles show what a process reports to its application.
- **Right, the side panel.** *Code* holds the algorithm, *Timing* the network model, *Scenario* the inputs and faults, *State* the variables of the selected process, *Stack* the modules inside it.
- **Bottom, the run.** Play controls and the time scrubber, the space-time diagram with one line per process, and the event log.

Press `Space` to pause. Drag the scrubber back and forth: the graph, the diagram and the log follow. Click a packet to see what it carries. Click a process, open *State*, and scrub again to watch its `seen` set grow.

Change the speed menu to **Event by event** and press play. Each step now takes the same time on screen, however short it was in the simulation. This is the best mode to follow an algorithm for the first time.

## 2. Start from an empty scenario

Choose **Empty scenario** in the *Example* menu. You get five processes on a ring and a small program. We will replace the program.

The *Timing* tab shows the **Asynchronous** preset: no bounds on delays, and occasional delay spikes. Leave it as it is.

## 3. Write a first algorithm

Our algorithm lets a process ask its neighbors whether they are alive. Each neighbor answers, and the asking process counts the answers.

Select everything in the *Code* tab and replace it with:

```upon
interface Survey
  request Ask()
  indication Answered(count)
end

algorithm PingNeighbors
  implements Survey as app
  uses Net as net
  state
    answers := ∅

  upon event ⟨app, Ask⟩ do
    answers := ∅
    forall q in neighbors do
      trigger ⟨net, Send | q, [PING]⟩
    end
  end

  upon event ⟨net, Deliver | p, [PING]⟩ do
    trigger ⟨net, Send | p, [PONG]⟩
  end

  upon event ⟨net, Deliver | p, [PONG]⟩ do
    answers := answers ∪ {p}
    trigger ⟨app, Answered | #answers⟩
  end
end
```

The symbols `⟨ ⟩ ∪ ∅` are on the buttons above the editor. You can also type the ASCII versions: `< >`, `union`, `{}`.

What the code says:

- The **interface** `Survey` is how the application talks to the algorithm: it sends `Ask`, and receives `Answered` with the number of answers so far.
- The algorithm **uses** the network, `Net`, under the name `net`.
- On `Ask`, the process sends `[PING]` to each neighbor. `PING` is an *atom*, a constant written in capitals.
- A process that receives `[PING]` from `p` sends `[PONG]` back to `p`. Every process runs the same code, so the neighbors do this.
- A process that receives `[PONG]` adds the sender to `answers` and reports the count. `#answers` is the size of the set.

The list under the editor should say *No errors*. If it shows a problem, click it to jump to the line.

Now tell p1 to ask. In the *Scenario* tab, replace the inputs with:

```text
0ms 1 Ask
```

Press **Run**. p1 sends two `PING` packets, to p2 and p5, and receives two answers. In the log you will find `Answered | 1` and then `Answered | 2`.

With the default seed, the second answer arrives almost 200 ms after the first: one of the messages hit a delay spike. Hover the long arrow on the diagram to see its delay.

## 4. Add a deadline

In an asynchronous system p1 cannot wait forever. Let us give neighbors 200 ms to answer, and report the ones that did not.

Replace the code with this version. The changes are the new indication `Missing`, the parameter `WAIT`, the timer started in the `Ask` handler, and the `Timeout` handler.

```upon
interface Survey
  request Ask()
  indication Answered(count)
  indication Missing(q)
end

algorithm PingNeighbors
  implements Survey as app
  uses Net as net
  params
    WAIT := 200ms
  state
    answers := ∅

  upon event ⟨app, Ask⟩ do
    answers := ∅
    forall q in neighbors do
      trigger ⟨net, Send | q, [PING]⟩
    end
    starttimer(deadline, WAIT)
  end

  upon event ⟨net, Deliver | p, [PING]⟩ do
    trigger ⟨net, Send | p, [PONG]⟩
  end

  upon event ⟨net, Deliver | p, [PONG]⟩ do
    answers := answers ∪ {p}
    trigger ⟨app, Answered | #answers⟩
  end

  upon event ⟨timer, Timeout | deadline⟩ do
    forall q in neighbors where q ∉ answers do
      trigger ⟨app, Missing | q⟩
    end
  end
end
```

Run it. Both answers arrive, the second one a few milliseconds before the deadline, and nothing is reported missing.

## 5. Break it

**Crash a neighbor.** In the *Scenario* tab, under *Faults*, choose *Crash*, process `2`, at `0ms`, and press *Add fault*. Run again. p2 is drawn crossed out, p1 gets a single answer, and at 200 ms it reports `Missing | 2`. That is a correct detection.

**Shorten the deadline.** Change `WAIT := 200ms` to `WAIT := 30ms`, remove the crash with *Remove*, and run. Now p1 reports neighbors that are perfectly alive, because their answers were simply slow. Press the dice button next to the seed a few times: with a 30 ms deadline and this network, a false alarm happens in almost every run.

This is the central difficulty of asynchronous systems: from the inside, a slow process and a crashed one look the same. A longer deadline makes mistakes rarer, but a crashed process is then detected later.

**Lose messages.** Put `WAIT` back to `200ms`. In the *Timing* tab set *Loss* to `0.3`, and run a few seeds. Neighbors are now reported missing even though nobody crashed: a lost `PING` or `PONG` is never sent again.

## 6. Make it reliable

The library has links that retransmit until the message is acknowledged. Open *Add module* in the *Code* tab and choose **AckLinks (PerfectLinks)**. The editor appends the `PerfectLinks` interface and the `AckLinks` algorithm.

Now make `PingNeighbors` use it instead of the raw network. Change the `uses` line and the four places that name `net`:

```text
algorithm PingNeighbors
  implements Survey as app
  uses PerfectLinks as pl
  ...
      trigger ⟨pl, Send | q, [PING]⟩
  ...
  upon event ⟨pl, Deliver | p, [PING]⟩ do
    trigger ⟨pl, Send | p, [PONG]⟩
  end

  upon event ⟨pl, Deliver | p, [PONG]⟩ do
  ...
```

Run with loss still at 0.3. Most answers now arrive, some of them after one or more retransmissions every 150 ms. Some can still arrive after the 200 ms deadline: reliable delivery says a message will arrive, not when. Raise `WAIT` to `1s` and the false alarms become rare.

Tick **Layers** above the graph. Packets are now colored by the module that started them: your algorithm's pings and pongs, and the link layer's acknowledgements and retransmissions. Open the *Stack* tab and select p1 to see the two modules and the events flowing between them.

## 7. Keep your work

The scenario is saved in the browser as you edit. It will be there when you come back, on the same browser.

To keep it elsewhere or share it, press **Export**. You can copy the JSON, save it as a file, or copy a link that contains the whole scenario. Whoever opens the link sees exactly your run, with the same seed.

**Import** opens a JSON file or pasted JSON.

## Where to go next

- The [examples](examples.md) show classic algorithms, each with experiments to try.
- [The Upon language](language.md) is the full reference.
- [The timing model](timing-model.md) explains every parameter of the *Timing* tab.
- [Faults](faults.md) covers crashes, recoveries, link failures and partitions.
- [Assumptions and simplifications](assumptions.md) lists what the simulator leaves out. Read it before drawing conclusions from a run.
