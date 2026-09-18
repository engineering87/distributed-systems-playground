# Contributing

Thanks for your interest. Bug reports, examples, library modules, documentation fixes and interface improvements are all welcome.

## Setting up

You need Node.js 18 or later and nothing else: the project has no dependencies.

```sh
git clone https://github.com/engineering87/distributed-systems-playground.git
cd distributed-systems-playground
npm test
```

Open `index.html` in a browser to use the application.

## How the code is organized

| File | Content | Rule |
|---|---|---|
| `src/core.js` | lexer, parser, checker, interpreter, simulation engine, causal cone | no access to the page, so it runs under Node |
| `src/runner.js` | batch runs over many seeds | no access to the page, so it runs under Node |
| `bin/dsp.mjs` | command line tool | no dependencies; every command covered by a test |
| `src/library.js` | library modules written in Upon | each module documented and tested |
| `src/examples.js` | example scenarios and timing presets | each example documented and tested |
| `src/ui.js` | interface and animation | |
| `src/i18n.js` | Italian translation of the interface | add a translation for every new interface text |
| `src/style.css` | styles for both themes | check light and dark |
| `src/template.html` | page structure | |
| `scripts/build.mjs` | bundles `src/` into `index.html` | |
| `scripts/build-docs.mjs` | generates the documentation site in `manual/` | no dependencies; supports the Markdown used in `docs/` |
| `test/` | tests for the engine, the library, the examples and the documentation | |
| `docs/` | documentation | see [Writing documentation](#writing-documentation) |

`index.html` and `manual/` are generated but committed, so that GitHub Pages can serve the repository as it is. After changing anything in `src/` or `docs/`:

```sh
npm run build
npm test
npm run check
```

CI runs the tests and `npm run check`, which fails if `index.html` or `manual/` does not match the sources.

## Making changes

**Engine.** Keep runs deterministic: every random choice must come from a named stream, and the order in which a stream is consumed must not depend on events that happen later (see [How the engine works](docs/engine.md#randomness-and-determinism)). Add a test for any change in behavior. If the change affects what the simulator models, update [Assumptions and simplifications](docs/assumptions.md).

**Language.** New syntax needs a parser rule, checker rules with clear messages, interpreter support, tests, an entry in [the language reference](docs/language.md), and the grammar in [the specification](docs/SPEC.md#52-grammar-ebnf).

**Library modules.** Follow the steps in [Writing your own](docs/library.md#writing-your-own). The test must check the module's guarantee under the conditions it is meant to survive. Document every difference from the textbook version.

**Examples.** Add the scenario to `src/examples.js`, a test that checks what the example is meant to show, and a section in [Examples](docs/examples.md). Quote only numbers you obtained from the engine with the stated seed.

**Interface.** Every new text shown to the user needs an Italian translation in `src/i18n.js`: an exact phrase, or a pattern when the text contains numbers or names. The test suite checks the texts of examples, presets and library modules. Check the change at a narrow width (about 375 pixels), on a laptop screen (1280 by 720) and on a large monitor, in both themes, with mouse and with touch emulation. Keep keyboard access working.

## Writing documentation

The documentation is part of the product. A few rules keep it useful.

**Be exact.** Every behavior described must match the code. When you quote a result, run it and state the seed. Programs in `upon` code blocks are compiled by the test suite; use `text` blocks for fragments.

**Say what is simplified.** If a feature approximates reality or departs from a textbook, say so where it is described and add it to [Assumptions and simplifications](docs/assumptions.md).

**Write for someone learning.** Explain why before how. Prefer a concrete example to an abstract rule. Use the second person and the present tense.

**Keep the tone plain.** Short sentences, common words, no marketing. Avoid filler openings ("In this section we will…"), stacked adjectives, rhetorical questions, and phrases such as "powerful", "seamless" or "it's worth noting". Do not use emoji. Use bold for terms being defined and for controls the reader must find, not for emphasis in general.

**Link rather than repeat.** Each fact should live in one place. Relative links and anchors are checked by the test suite.

**Write in English**, with American spelling.

## Changelog

Add a line under *Unreleased* in [CHANGELOG.md](CHANGELOG.md) for every change a user would notice.

## Reporting a problem

Please include:

- what you did and what you expected;
- what happened instead, with the status message or the error;
- the exported scenario (JSON or link), which reproduces the run exactly;
- browser and operating system, for interface problems.

## License

By contributing you agree that your contributions are released under the [MIT License](LICENSE).
