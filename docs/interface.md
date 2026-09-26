# The interface

A tour of every panel and control. For a guided first session, see [Getting started](getting-started.md).

## Contents

- [Layout](#layout)
- [Top bar](#top-bar)
- [Topology](#topology)
- [Code tab](#code-tab)
- [Timing tab](#timing-tab)
- [Scenario tab](#scenario-tab)
- [State tab](#state-tab)
- [Stack tab](#stack-tab)
- [Playback](#playback)
- [Space-time diagram](#space-time-diagram)
- [Event log](#event-log)
- [Reading the animation](#reading-the-animation)
- [Saving and sharing](#saving-and-sharing)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Settings](#settings)
- [Presentation mode](#presentation-mode)
- [Welcome tour](#welcome-tour)
- [Screens and devices](#screens-and-devices)

## Layout

| Area | Position on a wide screen | Content |
|---|---|---|
| Top bar | top | examples, seed, run, export and import |
| Topology | top left | the graph and its animation, editing tools, properties of the selection |
| Side panel | top right | *Code*, *Timing*, *Scenario*, *State* and *Stack* tabs |
| Run | bottom | playback controls, summary, space-time diagram, event log |

On screens narrower than 960 pixels the areas stack in one column: graph, run, side panel.

## Top bar

- **Example** loads a ready-made scenario and runs it. The notification that appears offers **Undo**, which restores what you had before. See [Examples](examples.md).
- **Gallery** shows the same examples as cards, with a thumbnail of the topology, a short description, the topic and the timing model. The buttons above the cards filter by topic.
- **?** lists the keyboard shortcuts; **ⓘ** shows the project, its author and the version you are running; **⚙** opens the [settings](#settings).
- **Seed** fixes every random choice of the run. The same scenario with the same seed always gives the same run.
- **⚄** picks a random seed and runs again.
- **Run** simulates the current scenario. It is highlighted when the scenario has changed since the last run.
- **Export** and **Import** are described under [Saving and sharing](#saving-and-sharing).

## Topology

### Tools

| Tool | Click on empty space | Click on a process | Click on a link |
|---|---|---|---|
| **Select** | clears the selection | selects it; drag to move it | selects it |
| **Node** | adds a process | selects it | |
| **Link** | cancels | first click chooses the source, second the destination | |
| **Delete** | | deletes it with its links and faults | deletes it |

**Directed** makes new links one-way. A pair of opposite directed links is drawn as two curves.

**Generate** replaces the topology with a ring, complete graph, star, grid, line, random connected graph or binary tree with the given number of processes (2 to 40). *Ring*, *star*, *line* and *tree* respect **Directed**.

**Fit** zooms the graph to its processes.

**Labels** shows the type of each message on its packet.

**Layers** colors packets and diagram arrows by the module that originated them, and replaces the color legend with a list of those modules.

Changing the topology discards the last run. Moving processes does not.

### Properties bar

The bar under the graph shows the selection.

**A process:** its neighbors, the number of faults that concern it, and **Delete**. After a run it also offers, at the cursor time:

- **Inject event**: send a request of the main algorithm, with arguments written in Upon, for example `"hello"` or `2, [PING]`;
- **Crash here**, or **Recover here** if the process is down at the cursor;
- **Isolate here**: cut the process off from all others for the given duration, or for good if the field is empty.

**A link:** *Enabled* (unchecked means the link is down for the whole run), *Directed*, its own *Loss* and *Delay* (empty means the global value), and **Delete**. After a run it also offers **Cut here**, which takes the link down for the given duration from the cursor.

**A message** (click a packet, or an arrow on the diagram): sender, recipient, payload, status, send and arrival times, and buttons to jump to the send or the arrival.

Every *here* action adds an input or a fault to the scenario, re-runs, and continues from the cursor. The history before the cursor stays the same. See [How the engine works](engine.md#randomness-and-determinism).

## Code tab

- **Main algorithm** chooses the top of the module stack. Its interface decides which inputs you can send and which outputs appear.
- **Add module** inserts a module from the [library](library.md), with what it depends on. A short description of the module appears below.
- **Symbol buttons** insert `⟨ ⟩ ∪ ∩ \ ∈ ∉ ∅ ≠ ≤ ≥ Π ⊆` at the cursor.
- **Editor.** `Tab` inserts two spaces; `Enter` keeps the indentation and adds a level after `do`, `then`, `else`, `state`, `params`, `interface` and `algorithm` lines.
- **Diagnostics** under the editor list errors (red) and warnings (amber), updated as you type. Click one to jump to its line, or press the button on its right to apply a quick fix. Runtime errors from the last run appear here too. Completion appears as you type a name and on `Ctrl` + `Space`; both are described in [Writing help](language.md#writing-help).
- **Language quick reference** summarizes the syntax. The full reference is [The Upon language](language.md).

## Timing tab

- **Presets** set the whole timing model at once. Editing any field afterwards shows *Custom*.
- **Assumed model:** synchrony, `DELTA`, `PHI`, `RHO`, round execution and what to do when reality exceeds the assumption.
- **Actual model:** delays with a live histogram, bound, FIFO, spikes, loss, duplication, step duration, clock offset and drift, GST, and the order of simultaneous events.

Invalid values are outlined in red with an explanation. The histogram line reports the median, the 99th percentile and the share of messages above `DELTA`.

Everything is explained in [The timing model](timing-model.md).

## Scenario tab

- **External inputs**, one per line: `TIME NODE Event | arguments`. `NODE` is a number or `*` for every process. Arguments are Upon expressions evaluated on the target process. Lines added with **Inject event** appear here.
- **Faults**: the list of scheduled faults, each with **Remove**, and a form to add crashes, recoveries, pauses, omissions, link failures and partitions. **Draw** adds a random schedule of the kinds you name, within the window you give; **Redraw** replaces the current faults with another one. See [Faults](faults.md).
- **Run over many seeds**: the same scenario, one run per seed, in the background. See [Batch runs](#batch-runs).
- **Simulated duration**: when the run stops at the latest.
- **Stop at the first failed assertion**: turns `assert` into a hard stop.

### Batch runs

*Run over many seeds* in the *Scenario* tab answers the question a single run cannot: does this hold in general?

Write the seeds as `1..50`, `7`, or `1,4,9`, press **Run over seeds**, and the runs happen in the background: the page stays usable while they go.

The three fields (**Seeds**, **Faults per run**, **Window**) are the *suite* of the scenario: they are saved with it, so a scenario opened again, shared as a link or handed to somebody else runs the same batch. From a terminal, `dsp run scenario.json --suite` uses exactly those.

**Faults per run** adds a generated schedule to every run, drawn from its seed: `crash:1`, `partition:1`, `pause:1`, `link:1`, `omission:1`, `recover:1`, or several separated by commas. **Window** says when they happen. The schedule of a run that had a problem is shown next to its seed, and opening that seed adds exactly those faults to the scenario, so the failure is in front of you, reproducible and editable. The panel reports, as results arrive:

- how many runs finished and how many had a problem;
- for each declared [property](language.md#properties), in how many runs it held and the first seed that broke it;
- a list of the runs with a problem, or of all of them when there is none.

**Behaviour profile** runs the same algorithm over a grid of fault conditions, one row each: no faults, one crash, two crashes, crash and recovery, a pause, a partition, overlapping partitions, link failures, omissions, a zone crashing. A sentence above the table says what the algorithm holds under and what breaks it, and **Copy report** puts the whole profile on the clipboard as Markdown. Each row carries a verdict (● held, ◐ held with fewer processes reporting, ✕ something broke), how often each property held, the average messages, the reach as a bar, the median time of the last output, and a button to open a failing seed. It is the quickest answer to "what does this algorithm survive".

Runs that failed with more than one generated fault also offer **minimize**: it shrinks the schedule to the faults that still produce the same failure, usually turning four into one, and shows the result in place.

Click a seed to load that run in the page, with everything in place to watch what happened. **Stop** ends a batch early.

The runs use Web Workers, as many as a few cores allow, each with its own copy of the engine. Where a browser does not allow them, for example when the page is opened from disk in some configurations, the batch falls back to running one seed at a time on the page, still without freezing it.

The same thing from a terminal, with exit codes for continuous integration, is in [Running scenarios outside the browser](cli.md).

## State tab

Select a process to see, at the cursor time:

- whether it is running, since when it is down, or when it last recovered;
- its local clock, clock offset and drift, and its round if rounds are used;
- the variables of each module instance, labelled with the instance path (such as `app/rb/beb`) and the algorithm name. Values that changed in the latest step are highlighted;
- its latest outputs.

## Stack tab

Shows the module tree of a process: the application on top, the modules in the middle, the network at the bottom.

- Blue arrows are requests going down, green arrows are indications coming up. The latest group of events of the process is always shown; older ones fade out.
- The number in a box counts the events that module has received so far.
- Box borders use the same colors as **Layers**.
- Below the drawing, the latest fourteen events of the process are listed with their direction and arguments. `⏱` marks a timeout.

Choose the process with the menu at the top, or by selecting it on the graph. Step through a run with **Event by event** to follow a message from the network up to the application.

## Playback

| Control | Effect |
|---|---|
| ⏮ ⏭ | go to the start or the end of the run |
| ◀ ▶\| | previous or next moment when something happens |
| ▶ | play or pause |
| Speed | *Event by event* animates each step at a constant pace; *Auto speed* plays the interesting part of the run in about 25 seconds; the other values are simulated time per real second |
| Autoplay | start playing after every run |
| Scrubber | move to any time |

Playback stops shortly after the last message, output or fault, even if timers or rounds keep the run going. **End** and the *All* view still reach the real end.

The summary shows messages sent, delivered and lost, violations and outputs.

## Space-time diagram

One horizontal line per process, time from left to right.

| Mark | Meaning |
|---|---|
| blue arrow | a delivered message |
| red arrow | a message that broke the assumed model |
| amber dashed arrow ending in a cross | a message lost or dropped |
| gray dashed arrow ending in a cross | a message that reached a crashed process |
| small cross on a line | a message dropped as it was sent: no link, or the link was down |
| light bar on a line | the process handling an event |
| green diamond with text | an output |
| red circle | a violation at that process |
| red square | a failed assertion or a runtime error |
| violet dashed line, cross, green circle | the process is down, the crash, the recovery |
| amber band on a process line | the process is paused |
| red shading | a partition (full height) or a link failure (between two rows) |
| dashed vertical lines, `r1`, `r2` | lockstep rounds |
| short ticks on a line | emulated round starts of that process |
| amber vertical line | GST |
| blue vertical line | the cursor |

**Interaction.** Click to move the cursor; click an arrow to select its message. Drag horizontally to pan. `Ctrl` + wheel zooms around the pointer. **−** and **+** zoom around the cursor, **Action** fits the interesting part of the run, **All** shows all of it. **Follow** keeps the cursor in view. **Future** shows events after the cursor, faded. Hovering an arrow shows the message.

**Causality.** With **Causality** checked, a click selects the nearest event of the clicked process and computes its causal cone. Blue shading covers what could have caused the event, amber shading what it could affect, and unrelated messages fade. A line above the diagram gives the counts, with **Clear**. On the graph, the origin gets a thick border, processes whose current events could still affect the origin are dashed blue, and processes the event has already reached are amber. The rules are in [Assumptions](assumptions.md#analysis-and-visualization).

## Event log

Entries in time order: inputs, outputs, faults, dropped messages, violations, broken properties, warnings, errors, `log` and failed `assert` statements. The chips above the diagram also count how many declared properties held. Entries after the cursor are faded, and the current one is highlighted.

Click an entry to move the cursor there. The filter shows one kind at a time. The log shows up to 3,000 entries per filter.

## Reading the animation

| On the graph | Meaning |
|---|---|
| blue packet | a message in transit |
| red packet | a message breaking the assumed model |
| amber packet | a message the network will drop |
| gray packet | a message to a process that is down |
| dashed outline on a packet | a duplicate |
| trail behind a packet | the path covered so far |
| expanding ring on a process | a message just arrived (red if late) |
| cross on a link | a message was dropped there |
| glow around a process | it is handling an event |
| ⏱ next to a process | a timeout fired |
| `r3` next to a process | its current round |
| bubble above a process | an output |
| text under a process | its latest output |
| dashed, crossed-out process | the process is down |
| dashed amber outline with ⏸ | the process is paused |
| violet or green flash | a crash or a recovery |
| dashed red link with ✂ | the link is interrupted |

Packets are placed on the part of the link away from the processes, so that labels stay readable. With more than 120 packets in flight, labels are hidden; with more than 200, trails too; at most 400 are drawn.

## Saving and sharing

**Automatic saving.** The scenario is saved in the browser after every change and restored when you come back. It stays on that browser only.

**Export** shows:

- the scenario as JSON, with **Copy JSON** and **Save file**;
- **images of the current view**: the space-time diagram as SVG or PNG (twice the screen resolution), and the graph as SVG. They show what is on screen at the cursor, with the current zoom, theme and colors, which makes them ready for slides and handouts;
- a **link** that contains the whole scenario, compressed. Opening it loads the scenario, even in a tab where the playground is already open.

**Import** accepts a JSON file or pasted JSON. The scenario is checked before loading; if it is not valid, nothing changes.

An exported scenario includes topology, code, main algorithm, timing model, inputs, faults, seed and duration. It does not include the run itself: the run is recomputed on opening, identically.

## Keyboard shortcuts

Shortcuts work everywhere except while typing in a text field.

| Key | Action |
|---|---|
| `Ctrl` / `Cmd` + `Enter` | run (also while typing) |
| `?` | list of shortcuts |
| `P` | presentation mode |
| `F` | full screen |
| `Page Up`, `Page Down` | previous or next event, as a clicker sends them |
| `Space` | play or pause |
| `←` `→` | previous or next event |
| `Home` `End` | start or end of the run |
| `V` `N` `L` `D` | Select, Node, Link, Delete tools |
| `Delete`, `Backspace` | delete the selected process or link |
| `Esc` | leave presentation mode, cancel a link in progress, or clear the selection |
| `Ctrl` + wheel on the diagram | zoom |

## Settings

The **⚙** button opens:

- **Theme**: follow the system, or always light, or always dark.
- **Colors**: the standard palette, or one based on the Okabe-Ito colors, easier to tell apart with a color vision deficiency. Messages keep their dash patterns in both, so status never depends on color alone.
- **Language**: English or Italian. The Italian setting translates the interface, including status messages, the event log and the tour. Code, diagnostics from the checker, the quick reference examples and the documentation stay in English.
- Buttons for presentation mode, keyboard shortcuts, the welcome tour, and the documentation.

Settings are saved in the browser.

## Presentation mode

Press `P`, or use the button in the settings. The side panel, the event log, the editing tools and the top bar controls are hidden; the graph and the diagram take the whole screen, with larger text and wider rows. The browser switches to full screen when it allows it.

`→`, `Page Down` and most presentation clickers move to the next event; `←` and `Page Up` go back. `Space` plays and pauses. `P`, `Esc` or the **Exit presentation** button leave the mode; leaving full screen by any other means leaves it too, since some browsers handle `Esc` themselves.

A tip for lessons: select *Event by event* speed and a process before entering, so that its state and the next steps are what the audience sees.

## Welcome tour

On the first visit, a short tour points at the graph, the code, the timing model, inputs and faults, **Run**, playback, the diagram and the gallery. Use **Next**, **Back** or the arrow keys, and **Skip** or `Esc` to close it. It does not open again unless you choose *Welcome tour* in the settings.

## Screens and devices

- **Desktop and laptop, 960 pixels wide or more:** the playground fills the window and only the panels scroll.
- **Tablets and phones:** one column, with the graph first. The page scrolls; a swipe on an empty part of the graph or the diagram scrolls it too. Dragging a process moves the process.
- **Touch:** controls are at least 40 pixels tall, and text fields use a 16-pixel font so that the browser does not zoom in.
- **Themes:** the playground follows the light or dark setting of your system.
