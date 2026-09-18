/* Distributed Systems Playground — batch runner.
   Runs a scenario many times without touching the page: several seeds, several variants, compact summaries.
   Used by the command line tool, by the test suite, and (later) by the worker pool of the interface. */
(function (root) {
'use strict';

const C = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.SimCore;
const EX = (typeof module !== 'undefined' && module.exports) ? require('./examples.js') : root.SimExamples;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function clone(o) { return JSON.parse(JSON.stringify(o), (k, v) => (UNSAFE_KEYS.has(k) ? undefined : v)); }

// "actual.loss=0.3" style overrides, applied to a copy of the scenario
function applyOverride(scn, path, value) {
  const ks = String(path).split('.');
  if (ks.some(k => !k || UNSAFE_KEYS.has(k))) throw new Error('Invalid property path: ' + path);
  let a = scn;
  for (let i = 0; i < ks.length - 1; i++) {
    if (a[ks[i]] === null || typeof a[ks[i]] !== 'object') a[ks[i]] = {};
    a = a[ks[i]];
  }
  const last = ks[ks.length - 1];
  const n = Number(value);
  a[last] = (value === 'true' || value === 'false') ? value === 'true'
    : (value !== '' && Number.isFinite(n) && String(n) === String(value).trim()) ? n
      : value;
  return scn;
}

// seeds: [1, 2, 3] or "1..50" or { from, to }
function seedList(seeds) {
  if (Array.isArray(seeds)) return seeds.map(Number);
  if (typeof seeds === 'string') {
    const m = /^(\d+)\s*\.\.\s*(\d+)$/.exec(seeds.trim());
    if (m) return seedList({ from: +m[1], to: +m[2] });
    if (/^\d+(\s*,\s*\d+)*$/.test(seeds.trim())) return seeds.split(',').map(s => +s.trim());
    throw new Error('Invalid seed list: ' + seeds);
  }
  if (seeds && typeof seeds === 'object') {
    const from = +seeds.from, to = +seeds.to;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error('Invalid seed range');
    if (to - from > 10000) throw new Error('Too many seeds: ' + (to - from + 1));
    const out = [];
    for (let s = from; s <= to; s++) out.push(s);
    return out;
  }
  return [1];
}

// A compact view of one run: enough to compare runs, small enough to keep thousands of them.
function summarize(res, seed) {
  const msgs = res.msgs || [];
  const byStatus = {};
  for (const m of msgs) byStatus[m.status] = (byStatus[m.status] || 0) + 1;
  const outputs = (res.outputs || []).map(o => ({ t: o.t, node: o.node, ev: o.ev, args: o.args.slice(), text: o.text }));
  return {
    seed,
    ok: !res.error && (!res.compile || !res.compile.errors.length),
    error: res.error || null,
    errorLine: res.errorLine || null,
    compileErrors: res.compile ? res.compile.errors.map(e => ({ line: e.line, msg: e.msg })) : [],
    warnings: (res.warnings || []).slice(),
    stopReason: res.stopReason || null,
    endT: res.endT || 0,
    eventCount: res.eventCount || 0,
    messages: msgs.length,
    byStatus,
    delivered: byStatus.delivered || 0,
    lost: msgs.length - (byStatus.delivered || 0) - (byStatus.pending || 0),
    violations: res.violations || 0,
    assertions: (res.log || []).filter(e => e.kind === 'assert').length,
    outputs,
    outputCount: outputs.length,
    nodesWithOutput: new Set(outputs.map(o => o.node)).size
  };
}

// Runs the same scenario over several seeds. `onRun` is called with each summary as soon as it is ready,
// which lets a caller stream progress; returning false from it stops the batch.
function runBatch(scenario, opts) {
  opts = opts || {};
  const base = clone(scenario);
  for (const [path, value] of Object.entries(opts.set || {})) applyOverride(base, path, value);
  if (opts.preset) {
    const preset = EX.PRESETS[opts.preset];
    if (!preset) throw new Error('Unknown preset: ' + opts.preset + ' (available: ' + Object.keys(EX.PRESETS).join(', ') + ')');
    Object.assign(base, { assumed: clone(preset.assumed), actual: clone(preset.actual), violationPolicy: preset.violationPolicy, preset: opts.preset });
  }
  const seeds = seedList(opts.seeds !== undefined ? opts.seeds : base.seed || 1);
  const runs = [];
  const started = Date.now();
  for (const seed of seeds) {
    const scn = clone(base);
    scn.seed = seed;
    const summary = summarize(C.runSimulation(scn), seed);
    runs.push(summary);
    if (opts.onRun && opts.onRun(summary, runs.length, seeds.length) === false) break;
    if (opts.stopOnFailure && !summary.ok) break;
  }
  return { scenario: base, runs, summary: aggregate(runs), ms: Date.now() - started };
}

function aggregate(runs) {
  const n = runs.length || 1;
  const sum = k => runs.reduce((a, r) => a + r[k], 0);
  const failed = runs.filter(r => !r.ok);
  const withViolations = runs.filter(r => r.violations > 0);
  const withAssertions = runs.filter(r => r.assertions > 0);
  return {
    runs: runs.length,
    failed: failed.length,
    firstFailure: failed.length ? failed[0].seed : null,
    withViolations: withViolations.length,
    firstViolation: withViolations.length ? withViolations[0].seed : null,
    withAssertions: withAssertions.length,
    firstAssertion: withAssertions.length ? withAssertions[0].seed : null,
    avgMessages: +(sum('messages') / n).toFixed(1),
    avgDelivered: +(sum('delivered') / n).toFixed(1),
    avgLost: +(sum('lost') / n).toFixed(1),
    avgViolations: +(sum('violations') / n).toFixed(2),
    avgOutputs: +(sum('outputCount') / n).toFixed(1),
    avgEvents: Math.round(sum('eventCount') / n)
  };
}

// Groups the runs by the values the processes produced, which is the usual question asked of a batch:
// "did every run end the same way?". `pick` turns an output into the value to compare (its text by default).
function outcomes(runs, pick) {
  const key = pick || (o => o.text);
  const groups = new Map();
  for (const r of runs) {
    const values = r.outputs.map(key).sort();
    const k = JSON.stringify(values);
    if (!groups.has(k)) groups.set(k, { values, seeds: [], count: 0 });
    const g = groups.get(k);
    g.count++;
    if (g.seeds.length < 10) g.seeds.push(r.seed);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// Compile-only check, for a quick "does this program make sense in this model?"
function checkScenario(scenario) {
  const scn = clone(scenario);
  let prog;
  try { prog = C.parseProgram(scn.code || ''); }
  catch (e) { return { ok: false, errors: [{ line: e.line || null, msg: e.message }], warnings: [] }; }
  const assumed = scn.assumed || {};
  const known = {
    DELTA: assumed.DELTA && assumed.DELTA !== 'unknown' ? C.parseDuration(assumed.DELTA) : null,
    PHI: assumed.PHI && assumed.PHI !== 'unknown' ? C.parseDuration(assumed.PHI) : null,
    RHO: assumed.RHO && assumed.RHO !== 'unknown' ? Number(assumed.RHO) : null
  };
  const res = C.check(prog, { timing: assumed.timing || 'asynchronous', roundMode: (scn.actual && scn.actual.roundMode) || 'lockstep', known });
  return { ok: !res.errors.length, errors: res.errors.map(e => ({ line: e.line, msg: e.msg })), warnings: res.warnings.slice() };
}

const Runner = { runBatch, summarize, aggregate, outcomes, seedList, applyOverride, checkScenario };
if (typeof module !== 'undefined' && module.exports) module.exports = Runner;
else root.SimRunner = Runner;
})(typeof self !== 'undefined' ? self : this);
