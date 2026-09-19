# Changelog

All notable changes to this project are listed here. Versions follow [semantic versioning](https://semver.org); while the major version is 0, minor versions may change behavior.

## [Unreleased]

Nothing yet.

## [0.9.0]

### Added
- One-way link failures: only the messages from the first process to the second are lost.
- Process pauses: a process handles nothing for an interval, then handles everything that queued up, with its state intact.
- Omission faults: a process drops a share of the messages it sends, receives, or both, without crashing.
- **Pause here** on a selected process, next to the other fault buttons, and the new fault types in the *Scenario* form.
- Pauses are drawn on the graph and on the space-time diagram, and reported in the *State* tab and in the event log.

## [0.8.2]

### Security
- The exported graph is built from an allowlist of SVG elements and attributes, and the exported diagram escapes every value it writes, instead of cleaning the result with regular expressions afterwards.

## [0.8.1]

### Security
- Downloads always use a non-renderable content type, so an exported image cannot be rendered by the page if its link is opened instead of downloaded.
- Exported SVG images are sanitized before leaving the page, and the graph export skips scriptable elements and attributes.

## [0.8.0]

### Added
- Global properties in Upon: `property <name> always|eventually <expression> end`, checked after every step over the state of every process, with the built-ins `crashed`, `up`, `correct`, `t` and the function `defined`.
- The FloodSet example declares agreement, validity and termination.
- Properties are reported in the event log (new *Properties* filter), among the counters, in the batch runner and by the command line tool, which exits with 1 when one breaks.

### Changed
- The FloodSet example stores its decision in a state variable, so that a property can observe it.

## [0.7.0]

### Added
- A batch runner (`src/runner.js`) that runs a scenario over many seeds without touching the page, with compact summaries and outcome grouping.
- A command line tool (`bin/dsp.mjs`) to run and check scenarios outside the browser, with exit codes for continuous integration.
- Documentation page: running scenarios outside the browser.

## [0.6.1]

### Security
- The CI workflow runs with read-only repository permissions.
- Downloaded scenario files are built from the application state instead of the text shown in the export dialog, and every download uses a generic content type.
- JSON from imported files, shared links and local storage is parsed without `__proto__`, `constructor` and `prototype` keys; stored settings are checked against their allowed values.
- Property paths used by form fields follow only own properties and refuse keys that could reach a prototype.
- The editor's syntax highlighting and line numbers are built as DOM nodes, so code is never interpreted as HTML.
- Translated blocks are restored from cloned nodes instead of re-parsed markup.

## [0.6.0]

### Added
- Logo, banner and social preview image.
- Settings menu: theme (system, light, dark), a palette for color vision deficiencies, interface language (English, Italian), presentation mode, keyboard shortcuts, welcome tour.
- Presentation mode for lectures: larger text, side panel hidden, remote clickers step through events.
- Welcome tour on the first visit.
- Export of the space-time diagram as SVG or PNG, and of the graph as SVG.
- Example gallery with thumbnails, topics and models.
- A browsable documentation site generated from `docs/` with no extra dependencies.
- Changelog, citation file, code of conduct, security policy, issue and pull request templates.

### Changed
- Packets slow down as they approach their destination.

## [0.5.1]

### Added
- Full user documentation in `docs/`: getting started, concepts, assumptions and simplifications, engine, timing model, faults, language, library, examples, interface, teaching, troubleshooting.
- `CONTRIBUTING.md` with writing guidelines.
- A test that compiles every Upon program in the documentation and checks every link and anchor.

### Fixed
- A fault injected at the cursor could change earlier history when duplication was enabled.
- Messages dropped in transit did not update the FIFO state of their channel.
- Duplicates of a message dropped in transit were not recorded.
- Inputs sent to a crashed process changed the random values received by the others.

### Changed
- The FloodSet example uses four processes and seed 5.

## [0.5.0]

### Added
- Upon: functions with `return` and `call`, explicit binding with `via`, twenty new built-in functions.
- Module library: stubborn, perfect and FIFO links; best-effort, reliable, uniform reliable, FIFO, causal and probabilistic broadcast.
- *Add module* menu.
- *Stack* tab showing requests and indications between modules.
- *Layers*: messages colored by the module that originated them.
- *Causality* mode with causal past and future of an event.
- Examples: reliable broadcast with a sender crash, causal broadcast, gossip.

## [0.4.0]

### Added
- Layouts for phones, tablets, laptops and large monitors; touch support.

### Changed
- Faster rendering of large runs.

### Fixed
- Malformed stored scenarios no longer break the application.
- Keyboard shortcuts work after clicking a checkbox.

## [0.3.0]

### Added
- Crash-recovery with `stable` variables, link failures and partitions over time.
- Fault injection at the cursor.
- Example: failure detector across a partition and a recovery.

## [0.2.0]

### Added
- Animated execution on the topology, event-by-event playback, event injection at the cursor.

### Changed
- The whole interface and documentation are in English.

## [0.1.0]

### Added
- First version: Upon language, discrete-event engine, parametric timing model, topology editor, space-time diagram, examples.
