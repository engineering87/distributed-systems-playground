#!/usr/bin/env node
/* Distributed Systems Playground — command line tool.
   Runs the same engine as the browser, so a scenario exported from the page behaves identically here.
   No dependencies; Node 18 or later. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const C = require(join(here, '../src/core.js'));
const EX = require(join(here, '../src/examples.js'));
const R = require(join(here, '../src/runner.js'));

const USAGE = `Distributed Systems Playground

Usage:
  dsp run [scenario.json] [options]     run a scenario over one or more seeds
  dsp check [scenario.json] [options]   parse and check the code only
  dsp examples                          list the built-in examples
  dsp presets                           list the timing presets

Scenario:
  a JSON file exported from the playground, "-" to read it from standard input,
  or --example <key> to use a built-in example.

Options:
  --example <key>       start from a built-in example
  --seeds <spec>        1..50, or 3, or 1,4,9            (default: the scenario seed)
  --preset <key>        replace the timing model with a preset
  --set <path=value>    change one scenario field, repeatable
                        (--set actual.loss=0.3 --set stopAt=5s)
  --faults <plan>       add generated faults to every run, drawn from its seed:
                        crash:1, partition:1, pause:1, link:1, omission:1, recover:1
                        (combine them: --faults crash:1,partition:1)
  --fault-window <w>    when those faults happen, 0..3s by default
  --minimize            for each run that failed, shrink its generated schedule
                        to the faults that still produce the same failure
  --stop-on-failure     stop at the first run that fails or breaks a property
  --outcomes            group the runs by the outputs they produced
  --outputs             print the outputs of every run
  --json                print the result as JSON
  --quiet               print only the summary
  -h, --help            this text

Exit code: 0 when every run finished without errors, failed assertions or
compile errors; 1 otherwise; 2 for a usage or input error.
`;

function fail(msg, code) {
  process.stderr.write(msg + '\n');
  process.exit(code === undefined ? 2 : code);
}

function parseArgs(argv) {
  const out = { _: [], set: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { const v = argv[++i]; if (v === undefined) fail('Missing value for ' + a); return v; };
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--example') out.example = need();
    else if (a === '--seeds') out.seeds = need();
    else if (a === '--preset') out.preset = need();
    else if (a === '--faults') out.faults = need();
    else if (a === '--fault-window') out.faultWindow = need();
    else if (a === '--set') {
      const kv = need();
      const eq = kv.indexOf('=');
      if (eq < 1) fail('Expected --set path=value, found ' + kv);
      out.set[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if (a === '--minimize') out.minimize = true;
    else if (a === '--stop-on-failure') out.stopOnFailure = true;
    else if (a === '--outcomes') out.outcomes = true;
    else if (a === '--outputs') out.outputs = true;
    else if (a === '--json') out.json = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a.startsWith('-')) fail('Unknown option: ' + a);
    else out._.push(a);
  }
  return out;
}

function loadScenario(args) {
  if (args.example) {
    const ex = EX.EXAMPLES.find(e => e.key === args.example);
    if (!ex) fail('Unknown example: ' + args.example + '\nAvailable: ' + EX.EXAMPLES.map(e => e.key).join(', '));
    return JSON.parse(JSON.stringify(ex.scenario));
  }
  const path = args._[1];
  if (!path) fail('Give a scenario file, "-" for standard input, or --example <key>.\n\n' + USAGE);
  let text;
  try { text = path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8'); }
  catch (e) { fail('Cannot read ' + path + ': ' + e.message); }
  try { return JSON.parse(text); }
  catch (e) { fail('Invalid JSON in ' + path + ': ' + e.message); }
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function printRuns(res, args) {
  const head = ['seed', 'status', 'events', 'msgs', 'lost', 'viol', 'outputs', 'time'];
  const widths = [6, 26, 8, 7, 6, 6, 8, 10];
  process.stdout.write(head.map((h, i) => pad(h, widths[i])).join('') + '\n');
  for (const r of res.runs) {
    const broken = r.properties.filter(p => !p.ok);
    const status = !r.ok ? (r.compileErrors.length ? 'compile error' : 'error')
      : broken.length ? broken.map(p => p.name).join(', ') + ' broken'
        : r.assertions ? r.assertions + ' assertion(s)'
          : r.violations ? 'ok, ' + r.violations + ' violation(s)' : 'ok';
    process.stdout.write([padL(r.seed, 6), ' ' + pad(status, widths[1] - 1), padL(r.eventCount, 7) + ' ',
      padL(r.messages, 6) + ' ', padL(r.lost, 5) + ' ', padL(r.violations, 5) + ' ',
      padL(r.outputCount, 7) + ' ', padL(C.fmtDuration(r.endT), 9) + ' '].join('') + '\n');
    if (r.error) process.stdout.write('       ' + r.error + (r.errorLine ? ' (line ' + r.errorLine + ')' : '') + '\n');
    for (const e of r.compileErrors) process.stdout.write('       line ' + e.line + ': ' + e.msg + '\n');
    if (r.faults.length && (broken.length || !r.ok || r.assertions)) {
      process.stdout.write('       faults: ' + r.faults.map(R.describePlanFault).join('; ') + '\n');
    }
    for (const p of broken) {
      process.stdout.write('       property ' + p.name + ': ' +
        (p.error ? p.error : p.kind === 'always' ? 'violated at ' + C.fmtDuration(p.at) + ' on p' + p.node : 'never held') + '\n');
    }
    if (args.outputs) for (const o of r.outputs) process.stdout.write('       ' + padL(C.fmtDuration(o.t), 9) + '  p' + o.node + '  ' + o.text + '\n');
  }
}

function printSummary(res) {
  const s = res.summary;
  const line = [s.runs + ' run(s)', s.failed + ' failed', s.withAssertions + ' with failed assertions',
    s.withViolations + ' with violations'].join(', ');
  process.stdout.write(line + '\n');
  process.stdout.write(['average per run:', s.avgEvents + ' events', s.avgMessages + ' messages',
    s.avgLost + ' lost', s.avgViolations + ' violations', s.avgOutputs + ' outputs'].join('  ') + '\n');
  for (const p of s.properties) {
    process.stdout.write('property ' + pad(p.name, 16) + pad('(' + p.kind + ')', 14) + 'held in ' + p.held + '/' + (p.held + p.failed) + ' run(s)' +
      (p.firstFailure !== null ? ', first broken at seed ' + p.firstFailure : '') + '\n');
  }
  if (s.firstFailure !== null) process.stdout.write('first failing seed: ' + s.firstFailure + '\n');
  if (s.firstAssertion !== null) process.stdout.write('first seed with a failed assertion: ' + s.firstAssertion + '\n');
  if (s.firstViolation !== null) process.stdout.write('first seed with a violation: ' + s.firstViolation + '\n');
  process.stdout.write('took ' + res.ms + ' ms\n');
}

function printOutcomes(res) {
  const groups = R.outcomes(res.runs);
  process.stdout.write('\noutcomes (' + groups.length + ' distinct):\n');
  for (const g of groups) {
    const shown = g.values.slice(0, 6).join(' | ') + (g.values.length > 6 ? ' | …' : '');
    process.stdout.write('  ' + padL(g.count, 4) + ' run(s)  seeds ' + g.seeds.join(', ') + (g.count > g.seeds.length ? ', …' : '') +
      '\n           ' + (shown || '(no output)') + '\n');
  }
}

function cmdRun(args) {
  const scenario = loadScenario(args);
  let res;
  try {
    res = R.runBatch(scenario, {
      seeds: args.seeds, preset: args.preset, set: args.set, stopOnFailure: args.stopOnFailure,
      faults: args.faults, faultWindow: args.faultWindow
    });
  } catch (e) { fail(e.message); }
  if (args.minimize) {
    for (const r of res.runs) {
      if (!r.faults.length || (r.ok && !r.propertyFailures && !r.assertions)) continue;
      const m = R.minimize(res.scenario, { seed: r.seed, faults: r.faults });
      r.minimized = m.ok ? m.faults : null;
      if (m.ok && !args.json) {
        process.stdout.write('seed ' + r.seed + ': ' + m.faults.length + ' of ' + r.faults.length +
          ' fault(s) are enough (' + m.runs + ' runs)\n');
        for (const f of m.faults) process.stdout.write('       ' + R.describePlanFault(f) + '\n');
      }
    }
  }
  if (args.json) {
    process.stdout.write(JSON.stringify({ summary: res.summary, runs: res.runs, ms: res.ms }, null, 2) + '\n');
  } else {
    if (!args.quiet) { printRuns(res, args); process.stdout.write('\n'); }
    printSummary(res);
    if (args.outcomes) printOutcomes(res);
  }
  const bad = res.summary.failed > 0 || res.summary.withAssertions > 0 || res.summary.withPropertyFailures > 0;
  process.exit(bad ? 1 : 0);
}

function cmdCheck(args) {
  const scenario = loadScenario(args);
  const res = R.checkScenario(scenario);
  if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    for (const e of res.errors) process.stdout.write('error' + (e.line ? ' line ' + e.line : '') + ': ' + e.msg + '\n');
    for (const w of res.warnings) process.stdout.write('warning: ' + w + '\n');
    process.stdout.write(res.ok ? 'No errors: the code is consistent with the assumed model.\n' : res.errors.length + ' error(s)\n');
  }
  process.exit(res.ok ? 0 : 1);
}

function cmdExamples() {
  for (const ex of EX.EXAMPLES) {
    process.stdout.write(pad(ex.key, 22) + pad(ex.scenario.assumed.timing, 22) + ex.title + '\n');
  }
}

function cmdPresets() {
  for (const [key, p] of Object.entries(EX.PRESETS)) {
    process.stdout.write(pad(key, 14) + pad(p.label, 26) + p.assumed.timing + '\n');
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (args.help || !cmd) { process.stdout.write(USAGE); process.exit(args.help ? 0 : 2); }
else if (cmd === 'run') cmdRun(args);
else if (cmd === 'check') cmdCheck(args);
else if (cmd === 'examples') cmdExamples();
else if (cmd === 'presets') cmdPresets();
else fail('Unknown command: ' + cmd + '\n\n' + USAGE);
