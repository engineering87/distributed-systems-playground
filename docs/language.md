# The Upon language

Upon is the language you write algorithms in. It follows the event-driven notation of Cachin, Guerraoui and Rodrigues closely enough that most textbook algorithms can be copied line by line, and it is strict enough to be checked and executed.

This page is the complete reference. If you have never written Upon, start with [Getting started](getting-started.md) and come back here when you need a detail. The full grammar is in [section 5.2 of the specification](SPEC.md#52-grammar-ebnf).

## Contents

- [A first program](#a-first-program)
- [Lexical rules](#lexical-rules)
- [Interfaces](#interfaces)
- [Algorithms](#algorithms)
- [Handlers](#handlers)
- [Patterns](#patterns)
- [Statements](#statements)
- [Expressions](#expressions)
- [Values](#values)
- [Built-in names](#built-in-names)
- [Built-in functions](#built-in-functions)
- [Functions](#functions)
- [Timers](#timers)
- [Properties](#properties)
- [Provided modules](#provided-modules)
- [Composing modules](#composing-modules)
- [What the checker verifies](#what-the-checker-verifies)
- [Runtime errors](#runtime-errors)
- [ASCII syntax](#ascii-syntax)
- [Common mistakes](#common-mistakes)

## A first program

```upon
interface Greeting
  request Greet(name)
  indication Greeted(from, name)
end

algorithm Hello
  implements Greeting as g
  uses Net as net

  upon event ⟨g, Greet | name⟩ do
    forall q in neighbors do
      trigger ⟨net, Send | q, [HELLO, name]⟩
    end
  end

  upon event ⟨net, Deliver | p, [HELLO, name]⟩ do
    trigger ⟨g, Greeted | p, name⟩
  end
end
```

Read it from the top:

- `Greeting` is an **interface**: it says what the algorithm accepts from above (`Greet`) and what it reports upwards (`Greeted`).
- `Hello` **implements** it under the local name `g`, and **uses** the network under the name `net`.
- The first **handler** reacts to a `Greet` request and sends a message to every neighbor.
- The second reacts to a message from the network. The pattern `[HELLO, name]` matches a tuple whose first element is the atom `HELLO` and binds the second to `name`.
- `trigger` sends an event: down to `net`, or up through `g`.

With the input line `0ms 1 Greet | "world"`, the neighbors of p1 report `Greeted | 1, "world"`.

## Lexical rules

- **Comments** start with `//` and run to the end of the line, or sit between `/*` and `*/`.
- **Identifiers** are letters, digits and underscores, starting with a letter or underscore. Case matters.
- **Atoms** are identifiers written in capital letters, at least two characters long, that are not declared as variables or parameters: `HELLO`, `ACK`, `HEARTBEAT_REQUEST`. They are symbolic constants, used mostly as message tags.
- **Numbers** are decimal: `3`, `0.25`, `1e-4`.
- **Durations** are numbers followed by `us`, `ms` or `s`, with no space: `300us`, `50ms`, `2s`. They become plain numbers of microseconds, so `50ms` equals `50000`.
- **Strings** are written between double quotes. A backslash takes the next character literally: `"say \"hi\""`.
- **Line breaks** do not matter. Statements are recognized by their first word. A semicolon between statements is allowed and ignored.

Keywords:

```text
interface request indication algorithm implements as uses via params state stable
upon event where condition exists do end function return call
trigger if then elif else forall in while starttimer canceltimer assert log skip
and or not notin union inter minus subseteq true false nil
```

## Interfaces

```text
interface Name
  request   EventName(param, param)
  indication EventName(param)
end
```

- A **request** travels from a module to the module below it.
- An **indication** travels from a module to the module above it.
- The parameter names are for documentation; only their number matters.
- An event with no parameters can be written `Start()` or `Start`.

Two interfaces, `Net` and `Rounds`, are predefined (see [Provided modules](#provided-modules)). You cannot redefine or implement them.

## Algorithms

```text
algorithm Name
  implements Interface as alias
  uses OtherInterface as other          // zero or more
  uses PerfectLinks as pl via AckLinks  // "via" picks the implementation
  params
    f := 1                              // evaluated once per process
  state
    seen := ∅                           // one copy per process
    stable total := 0                   // survives a crash and recovery
  function helper(x) … end              // zero or more, anywhere after state
  upon event ⟨alias, Init⟩ do … end     // handlers
end
```

**`implements`** names the interface this algorithm provides and the local name under which it receives requests and emits indications.

**`uses`** names an interface this algorithm relies on and the local name to talk to it. Each `uses` creates its own instance of the chosen algorithm.

**`params`** are constants. Their initial expressions can use built-in names and earlier parameters. They cannot be assigned.

**`state`** variables belong to each process. Their initial expressions can use built-in names and parameters. `stable` variables keep their value across a crash and a recovery; the others are reset (see [Faults](faults.md#recovery)).

Every name in `params` and `state` must differ from the built-in names and from each other.

## Handlers

A handler runs when its trigger matches. There are three kinds.

### Event handlers

```text
upon event ⟨instance, Event | pattern, pattern⟩ do … end
upon event ⟨instance, Event | pattern⟩ where condition do … end
```

`instance` is one of:

- the `implements` alias: the handler receives **requests** from above, or `Init` and `Recovery`;
- a `uses` alias: the handler receives **indications** from below;
- `timer`: the handler receives `Timeout` (see [Timers](#timers)).

When an event arrives, handlers are tried **in the order they appear in the code**. The first one whose patterns match and whose `where` condition is true runs; the others are skipped. If none matches, the event is ignored and a warning is logged once. `Init`, `Recovery`, `RoundStart` and `RoundEnd` without a handler are ignored silently.

A common idiom uses two handlers with opposite conditions:

```text
upon event ⟨net, Deliver | p, [DATA, m]⟩ where m ∉ seen do … end
upon event ⟨net, Deliver | p, [DATA, m]⟩ where m ∈ seen do skip end
```

### Condition handlers

```text
upon condition expression do … end
```

The handler runs whenever the expression is true, checked after every step of the process. Its body must make the condition false, directly or indirectly; a condition that stays true forever stops the run with an error.

### Exists handlers

```text
upon exists x in collection where condition do … end
```

The handler runs for the first element of the collection, in sorted order, that satisfies the condition, with that element bound to `x`. It is checked after every step, like a condition handler, and is the natural way to write "when some pending message can be delivered":

```text
upon exists e in pending where e[1] = next do
  pending := pending \ {e}
  next := next + 1
  trigger ⟨app, Deliver | e[0], e[2]⟩
end
```

When several condition or exists handlers of a module are enabled, they take turns.

## Patterns

Patterns appear in event handlers, one per event parameter.

| Pattern | Matches |
|---|---|
| `x` (a new name) | anything, and binds it to `x` |
| `x` (a name already known) | a value equal to the variable, parameter or built-in `x` |
| `HELLO` (an atom) | the atom `HELLO` |
| `42`, `-1`, `"text"`, `true`, `nil` | that exact value |
| `_` | anything, without binding |
| `[A, b, _]` | a tuple of exactly three elements matching the three patterns |

The same new name used twice must match equal values: `⟨net, Deliver | p, [ECHO, p]⟩` only matches when the message echoes its own sender.

In `⟨timer, Timeout | t⟩`, `t` is the name of a timer, not a variable (see [Timers](#timers)).

## Statements

| Statement | Effect |
|---|---|
| `x := e` | assigns a state variable, or creates a local variable |
| `m[k] := e`, `t[i] := e` | updates one entry of a map or tuple |
| `trigger ⟨inst, Event \| a, b⟩` | sends an event down or up |
| `if c then … elif c then … else … end` | conditional |
| `forall x in c do … end` | loop over a collection |
| `forall x in c where cond do … end` | loop over the elements that satisfy `cond` |
| `while c do … end` | loop while `c` holds |
| `starttimer(t, d)` | starts or restarts timer `t` with duration `d` |
| `canceltimer(t)` | cancels timer `t` |
| `call f(a, b)` | calls one of your functions and ignores the result |
| `return e`, `return` | leaves a function (only inside functions) |
| `assert c, "message"` | logs a failed assertion if `c` is false |
| `log a, b, c` | writes a line to the event log |
| `skip` | does nothing |

**Local variables.** Assigning a name that is not a state variable creates a local variable, visible until the end of the handler or function. Reading it before the assignment is a runtime error. Loop variables and pattern variables are local too.

**Triggers are asynchronous within the process.** `trigger` puts the event in a queue; it is handled after the current handler finishes, within the same step. Code after a `trigger` does not see the effects of the event.

**`forall`** evaluates the collection once, before the loop starts. Assigning the collection inside the loop does not change the iteration.

**`assert`** does not stop the run unless *Stop at the first failed assertion* is checked in the *Scenario* tab.

**`log`** prints strings as they are and other values in their written form, separated by spaces.

## Expressions

From lowest to highest precedence:

| Level | Operators |
|---|---|
| or | `or`, `∨` |
| and | `and`, `∧` |
| not | `not`, `¬` |
| comparison | `=`, `≠`, `<`, `≤`, `>`, `≥`, `∈`, `∉`, `⊆` |
| set | `∪`, `∩`, `\` |
| additive | `+`, `-` |
| multiplicative | `*`, `/`, `%` |
| unary | `-`, `#` |
| postfix | `x[i]`, `f(args)` |

Comparisons do not chain: write `a < b and b < c`, not `a < b < c`. To compare the result of a membership test, use parentheses: `(x ∈ S) = false`.

`and` and `or` are short-circuit and require booleans. `if`, `while`, `where` and conditions also require booleans; there is no truthiness.

| Operator | Works on |
|---|---|
| `+` | numbers; strings (with anything else converted to text); two tuples (concatenation) |
| `-`, `*`, `%` | numbers |
| `/` | numbers; between two integers the result is truncated |
| `∪`, `∩`, `\`, `⊆` | sets |
| `∈`, `∉` | an element of a set, of a tuple, or a key of a map |
| `#x` | the size of a set, map, tuple or string |
| `=`, `≠` | any two values, compared by content |
| `<`, `≤`, `>`, `≥` | any two values, with the order described in [Values](#values) |

Literals:

| Form | Value |
|---|---|
| `[a, b, c]` | a tuple |
| `{a, b}`, `∅`, `{}` | a set |
| `{x in S where condition}` | the elements of `S` that satisfy the condition |
| `map()` | an empty map |

## Values

| Kind | Examples | Notes |
|---|---|---|
| nil | `nil` | the value of a missing map entry |
| boolean | `true`, `false` | |
| number | `3`, `0.5`, `50ms` | durations are numbers of microseconds |
| string | `"hello"` | |
| atom | `HELLO` | |
| tuple | `[DATA, 3, "x"]` | indexed from 0 |
| set | `{1, 2, 3}` | no duplicates, kept sorted |
| map | `m[k]` | keys and values of any kind |

All values are immutable. `m[k] := v` builds a new map and assigns it to `m`, so a copy taken earlier (`old := m`) does not change.

Values of different kinds are ordered as in the table: `nil` before booleans, booleans before numbers, and so on. Within a kind the order is the natural one; tuples, sets and maps compare element by element. This total order is what makes `min`, `max`, `sort`, `choose` and set iteration deterministic.

Process identifiers are numbers: `self` is `3` on process p3.

## Built-in names

| Name | Value | Available |
|---|---|---|
| `self` | this process's number | always |
| `Π`, `Procs` | the set of all processes | always |
| `N` | the number of processes | always |
| `neighbors` | processes this process has an outgoing link to | always |
| `round` | the current round | synchronous rounds only |
| `DELTA`, `PHI`, `RHO` | the synchrony constants | only when known in the assumed model |

`Π` contains every process, including those without a link to this one. Sending to a process that is not a neighbor drops the message.

## Built-in functions

**Collections**

| Function | Result | Errors |
|---|---|---|
| `size(c)` | number of elements of a set, map, tuple or string | |
| `min(c)`, `max(c)` | smallest or largest element of a set or tuple, or key of a map | empty collection |
| `choose(c)` | the smallest element: a deterministic choice | empty collection |
| `pick(c)` | a random element, from the process's seeded stream | empty collection |
| `keys(m)`, `values(m)` | set of keys, set of values | not a map |
| `get(m, k, d)` | `m[k]`, or `d` if missing; also works on tuples by index, and on `nil` | |
| `remove(c, x)` | the set or map without `x`, or the tuple without the first `x` | |
| `toset(c)` | the elements of a tuple or set, or the keys of a map, as a set | |
| `sort(c)` | the elements as a sorted tuple | |
| `argmin(m)`, `argmax(m)` | the key with the smallest or largest value; ties go to the smallest key | empty map |

**Sequences** (a set is treated as its sorted tuple)

| Function | Result | Errors |
|---|---|---|
| `head(t)`, `last(t)` | first or last element | empty |
| `tail(t)` | all but the first element | |
| `reverse(t)` | elements in reverse order | |
| `slice(t, a, b)` | elements from index `a` up to, not including, `b` | |
| `append(t, x)` | the tuple with `x` added at the end | not a tuple |
| `range(a, b)` | the tuple `[a, a+1, …, b-1]` | more than 100,000 elements |

**Numbers**

| Function | Result | Errors |
|---|---|---|
| `sum(c)`, `mean(c)` | sum or average of the numbers in a set or tuple, or of the values of a map | non-numbers; `mean` of nothing |
| `abs`, `floor`, `ceil`, `round` | as usual | |
| `sqrt(x)` | square root | negative `x` |
| `ln(x)`, `exp(x)`, `pow(x, y)` | natural logarithm, exponential, power | `ln` of a number ≤ 0 |
| `random(a, b)` | a random integer between `a` and `b`, both included | |

**Other**

| Function | Result |
|---|---|
| `now()` | the process's local clock, in microseconds (not in lockstep rounds) |
| `str(v)` | the written form of a value |

The logarithm is `ln`, because `log` is the statement that writes to the event log.

## Functions

```upon
interface Stats
  request Add(x)
  indication Summary(count, average, spread)
end

algorithm Collector
  implements Stats as s
  uses Net as net
  state
    samples := []

  function average()
    return mean(samples)
  end

  // standard deviation; mean() divides exactly, while "/" between
  // two whole numbers would truncate
  function spread()
    a := average()
    squares := []
    forall x in samples do
      squares := append(squares, pow(x - a, 2))
    end
    return sqrt(mean(squares))
  end

  function record(x)
    samples := append(samples, x)
    trigger ⟨s, Summary | #samples, average(), spread()⟩
  end

  upon event ⟨s, Add | x⟩ do
    call record(x)
  end
end
```

A function:

- belongs to one algorithm and can be called only from that algorithm;
- sees the algorithm's state, parameters and built-in names, but not the local variables of its caller;
- has its own local variables, starting with its parameters;
- may assign state, trigger events and start timers, exactly like a handler;
- returns the value of the first `return` it executes, or `nil` if it reaches the end;
- may call itself and other functions, up to 200 nested calls.

Use a function in an expression, `x := average()`, or as a statement with `call record(x)`. `call` is only for your own functions; built-in functions are used in expressions.

A function name cannot be the name of a built-in function.

## Timers

```text
starttimer(retry, 200ms)       // start, or restart, the timer named "retry"
canceltimer(retry)             // cancel it
upon event ⟨timer, Timeout | retry⟩ do … end
```

- Timer names are plain identifiers, local to the module. They are not variables.
- Starting a timer that is already running restarts it; only the latest start fires.
- The duration is measured on the process's **local clock**, so drift changes the real duration slightly.
- In the `Timeout` handler, the pattern is the timer's name. `⟨timer, Timeout | _⟩` catches every timer of the module.
- A recovery cancels every timer.
- Timers are not available with lockstep rounds; use `RoundStart` and `RoundEnd` there.

The checker warns about a `Timeout` handler for a timer the module never starts.

## Properties

A property is a global invariant: one boolean expression over the state of **every** process, checked by the engine. It lives at the top level of the program, next to interfaces and algorithms.

```upon
interface Consensus
  request Propose(v)
  indication Decide(v)
end

algorithm Simple
  implements Consensus as c
  uses Net as net
  state
    proposal := nil
    decision := nil

  upon event ⟨c, Propose | v⟩ do
    proposal := v
    decision := v
    trigger ⟨c, Decide | v⟩
  end
end

property Agreement always
  #toset(values(defined(decision))) ≤ 1
end

property Validity always
  #{p in keys(defined(decision)) where decision[p] ≠ proposal[p]} = 0
end

property Termination eventually
  keys(defined(decision)) = correct
end
```

**Inside a property, a state variable is a map from process to its value on that process**, taken from the main algorithm. `decision` above is `{1 ↦ 7, 2 ↦ nil, 3 ↦ 7}`, so `values(decision)` are the values across the system and `defined(decision)` keeps only the processes where the variable is not `nil`. Everything else is the ordinary expression language.

| Kind | Meaning | When it is checked |
|---|---|---|
| `always` | safety: the expression must be true at all times | after every step; the first moment it turns false is reported |
| `eventually` | liveness: the expression must become true at some point | after every step; the first moment it turns true is reported, and the property is satisfied from then on |

Besides state variables, a property can use:

| Name | Value |
|---|---|
| `Π`, `Procs` | the set of all processes |
| `N` | the number of processes |
| `crashed` | the processes that are down right now |
| `up` | the processes that are running right now |
| `correct` | the processes that never crashed in this run |
| `t` | the current time, in microseconds |
| `defined(m)` | the map `m` without the entries whose value is `nil` |

A property cannot use `self`, `neighbors`, `round`, `DELTA`, `PHI`, `RHO`, `now()`, `random` or `pick`: it looks at the whole system from outside, at one moment, and must not depend on chance. Only built-in functions are available; the functions of an algorithm are not.

**What the engine reports.** Each property ends the run as *held* or *broken*, with the instant and the process whose step made it fail. Broken properties appear in the event log under the *Properties* filter, are counted next to the other chips, and are listed by the [command line tool](cli.md). Setting `haltOnProperty` in the scenario stops the run at the first violation.

**Limits worth knowing.**

- Properties see the state of the **main algorithm** only. To observe a module further down the stack, expose what you need in the main algorithm.
- `eventually` can only say "it did not happen before the run ended". A longer simulated duration may change the answer; this is a check, not a proof. See [Assumptions and simplifications](assumptions.md#what-the-playground-is-not).
- A property is evaluated after every step, so a long run with several properties costs noticeably more than the same run without them.
- A property that is not a boolean, or that fails with a runtime error, is reported as broken with its error, and the run continues.

## Provided modules

### Net

```text
interface Net
  request Send(q, m)
  indication Deliver(p, m)
end
```

`Send(q, m)` sends `m` to process `q` over the link between them. `Deliver(p, m)` reports a message `m` from `p`. The network behaves as the actual model says: it can lose, duplicate, delay and reorder messages. See [The timing model](timing-model.md).

`Net` is available with every synchrony model except synchronous rounds.

### Rounds

```text
interface Rounds
  request Send(q, m)
  indication RoundStart(r)
  indication Deliver(p, m)
  indication RoundEnd(r)
end
```

In each round, a module that uses `Rounds` receives `RoundStart(r)`, then the messages of that round, then `RoundEnd(r)`. Send in `RoundStart`, collect in `Deliver`, decide in `RoundEnd`. The built-in `round` holds the current round number.

`Rounds` is available only with synchronous rounds. How rounds are executed is described in [The timing model](timing-model.md#rounds).

### timer

`timer` is not declared with `uses`: every module has it. It produces only `Timeout(t)`.

## Composing modules

A program can contain several algorithms. The **Main algorithm** selector in the *Code* tab chooses the top one; its interface defines the inputs you can send and the outputs you see.

For each `uses X as a`, the playground creates an instance of an algorithm that implements `X`:

- with `via Y`, the algorithm `Y`, which must implement `X`;
- otherwise, the first algorithm in the code that implements `X`. If there are several, a warning tells you which one was chosen.

Instances form a tree, one per process. Every `uses` creates its own instance, so two modules that use `PerfectLinks` get two independent copies with separate state.

A module talks only to its direct neighbors in the tree: it sends requests to the modules it uses and indications to the module that uses it. It never sees their state.

```upon
interface PerfectLinks
  request Send(q, m)
  indication Deliver(p, m)
end

interface Echo
  request Ping(q)
  indication Pong(p)
end

algorithm DirectLinks
  implements PerfectLinks as pl
  uses Net as net
  upon event ⟨pl, Send | q, m⟩ do
    trigger ⟨net, Send | q, m⟩
  end
  upon event ⟨net, Deliver | p, m⟩ do
    trigger ⟨pl, Deliver | p, m⟩
  end
end

algorithm Pinger
  implements Echo as e
  uses PerfectLinks as pl via DirectLinks
  upon event ⟨e, Ping | q⟩ do
    trigger ⟨pl, Send | q, [PING]⟩
  end
  upon event ⟨pl, Deliver | p, [PING]⟩ do
    trigger ⟨pl, Send | p, [PONG]⟩
  end
  upon event ⟨pl, Deliver | p, [PONG]⟩ do
    trigger ⟨e, Pong | p⟩
  end
end
```

Ready-made modules for links and broadcast are in the [module library](library.md).

## What the checker verifies

The checker runs while you type and again before every run. Errors stop the run; warnings do not.

**Errors**

- Syntax errors, with line and column.
- An interface used or implemented but not declared; implementing `Net` or `Rounds`; two algorithms or interfaces with the same name.
- `Rounds` without the synchronous rounds model, or `Net` with it.
- `DELTA`, `PHI` or `RHO` when unknown in the assumed model; `round` outside the rounds model; `now()` or `starttimer` in lockstep rounds.
- A variable that is not declared, not a parameter, not a built-in and not an atom.
- An assignment to a parameter or a built-in name; a state variable or parameter named like a built-in.
- A `trigger` to an unknown instance, an indication sent downwards, a request sent upwards, or the wrong number of arguments.
- A handler for an event that the instance cannot produce, or with the wrong number of patterns; `Init` or `Recovery` with patterns; a `timer` handler for anything but `Timeout(t)`.
- An unknown function, a call with the wrong number of arguments, `call` with a built-in function, `return` outside a function, a function with a built-in's name or a repeated parameter.
- In a property: two properties with the same name, a name that is not a state variable of any algorithm, and the names and functions that a property may not use.
- `uses … via Y` where `Y` does not exist or implements another interface; `via` with `Net` or `Rounds`.

**Warnings**

- An indication of a used module that no handler receives (its events will be ignored).
- A `Timeout` handler for a timer the module never starts.
- Timers in lockstep rounds.
- Several algorithms implementing an interface used without `via`.

## Runtime errors

Some problems can only be found while running. The run stops, keeps everything up to that point, and shows the line in the editor.

- A value of the wrong kind: `Expected a boolean, found number (3)`.
- An index outside a tuple, an indexed assignment on something that is not a map or tuple.
- Division by zero.
- `min`, `max`, `choose`, `pick`, `head`, `last`, `mean`, `argmin` or `argmax` of an empty collection.
- `sqrt` of a negative number, `ln` of a number that is not positive.
- A local variable read on a path where it was never assigned (`Variable "x" is not defined`).
- More than 200 nested function calls, more than 100,000 iterations of a `while` loop, more than 200,000 statements or 20,000 internal events in one step, a guard that stays true.

## ASCII syntax

Every symbol has a plain-text spelling, and you can mix both.

| Unicode | ASCII | | Unicode | ASCII |
|---|---|---|---|---|
| `⟨` `⟩` | `<` `>` | | `∈` `∉` | `in` `notin` |
| `∪` `∩` `\` | `union` `inter` `minus` | | `∅` | `{}` |
| `≠` `≤` `≥` | `!=` `<=` `>=` | | `∧` `∨` `¬` | `and` `or` `not` |
| `Π` | `Procs` | | `⊆` | `subseteq` |
| `←` | `:=` | | `∀` | `forall` |

With ASCII angle brackets, `>` inside a `trigger` would close the event. Wrap comparisons in parentheses there:

```text
trigger <app, Result | (x > 3)>
```

The symbol buttons above the editor insert the Unicode characters at the cursor.

## Common mistakes

**A handler never runs.** Handlers are tried in order and only the first match runs. An earlier, more general handler may be catching the event. Put the specific one first, or add `where` clauses.

**"Variable is not declared" for a message tag.** Atoms need at least two capital letters: `A` is a variable name, `AB` is an atom.

**A tag matches a variable instead.** If a state variable is called `DATA`, the pattern `[DATA, m]` compares with its value instead of the atom. Use lower-case names for variables.

**`5 / 2` gives 2.** Division between two whole numbers truncates, and a value such as `4.0` counts as whole. Use `mean` for averages, or multiply first (`100 * a / b`) when you need a percentage.

**Nothing arrives.** The recipient may not be a neighbor; check the topology, or look for *no link* in the event log.

**A broadcast reaches only some processes.** Library broadcast modules send to every process in `Π`, which requires a complete graph.

**A guard stops the run.** An `upon condition` handler must make its condition false. If it only sends a message, it will fire again at once.

**An algorithm works but depends on the order of a set.** Sets are iterated in sorted order and `choose` is deterministic here. Real systems give no such guarantee; try `pick` to see whether the algorithm still works.
