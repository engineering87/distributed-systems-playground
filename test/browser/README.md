# Browser suites

These check the application itself: the controls, the visuals, the layouts and the defenses. The Node suites
(`npm test`) cover the engine, the runner, the documentation and the language; everything that needs a page
lives here.

## Running them

```sh
pip install playwright
playwright install chromium
python test/browser/run_all.py              # every suite
python test/browser/run_all.py commands     # one of them
```

They run on Chromium by default. `DSP_BROWSER=firefox` or `DSP_BROWSER=webkit` runs the same suites on the
other engines, once the browser is installed (`playwright install firefox webkit`). CI runs Chromium on every
push and the other two on the main branch.

They run against `index.html` in the repository, so build first if you changed anything in `src/`:

```sh
npm run build && python test/browser/run_all.py
```

`DSP_INDEX` points them somewhere else (another file, or a URL), `DSP_OUT` chooses where screenshots and
downloaded files go (`test/browser/out` by default, which is not committed).

## The suites

| Suite | What it checks |
|---|---|
| `commands` | every control of the interface: examples, tools, generators, properties panel, tabs, forms, playback, diagram, log, shortcuts, import and export, shared links, storage |
| `features` | the module library, the stack view, layer colors and the causality mode |
| `extras` | settings, themes, the palette for color vision deficiency, the Italian interface, presentation mode, the welcome tour, the gallery and image export |
| `editor` | completion of instances, events and names, and the quick fixes offered by the diagnostics |
| `props` | global properties: counters, the log filter, the diagnostics and the translation |
| `faults` | one-way link failures, process pauses and omissions: form, log, drawing and injection at the cursor |
| `batch` | running a scenario over many seeds: workers, progress, results, opening a seed, stopping |
| `profile` | the behaviour profile: the grid of conditions, the table, and opening a failing seed |
| `about` | the about dialog: version, author, external links and its Italian version |
| `a11y` | names of the controls, landmarks, keyboard focus, dialogs and colour contrast in both themes |
| `security` | markup typed in the editor, prototype pollution from imports, links and storage, what a saved file contains, and what an exported image may carry |
| `touch` | a phone: taps, dragging a process, scrolling over the graph, target sizes and dialogs |
| `layout` | eleven screen sizes, from 320×640 to 2560×1440: overflow, clipping and touch target sizes |
| `perf` | frames per second and long tasks during playback, including a complete graph of 40 processes |

`layout` and `perf` report measurements: the runner does not fail on their numbers, but it prints them.

`touch` checks real gestures through a CDP session, which only Chromium offers; on Firefox and WebKit it runs
the taps and the sizes and skips the gestures. `touch` and `layout` also ask for a mobile context, which Firefox
does not support: `common.context_args()` drops that one option there and keeps the viewport and the touch
support. Every suite prints the checks that passed even when a later
step throws, so a failure still shows how far it got.

## Writing a new one

Start from an existing file. Keep the shape: a list of `check(condition, message)` calls, a `print` of the
page errors at the end, and no assumption about where the file is run from (`common.py` resolves paths).

Two habits keep a suite from breaking on a machine or an engine that is not yours: never assume a fixed
cursor position or a fixed instant — look for the moment you need — and never assume that something slow is
still running when you come back to it.
