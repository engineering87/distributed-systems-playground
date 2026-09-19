# Faults

Fault tolerance is the reason most distributed algorithms exist. This page describes the faults the playground can inject, what each one does to a run, and how to add them. The modeling choices behind them are listed in [Assumptions and simplifications](assumptions.md#failures).

## Contents

- [Overview](#overview)
- [Crash](#crash)
- [Recovery](#recovery)
- [Link failure](#link-failure)
- [Partition](#partition)
- [Process pause](#process-pause)
- [Omission](#omission)
- [Unreliable channels](#unreliable-channels)
- [Adding faults](#adding-faults)
- [Seeing faults in a run](#seeing-faults-in-a-run)
- [Recipes](#recipes)
- [What is not modeled](#what-is-not-modeled)

## Overview

| Fault | Affects | Duration |
|---|---|---|
| Crash | a process | until a recovery, or forever |
| Recovery | a crashed process | instant |
| Link failure | one or both directions between two processes | an interval, or forever |
| Process pause | a process | a fixed interval |
| Omission | the sends or receives of a process | an interval, or forever |
| Partition | all channels between groups of processes | an interval, or forever |
| Disabled link | one link | the whole run |
| Loss, duplication, delays | every message, independently | the whole run |

All of them are part of the scenario, so they are saved, exported and shared with it, and a run with the same seed and the same faults is always identical.

## Crash

A crash stops a process at a given time. From then on:

- events that reach it are discarded;
- messages that arrive for it are lost and marked *recipient crashed*;
- its timers never fire;
- it sends nothing.

The crash takes effect between two steps. A step that has started always completes. This matters for algorithms whose correctness depends on a crash *during* a sequence of sends, such as reliable broadcast: a process cannot crash after sending to p2 but before sending to p3 in the same loop. To reproduce that situation, add message loss and crash the sender before its retransmissions, as the [reliable broadcast example](examples.md#reliable-broadcast-when-the-sender-crashes) does.

A process that crashes and never recovers is *faulty*; the others are *correct*. Most properties in the literature talk about correct processes only.

## Recovery

A recovery restarts a crashed process:

1. variables declared `stable` keep their values;
2. every other state variable is reset to the value in its declaration;
3. pending timers are cancelled;
4. each module receives `Recovery` if it has a handler for it, otherwise `Init`, starting from the bottom of the stack.

Messages that arrived while the process was down are gone. If the algorithm needs them, it must ask for them again.

```upon
interface Counter
  request Tick()
  indication Count(volatile, durable)
end

algorithm Survivor
  implements Counter as c
  uses Net as net
  state
    volatile := 0
    stable durable := 0

  upon event ⟨c, Tick⟩ do
    volatile := volatile + 1
    durable := durable + 1
    trigger ⟨c, Count | volatile, durable⟩
  end

  upon event ⟨c, Recovery⟩ do
    log "back online, total so far:", durable
  end
end
```

With ticks before and after a crash and a recovery, the first number starts again from 1 while the second keeps counting.

Declaring something `stable` is a statement about the system: it says this value is on disk and survives a crash. The playground takes you at your word. Nothing else persists.

A recovery scheduled for a process that is running is ignored, with a warning in the log.

## Link failure

A link failure interrupts the channel between two processes from a start time until an end time. With no end time, it lasts until the end of the run.

By default both directions fail together. With **One way**, only the messages from the first process to the second are lost, and the other direction keeps working. That asymmetry is worth trying: a process that hears its neighbor but cannot answer looks alive to itself and dead to everybody else, and many algorithms behave badly in that situation.

A message is dropped if the channel is down when it is sent, or when it would arrive. So a message already travelling when the link goes down is lost too.

On the graph, an interrupted link turns into a dashed red line with a ✂ mark. On the diagram, the rows between the two processes are shaded for the duration.

A link does not have to exist in the topology to be the subject of a link failure, but a failure on a pair without a link has no effect.

## Partition

A partition splits the processes into groups. During the partition, messages between different groups are dropped; messages within a group flow normally.

Groups are written as process numbers separated by `|`:

| Groups | Meaning with processes p1 to p5 |
|---|---|
| `1 2 \| 3 4 5` | {p1, p2} and {p3, p4, p5} |
| `1 2 \| 3` | {p1, p2}, {p3}, and {p4, p5} together |
| `3` | p3 alone against everybody else |

Processes not listed form one additional group, which is why `3` isolates p3. A process may appear in only one group.

From the inside, a partition looks exactly like a crash of the other side: messages stop arriving. That is the heart of many impossibility results, and the [partition example](examples.md#failure-detector-across-a-partition-and-a-recovery) shows it with a failure detector.

## Process pause

A pause stops a process from handling events for a fixed interval, without losing anything:

- events that arrive during the pause wait, and are handled when it ends;
- its timers do not fire during the pause, and fire when it ends;
- its state is intact, and nothing is reset.

This is the garbage collection pause, the overloaded machine, the virtual machine that was suspended. From the outside it looks exactly like a crash: the process answers nothing. From the inside nothing happened, which is why a process that comes back from a long pause can send a message that the others consider stale.

A paused process is drawn with a dashed amber outline and a ⏸ mark on the graph, and its line on the diagram carries an amber band for the length of the pause. The *State* tab says "paused until". The event log shows the start and the end of every pause, even when no event runs into it.

Pauses need an end time: a pause forever is a crash without message loss, which is not a useful model.

## Omission

An omission fault makes a process drop some of its own messages, without crashing:

| Field | Meaning |
|---|---|
| Process | whose messages are dropped |
| Omits | its sends, its receives, or both |
| Probability | 1 drops every message, 0.3 drops about one in three |
| From, Until | the window; empty *Until* means until the end of the run |

A dropped message is marked *omitted by a process* and appears in the log under *Dropped messages*. A send omission never leaves the sender; a receive omission arrives and is thrown away, which is the difference between a broken network card and a full receive buffer.

Omissions use their own random stream, one per process, so adding one does not change what happened before it, and the same scenario always omits the same messages.

An omitting process is not faulty in the crash-stop sense: it keeps running, keeps its state and keeps handling the messages it does receive. Algorithms written for crash faults often assume this cannot happen.

## Unreliable channels

Channel faults are set in the *Timing* tab and apply to every message independently:

- **Loss**: the message disappears.
- **Duplication**: the message is delivered twice, each copy with its own delay.
- **Delay and spikes**: the message arrives late, possibly very late.
- **Non-FIFO channels**: later messages can overtake earlier ones.

A link can have its own loss and delay distribution. Select it on the graph and fill in the fields.

**Enabled**, in the same place, disables a link for the whole run. It is the simplest way to cut a topology permanently.

## Adding faults

**In the *Scenario* tab.** Choose the type, fill in the fields, press *Add fault*. The list above the form shows every fault in words; *Remove* deletes one.

| Type | Fields |
|---|---|
| Crash | process, time |
| Recovery | process, time |
| Link failure | two processes, one way or both, from, until (empty for forever) |
| Partition | groups, from, until (empty for forever) |
| Process pause | process, from, until |
| Omission | process, what it omits, probability, from, until (empty for forever) |

The form rejects unknown processes, an end before the start, and a process listed in two groups.

**During playback.** Pause where you want the fault to happen, then:

- select a process and press **Crash here**, or **Recover here** if it is down;
- select a process, type a duration and press **Pause here** to stop it for that long;
- select a process, type a duration and press **Isolate here** to cut it off from everybody else;
- select a link, type a duration and press **Cut here**.

The run is recomputed and playback continues from the same instant. Everything before that instant stays exactly as it was, so you can compare the two futures. The fault is added to the list in the *Scenario* tab; remove it there to undo it.

**In an exported scenario.** Faults are plain JSON:

```json
[
  { "type": "crash", "node": 2, "at": "1.5s" },
  { "type": "recover", "node": 2, "at": "2.5s" },
  { "type": "link", "a": 1, "b": 3, "from": "0ms", "to": "1s", "oneWay": true },
  { "type": "partition", "groups": "1 2 | 3 4 5", "from": "500ms", "to": "" },
  { "type": "pause", "node": 4, "from": "800ms", "to": "1.2s" },
  { "type": "omission", "node": 5, "direction": "send", "prob": 0.3, "from": "0ms", "to": "" }
]
```

## Seeing faults in a run

- **Graph:** a crashed process is dashed and crossed out, with a violet flash when it goes down and a green one when it recovers. Interrupted links are dashed red.
- **Diagram:** a process line becomes violet and dashed while the process is down, with a cross at the crash and a green circle at the recovery. Partitions shade the whole diagram, link failures the rows between the two processes.
- **Event log:** the *Faults* filter shows when each fault starts and ends. The *Dropped messages* filter lists messages lost by the network, dropped by a link failure or a partition, or sent without a link. Messages lost because their recipient was down do not appear there; look for them on the diagram, where they end with a gray cross.
- **State tab:** the status line says whether the process is running, since when it is down, or when it last recovered.

## Recipes

**The sender crashes in the middle of a broadcast.** Set loss to 0.3 or more, use perfect links with acknowledgements, and crash the sender shortly after it sends, before its first retransmission. Some processes got the message, some did not.

**A leader loses contact with the majority.** Use a partition such as `1 | 2 3 4 5` for a few seconds, where p1 is the leader.

**A process comes back and has forgotten everything.** Crash it, recover it later, and watch its state reset in the *State* tab. Then declare the important variables `stable` and compare.

**A flaky link.** Give one link a loss of 0.5 while the others stay reliable.

**A network that gets better.** Use the *Partially synchronous* preset: heavy delays before GST, bounded delays after.

**A process that freezes and comes back.** Pause a leader for longer than the failure detector's timeout. The others suspect it and move on; the leader wakes up convinced it is still in charge. This is how two leaders appear in a system that was proved to have one.

**A half-open connection.** Cut one direction of a link. The sender keeps sending and hears nothing back; the receiver hears everything and its answers vanish.

**A process that keeps its state but drops messages.** Give it a send omission with probability 0.5. Unlike loss on the links, this hits every message that one process sends, whatever its destination.

## What is not modeled

- Byzantine processes, which lie or deviate from the algorithm.
- Corrupted messages.
- Processes that slow down instead of stopping: a pause is all or nothing, and the step duration distribution is the same for everybody.

See [Assumptions and simplifications](assumptions.md#failures) for the reasoning behind these choices.
