# Teaching with the playground

The playground was designed for classrooms: it runs in any browser, needs no setup, and every run can be reproduced exactly from a link. This page collects advice for preparing lessons and a set of exercises, roughly in the order a course would introduce the topics.

## Contents

- [Preparing a lesson](#preparing-a-lesson)
- [During the lesson](#during-the-lesson)
- [Exercises](#exercises)
  - [Warm-up](#warm-up)
  - [Links and broadcast](#links-and-broadcast)
  - [Time and causality](#time-and-causality)
  - [Synchrony and consensus](#synchrony-and-consensus)
  - [Failure detection](#failure-detection)
  - [Open projects](#open-projects)
- [Assessing the work](#assessing-the-work)
- [Things students often get wrong](#things-students-often-get-wrong)

## Preparing a lesson

**Build the scenario in advance.** Set the topology, the code, the timing model and the faults, pick a seed that shows what you want, and export a link. Opening the link in class gives exactly the same run, on any machine.

**Choose the seed on purpose.** Interesting behavior is sometimes rare. FloodSet disagrees in only a small fraction of seeds under realistic timing; use the dice button to search, and write down the seed that works.

**Prepare a pair of links.** Most lessons work best as a comparison: the same scenario with one change, such as best-effort against reliable broadcast, ideal against realistic rounds, a short against a long timeout. Two links, side by side.

**Keep scenarios short.** A run of a few seconds with a handful of processes is easier to follow than a large one. *Event by event* playback helps when many things happen at once.

**Check the assumptions.** Read [Assumptions and simplifications](assumptions.md) before presenting a result as general. For example, a process never crashes in the middle of a step, so some textbook failure scenarios need message loss to appear.

## During the lesson

- Start with **Event by event** playback and the **Stack** tab when introducing an algorithm; switch to **Auto speed** for the overall picture.
- Pause and ask students to predict the next event before stepping.
- Click a packet to show its content; open **State** to show how a variable changes.
- Use **Causality** to discuss which events could have influenced which.
- Use the *here* buttons to answer "what if" questions on the spot: crash this process now, cut this link now. The history before the cursor stays the same, so the comparison is fair.

## Exercises

Each exercise says what to do and what to look for. Most can be done in the playground alone; some ask for a short written explanation.

### Warm-up

**W1. Reading a run.** Load *Flooding broadcast*. Without running further, predict which process delivers `"ok"` last. Check with the diagram. Why is it not necessarily the farthest one?

*Look for:* delays are random, so path length and arrival order do not always agree.

**W2. Counting messages.** In *Flooding broadcast*, how many messages does one broadcast cost on the 3×4 grid? Derive a formula in terms of the number of links, then check it on a ring and on a complete graph generated with the same code.

*Look for:* each process forwards once to all neighbors but one, so the count depends on the degrees, not on the number of processes alone.

**W3. Your first algorithm.** Follow [Getting started](getting-started.md) to the end. Then change the survey so that p1 asks its neighbors' neighbors too.

### Links and broadcast

**L1. Fair-loss links.** Take the survey from Getting started, set loss to 0.2, and run twenty seeds. In how many runs is a live neighbor reported missing? Replace `Net` with *AckLinks* and repeat.

**L2. Stubborn is not perfect.** Build a program that sends ten numbered messages from p1 to p2 over *RetransmitLinks*. How many times does p2 receive each one? Add *EliminateDuplicates*. What changes if two of the ten messages have the same content?

*Look for:* EliminateDuplicates assumes unique messages.

**L3. When the sender crashes.** Load *Reliable broadcast when the sender crashes*. Replace reliable with best-effort broadcast as the code comment explains. Which processes read the news, and why? Then remove the loss and keep the crash. Explain why the difference disappears.

*Look for:* the crash takes effect between steps, so without loss every message has already been sent.

**L4. The cost of reliability.** In the same example, count the messages with best-effort and with reliable broadcast, with no loss and no crash. Relate the counts to N.

**L5. Uniformity.** Add *MajorityAckURB* and use it instead of reliable broadcast. Crash two of the five processes at `0ms`, then three. What happens, and which property is at stake?

### Time and causality

**T1. Concurrent events.** Load *Causal order broadcast*, tick **Causality** and click the event where p2 reads the question. Find an event that is concurrent with it. Explain in terms of messages why neither could have influenced the other.

**T2. Causal order.** In the same example, replace causal with reliable broadcast. Which processes read the answer before the question? Using the diagram, explain why the answer can arrive first.

**T3. Lamport clocks.** Write an algorithm in which every process keeps a Lamport clock, attaches it to every message, and logs the clock value of every event. Check on the diagram that causally related events have increasing timestamps. Find two concurrent events whose timestamps are ordered anyway.

**T4. Drifting timers.** Give processes a clock drift of `uniform(-0.05, 0.05)`, an exaggerated value, and write an algorithm that sends a message every second of local time. Measure on the diagram how far apart the sends of two processes drift after ten seconds.

### Synchrony and consensus

**S1. Rounds.** Load *FloodSet consensus* with *Ideal synchronous*. Explain why f + 1 rounds are needed by building, on paper, a run with one crash in which a single round is not enough. Why can the playground not show that run directly?

*Look for:* a crash never interrupts a step, so a process cannot reach only some of the others in a round.

**S2. Broken rounds.** Switch to *Realistic synchronous* with the same seed. Find the late messages that caused the disagreement. Which assumption of FloodSet was violated?

**S3. Rounds that tolerate delays.** Still under realistic timing, try raising `DELTA`, and separately changing the policy to *Deliver late*. Explain the effect of each on the violations and on the decisions.

**S4. Where the risk lies.** Before running, use the delay histogram to estimate how many round messages will be late. Compare with the violations reported.

### Failure detection

**F1. Timeouts.** Load *Failure detector ◇P*. Count the wrong suspicions before GST. Change `DELTA0` to `20ms` and to `500ms`. Discuss the trade-off between accuracy and detection time.

**F2. Partition or crash?** Load *Failure detector across a partition and a recovery*. From p1's point of view, what is the difference between the partition and p5's crash? Is there any?

**F3. Permanent partition.** Make the partition permanent. Which properties of ◇P are still satisfied, and with respect to which processes?

**F4. A perfect detector.** Under *Timed synchronous*, write a failure detector that uses `DELTA` and never suspects a correct process. Test it with crashes. Then switch the actual delays to exceed the bound and show that it stops being perfect.

### Open projects

**P1. Lazy reliable broadcast.** Write the lazy version of reliable broadcast, which relays a message only when its sender is suspected, on top of a perfect failure detector. Compare message counts with the eager version.

**P2. Leader election on any graph.** Write an election algorithm that works on an arbitrary connected topology, for example with echo waves. Test it on generated graphs.

**P3. Two-phase commit.** Write two-phase commit with a coordinator and three participants. Crash the coordinator after it collects the votes, and describe what the participants can and cannot decide.

**P4. Snapshots.** Implement the Chandy-Lamport snapshot on FIFO channels, and check with the diagram that the recorded state is consistent.

## Assessing the work

- Ask for the exported **link** of the final scenario. It contains everything needed to reproduce the result.
- Ask students to state the **seed** and the **assumed model** of every claim they make.
- For correctness claims, ask for several seeds and at least one run with faults. Remind them that a run shows a bug; it does not prove the absence of one.
- `assert` statements in their code make intended properties explicit, and *Stop at the first failed assertion* makes violations easy to find.

## Things students often get wrong

- **Treating a lucky run as a proof.** Try other seeds and *random order* for simultaneous events.
- **Relying on set order.** Sets are iterated in sorted order and `choose` is deterministic. Code that depends on this may fail on a real system; `pick` exposes the problem.
- **Confusing violations with bugs.** A violation means the network broke the assumed model. The algorithm may still behave correctly.
- **Forgetting that `Π` includes everybody.** Broadcasting to `Π` on a non-complete topology drops messages to non-neighbors.
- **Integer division.** `a / b` truncates between whole numbers.
- **Assuming `trigger` is immediate.** The event is handled after the current handler ends.
