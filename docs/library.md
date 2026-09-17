# The module library

The library contains communication abstractions written in Upon: links that hide message loss, and several kinds of broadcast. You add them from the *Add module* menu in the *Code* tab, and then build on them with a `uses` clause.

Most modules follow the algorithms in Cachin, Guerraoui and Rodrigues, *Introduction to Reliable and Secure Distributed Programming* (2nd edition, Springer, 2011), where you will find the proofs. This page describes what each module does, what it sends over the network, what it guarantees, and where it departs from the book. The departures are also collected in [Assumptions and simplifications](assumptions.md#the-module-library).

## Contents

- [Using the library](#using-the-library)
- [Overview](#overview)
- [Links](#links)
  - [RetransmitLinks](#retransmitlinks)
  - [EliminateDuplicates](#eliminateduplicates)
  - [AckLinks](#acklinks)
  - [SequencedFifoLinks](#sequencedfifolinks)
- [Broadcast](#broadcast)
  - [BasicBroadcast](#basicbroadcast)
  - [EagerReliableBroadcast](#eagerreliablebroadcast)
  - [MajorityAckURB](#majorityackurb)
  - [BroadcastWithSequenceNumber](#broadcastwithsequencenumber)
  - [WaitingCausalBroadcast](#waitingcausalbroadcast)
  - [EagerGossip](#eagergossip)
- [Choosing a module](#choosing-a-module)
- [Writing your own](#writing-your-own)

## Using the library

Choosing a module in *Add module* appends to your code:

- the interfaces it implements and uses, if they are not declared yet;
- for every interface it uses that nothing in your code implements, a default module that does (for example, *EagerReliableBroadcast* brings *BasicBroadcast*, which brings *AckLinks*);
- the module itself.

Then use it from your algorithm:

```upon
interface ReliableBroadcast
  request Broadcast(m)
  indication Deliver(p, m)
end

interface Chat
  request Say(text)
  indication Heard(from, text)
end

algorithm ChatRoom
  implements Chat as app
  uses ReliableBroadcast as rb

  upon event ⟨app, Say | text⟩ do
    trigger ⟨rb, Broadcast | text⟩
  end

  upon event ⟨rb, Deliver | p, text⟩ do
    trigger ⟨app, Heard | p, text⟩
  end
end
```

Everything added is ordinary Upon. You can read it, change a parameter, add a `log` statement, or step through it in the *Stack* tab.

If the code already contains an algorithm with the same name, the module is not added again. To keep two variants, rename one of them.

## Overview

| Module | Implements | Uses | Guarantees | Messages per operation |
|---|---|---|---|---|
| RetransmitLinks | StubbornLinks | Net | each message resent a fixed number of times | 1 + retries |
| EliminateDuplicates | PerfectLinks | StubbornLinks | reliable delivery, no duplicates | as below it |
| AckLinks | PerfectLinks | Net | reliable delivery to correct processes, no duplicates | 1 + retransmissions, plus acks |
| SequencedFifoLinks | FifoPerfectLinks | PerfectLinks | perfect links, delivered in sending order | as below it |
| BasicBroadcast | BestEffortBroadcast | PerfectLinks | everyone delivers if the sender stays correct | N |
| EagerReliableBroadcast | ReliableBroadcast | BestEffortBroadcast | all correct processes deliver, or none | up to N² |
| MajorityAckURB | UniformReliableBroadcast | BestEffortBroadcast | if anyone delivers, all correct processes deliver | up to N² |
| BroadcastWithSequenceNumber | FifoReliableBroadcast | ReliableBroadcast | reliable broadcast, FIFO per sender | as below it |
| WaitingCausalBroadcast | CausalOrderBroadcast | ReliableBroadcast | reliable broadcast, causal order | as below it |
| EagerGossip | ProbabilisticBroadcast | Net | most processes deliver, with high probability | at most FANOUT per forwarding process |

*N* is the number of processes. Counts are for one broadcast or one send on a reliable network; losses add retransmissions.

## Links

`Net` is a *fair-loss* link: with loss enabled, any message can disappear. The link modules build stronger guarantees on top of it.

### RetransmitLinks

**Implements** StubbornLinks · **Uses** Net · **Parameters** `PERIOD := 100ms`, `RETRIES := 5`

Sends each message immediately, then again every `PERIOD`, `RETRIES` more times. It delivers everything it receives, duplicates included.

**On the wire:** the message itself, unchanged.

**Guarantees:** a message to a correct process is delivered many times, unless every copy is lost.

**Differences from the book.** The book's *Retransmit Forever* never stops resending, which gives *stubborn delivery*: a correct recipient receives the message infinitely often. Here retransmission stops after `RETRIES`, so runs stay finite. With a loss rate *p*, a message is lost for good with probability *p* raised to `RETRIES + 1`. Messages are identified by content, so sending the same message to the same process twice restarts its retransmission count instead of starting a second series.

### EliminateDuplicates

**Implements** PerfectLinks · **Uses** StubbornLinks

Remembers every (sender, message) pair it has delivered and drops repeats.

**On the wire:** whatever the stubborn links send.

**Guarantees:** reliable delivery (within the limits of RetransmitLinks), no duplication, no creation.

**Assumption:** every message is unique, as in the book. If the application sends the same payload twice to the same process, the second one is taken for a duplicate. Add a sequence number to the payload, or use AckLinks.

### AckLinks

**Implements** PerfectLinks · **Uses** Net · **Parameter** `TIMEOUT := 150ms`

Numbers each outgoing message, keeps it until the recipient acknowledges it, and resends every pending message every `TIMEOUT`. The recipient acknowledges every copy and delivers each number only once.

**On the wire:** `[DATA, n, m]` for data, `[ACK, n]` for acknowledgements. `n` counts the messages sent by this process, across all recipients.

**Guarantees:** a message to a correct process is delivered exactly once, whatever the loss rate below 1. No creation.

**Not in the book.** This is the usual engineering version of perfect links, added because it handles repeated payloads and stops retransmitting once a message is acknowledged. It keeps resending to a crashed process until the end of the run, since it cannot tell a crash from a slow network. It has no flow control and no congestion control.

It is the default implementation of PerfectLinks when a module needs one.

### SequencedFifoLinks

**Implements** FifoPerfectLinks · **Uses** PerfectLinks

Numbers messages per destination. The recipient buffers what arrives and delivers the messages from each sender in order, without gaps.

**On the wire:** `[FIFO, n, m]` inside whatever the perfect links send, with `n` counted per destination from 0.

**Guarantees:** those of perfect links, plus FIFO order for each pair of processes.

**Note:** a gap blocks every later message from the same sender. With AckLinks underneath, gaps are always filled eventually, unless the sender crashes.

## Broadcast

All broadcast modules except EagerGossip send to every process in `Π`, including the sender. They need a **complete graph**: on other topologies, messages to non-neighbors are dropped by the network.

Every broadcast module identifies a message by its original sender and a sequence number. The sequence numbers restart from zero after a recovery, because the modules do not declare them `stable`.

### BasicBroadcast

**Implements** BestEffortBroadcast · **Uses** PerfectLinks

Sends the message to every process over perfect links, and delivers what it receives.

**On the wire:** the message, through the perfect links.

**Guarantees:** *validity* (if the sender is correct, every correct process delivers), *no duplication*, *no creation*.

**What it does not guarantee:** if the sender crashes before its message reaches everyone, some correct processes deliver and others never do. The [reliable broadcast example](examples.md#reliable-broadcast-when-the-sender-crashes) shows this with BasicBroadcast in place of the reliable version.

### EagerReliableBroadcast

**Implements** ReliableBroadcast · **Uses** BestEffortBroadcast

Delivers a message the first time it sees it and immediately rebroadcasts it, so every correct process becomes a relay.

**On the wire:** `[RB, s, n, m]`, where `s` is the original sender and `n` its sequence number.

**Guarantees:** *validity*, *no duplication*, *no creation*, and *agreement*: if a correct process delivers a message, every correct process delivers it. It needs no failure detector.

**Cost:** each process relays each message once, so up to N² messages per broadcast. The book's *Lazy Reliable Broadcast* relays only when the sender is suspected, which costs less but needs a perfect failure detector; it is not in the library yet.

**What it does not guarantee:** *uniform* agreement. A process may deliver a message and then crash before its relay reaches anyone. If nobody else got the message, the crashed process delivered something the others never will.

### MajorityAckURB

**Implements** UniformReliableBroadcast · **Uses** BestEffortBroadcast

Relays every message once, like EagerReliableBroadcast, but delivers it only after more than half of the processes have relayed it.

**On the wire:** `[URB, s, n, m]`.

**Guarantees:** those of reliable broadcast, plus *uniform agreement*: if **any** process delivers a message, even one that crashes right after, every correct process delivers it.

**Assumption:** a majority of the processes is correct. If half or more crash, the remaining processes stop delivering new messages. That is the price of uniformity without a failure detector.

**How it works:** a relay reaching a majority means that at least one correct process has the message and will relay it to everyone.

### BroadcastWithSequenceNumber

**Implements** FifoReliableBroadcast · **Uses** ReliableBroadcast

Numbers the messages of each sender, holds back messages that arrive early, and delivers each sender's messages in order.

**On the wire:** `[FIFO, n, m]` inside the reliable broadcast, with `n` counted per sender from 1.

**Guarantees:** those of reliable broadcast, plus *FIFO order*: two messages from the same sender are delivered in the order they were sent. Messages from different senders can interleave in any way.

### WaitingCausalBroadcast

**Implements** CausalOrderBroadcast · **Uses** ReliableBroadcast

Attaches a vector clock to every message and delivers a message only after everything it causally depends on has been delivered.

**On the wire:** `[CRB, W, m]`, where `W` maps each process to the number of its messages the sender had delivered when broadcasting, plus the sender's own count.

**Guarantees:** those of reliable broadcast, plus *causal order*: if message *m1* may have influenced message *m2*, every process delivers *m1* before *m2*.

**How it works:** each process counts, per sender, how many messages it has delivered (`V`). A pending message with vector `W` can be delivered when `W ≤ V` in every entry.

**Limitations:** a message whose dependency is lost for good stays pending forever. Vector clocks grow with the number of processes and are never compacted.

The [causal broadcast example](examples.md#causal-order-broadcast-questions-before-answers) shows the difference from plain reliable broadcast.

### EagerGossip

**Implements** ProbabilisticBroadcast · **Uses** Net · **Parameters** `FANOUT := 2`, `ROUNDS := 4`

The sender delivers the message and forwards it to `FANOUT` random neighbors. A process that receives it for the first time delivers it and forwards it to `FANOUT` random neighbors, until the message has travelled `ROUNDS` hops.

**On the wire:** `[GOSSIP, s, n, m, r]`, where `r` counts the hops left.

**Guarantees:** *probabilistic validity*: with suitable parameters, most correct processes deliver, with high probability. *No duplication* and *no creation* hold always.

**Differences from the book.** The book's *Eager Probabilistic Broadcast* picks targets among all processes over fair-loss links. This version picks among `neighbors`, so it works on sparse topologies, and it sends directly over `Net`. It never retries: a lost gossip message is simply one fewer path.

**Tuning:** raising `FANOUT` or `ROUNDS` reaches more processes and costs more messages. The [gossip example](examples.md#gossip-spreading-a-rumor) is a good place to compare.

## Choosing a module

| You need | Use |
|---|---|
| to send to one process over a lossy network | AckLinks |
| the same, in order | SequencedFifoLinks |
| to reach everyone while the sender stays up | BasicBroadcast |
| to reach all correct processes even if the sender crashes | EagerReliableBroadcast |
| the same, including messages delivered by processes that then crash | MajorityAckURB |
| each sender's messages in order | BroadcastWithSequenceNumber |
| replies never delivered before the messages they answer | WaitingCausalBroadcast |
| to reach most processes cheaply, on any topology | EagerGossip |

## Writing your own

A library module is an ordinary algorithm with a clear interface. To add one to `src/library.js`:

1. Write the interface, if it is new, in `IFACES`.
2. Add an entry to `MODULES` with its key, name, the interface it implements, the interfaces it uses, a one-line summary, its guarantees and its source.
3. If it should be the default for its interface, set it in `DEFAULT_FOR`.
4. Add a test in `test/core.test.cjs` that checks its guarantee under the conditions it is meant to survive: loss, reordering, crashes.
5. Document it on this page, including anything that differs from the textbook version.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the rest of the workflow.
