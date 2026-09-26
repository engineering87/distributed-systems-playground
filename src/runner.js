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

// ---------------------------------------------------------------- generated fault schedules
// A plan such as "crash:1,partition:1" adds that many faults to every run of a batch, drawn from the seed of
// the run, so a scenario stays reproducible: the same seed and the same plan give the same schedule, and the
// schedule travels with the result, ready to be pasted back into the scenario.
const PLAN_TYPES = ['crash', 'recover', 'pause', 'partition', 'link', 'omission', 'zone'];

// "crash:2" asks for two of them; "crash:0.5/s" asks for a rate, and the faults arrive as a random process
// over the window, the way they do in a system nobody is watching.
function parsePlan(spec) {
  const plan = {};
  for (const part of String(spec).split(/[,\s]+/).filter(Boolean)) {
    const m = /^([a-z]+)(?::([\d.]+)(\/s)?)?$/.exec(part.toLowerCase());
    if (!m || !PLAN_TYPES.includes(m[1])) {
      throw new Error('Unknown fault plan: "' + part + '" (use ' + PLAN_TYPES.map(t => t + ':1').join(', ') + ', or a rate such as crash:0.5/s)');
    }
    const value = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid amount in "' + part + '"');
    const rate = !!m[3];
    if (!rate && !Number.isInteger(value)) throw new Error('"' + part + '" must be a whole number, or a rate such as ' + m[1] + ':' + value + '/s');
    const entry = plan[m[1]] = plan[m[1]] || { count: 0, rate: 0 };
    if (rate) entry.rate += value; else entry.count += value;
  }
  if (!Object.keys(plan).length) throw new Error('The fault plan is empty');
  return plan;
}
// how many of this kind this draw produces: the count asked for, plus the arrivals of a Poisson process
function amountOf(plan, kind, seconds, rnd) {
  const entry = plan[kind] || { count: 0, rate: 0 };
  let n = entry.count || 0;
  if (entry.rate > 0) {
    // inter-arrival times of a Poisson process with this rate, over the window
    for (let t = 0; ; ) {
      t += -Math.log(1 - rnd()) / entry.rate;
      if (t > seconds) break;
      n++;
      if (n > 200) break;
    }
  }
  return n;
}
// a duration drawn around a fraction of the window, never longer than the window itself
function drawSpan(win, rnd, share) {
  const span = win.to - win.from;
  const d = Math.round(-Math.log(1 - rnd()) * span * share);
  // exponential, but never so short that the fault cannot be noticed, and never longer than the window
  return Math.max(Math.round(span * 0.15), Math.min(span, d));
}

// "0..3s" or "3s" (meaning from 0)
function parseWindow(text) {
  const t = String(text || '0..3s').trim();
  const m = /^(?:(\S+)\s*\.\.\s*)?(\S+)$/.exec(t);
  if (!m) throw new Error('Invalid fault window: "' + t + '" (use 0..3s)');
  const from = C.parseDuration(m[1] === undefined ? '0ms' : m[1]);
  const to = C.parseDuration(m[2]);
  if (from === null || to === null || to <= from) throw new Error('Invalid fault window: "' + t + '" (the end must come after the start)');
  return { from, to };
}

function planRng(seed, spec) {
  let x = (seed * 2654435761) >>> 0;
  for (let i = 0; i < String(spec).length; i++) x = (x * 31 + String(spec).charCodeAt(i)) >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

// the faults a given seed gets from a plan, as ordinary scenario faults
function planFaults(spec, window, scenario, seed) {
  const plan = typeof spec === 'string' ? parsePlan(spec) : spec;
  const win = typeof window === 'object' && window ? window : parseWindow(window);
  const ids = (scenario.nodes || []).map(n => Math.trunc(+n.id)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (ids.length < 2) throw new Error('A fault plan needs at least two processes');
  const rnd = planRng(seed, JSON.stringify([plan, win]));
  const time = () => Math.round(win.from + rnd() * (win.to - win.from));
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const seconds = (win.to - win.from) / 1000000;
  const out = [];
  const crashed = [];
  for (let i = 0, n = amountOf(plan, 'crash', seconds, rnd); i < n; i++) {
    const node = pick(ids.filter(id => !crashed.includes(id))) || pick(ids);
    crashed.push(node);
    out.push({ type: 'crash', node, at: C.fmtDuration(time()) });
  }
  for (let i = 0, n = amountOf(plan, 'recover', seconds, rnd); i < n && i < crashed.length; i++) {
    const crash = out.filter(f => f.type === 'crash')[i];
    // a recovery stays inside the window, like everything else a draw produces
    const at = Math.min(win.to - 1, C.parseDuration(crash.at) + drawSpan(win, rnd, 0.4));
    out.push({ type: 'recover', node: crash.node, at: C.fmtDuration(at) });
  }
  for (let i = 0, n = amountOf(plan, 'pause', seconds, rnd); i < n; i++) {
    const from = time();
    out.push({ type: 'pause', node: pick(ids), from: C.fmtDuration(from), to: C.fmtDuration(from + drawSpan(win, rnd, 0.25)) });
  }
  for (let i = 0, n = amountOf(plan, 'partition', seconds, rnd); i < n; i++) {
    const shuffled = ids.slice();
    for (let k = shuffled.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]; }
    const cut = 1 + Math.floor(rnd() * (ids.length - 1));
    const from = time();
    out.push({
      type: 'partition', groups: shuffled.slice(0, cut).sort((a, b) => a - b).join(' '),
      from: C.fmtDuration(from), to: C.fmtDuration(from + drawSpan(win, rnd, 0.3))
    });
  }
  for (let i = 0, n = amountOf(plan, 'link', seconds, rnd); i < n; i++) {
    const links = (scenario.links || []).filter(l => l.enabled !== false);
    const l = links.length ? pick(links) : { a: ids[0], b: ids[1] };
    const from = time();
    out.push({
      type: 'link', a: Math.trunc(+l.a), b: Math.trunc(+l.b), oneWay: rnd() < 0.5,
      from: C.fmtDuration(from), to: C.fmtDuration(from + drawSpan(win, rnd, 0.3))
    });
  }
  // a zone: several processes crash together, the way a rack or an availability zone does
  for (let i = 0, n = amountOf(plan, 'zone', seconds, rnd); i < n; i++) {
    const size = Math.max(2, Math.min(ids.length - 1, Math.round(ids.length / 3)));
    const shuffled = ids.slice();
    for (let k = shuffled.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]; }
    const at = C.fmtDuration(time());
    for (const node of shuffled.slice(0, size).sort((a, b) => a - b)) out.push({ type: 'crash', node, at, zone: true });
  }
  for (let i = 0, n = amountOf(plan, 'omission', seconds, rnd); i < n; i++) {
    const from = time();
    out.push({
      type: 'omission', node: pick(ids), direction: ['send', 'receive', 'both'][Math.floor(rnd() * 3)],
      prob: Math.round((0.3 + 0.7 * rnd()) * 100) / 100,
      from: C.fmtDuration(from), to: C.fmtDuration(from + drawSpan(win, rnd, 0.4))
    });
  }
  out.sort((a, b) => C.parseDuration(a.at !== undefined ? a.at : a.from) - C.parseDuration(b.at !== undefined ? b.at : b.from));
  return out;
}

function describePlanFault(f) {
  if (f.type === 'crash' || f.type === 'recover') return 'p' + f.node + ' ' + (f.type === 'crash' ? 'crashes' : 'recovers') + ' at ' + f.at;
  if (f.type === 'pause') return 'p' + f.node + ' paused ' + f.from + '–' + f.to;
  if (f.type === 'partition') return 'partition {' + f.groups.split(' ').map(x => 'p' + x).join(', ') + '} ' + f.from + '–' + f.to;
  if (f.type === 'link') return (f.oneWay ? 'one-way ' : '') + 'link p' + f.a + '–p' + f.b + ' down ' + f.from + '–' + f.to;
  return 'p' + f.node + ' omits ' + f.direction + ' (' + f.prob + ') ' + f.from + '–' + f.to;
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
    properties: (res.properties || []).map(p => ({ name: p.name, kind: p.kind, ok: p.ok, at: p.at, node: p.node, error: p.error })),
    propertyFailures: (res.properties || []).filter(p => !p.ok).length,
    outputs,
    outputCount: outputs.length,
    faults: [],
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
  const plan = opts.faults ? parsePlan(opts.faults) : null;
  const window = plan ? parseWindow(opts.faultWindow) : null;
  const seeds = seedList(opts.seeds !== undefined ? opts.seeds : base.seed || 1);
  const runs = [];
  const started = Date.now();
  for (const seed of seeds) {
    const scn = clone(base);
    scn.seed = seed;
    const added = plan ? planFaults(plan, window, scn, seed) : [];
    if (added.length) scn.faults = (scn.faults || []).concat(added);
    const summary = summarize(C.runSimulation(scn), seed);
    summary.faults = added;
    runs.push(summary);
    if (opts.onRun && opts.onRun(summary, runs.length, seeds.length) === false) break;
    if (opts.stopOnFailure && (!summary.ok || summary.propertyFailures)) break;
  }
  return { scenario: base, runs, summary: aggregate(runs), ms: Date.now() - started };
}

function aggregate(runs) {
  const n = runs.length || 1;
  const sum = k => runs.reduce((a, r) => a + r[k], 0);
  const failed = runs.filter(r => !r.ok);
  const withViolations = runs.filter(r => r.violations > 0);
  const withAssertions = runs.filter(r => r.assertions > 0);
  const withPropertyFailures = runs.filter(r => r.propertyFailures > 0);
  const byProperty = {};
  for (const r of runs) for (const p of r.properties) {
    const e = byProperty[p.name] = byProperty[p.name] || { name: p.name, kind: p.kind, held: 0, failed: 0, firstFailure: null };
    if (p.ok) e.held++;
    else { e.failed++; if (e.firstFailure === null) e.firstFailure = r.seed; }
  }
  return {
    runs: runs.length,
    failed: failed.length,
    firstFailure: failed.length ? failed[0].seed : null,
    withViolations: withViolations.length,
    firstViolation: withViolations.length ? withViolations[0].seed : null,
    withAssertions: withAssertions.length,
    firstAssertion: withAssertions.length ? withAssertions[0].seed : null,
    withPropertyFailures: withPropertyFailures.length,
    firstPropertyFailure: withPropertyFailures.length ? withPropertyFailures[0].seed : null,
    properties: Object.values(byProperty),
    avgMessages: +(sum('messages') / n).toFixed(1),
    avgDelivered: +(sum('delivered') / n).toFixed(1),
    avgLost: +(sum('lost') / n).toFixed(1),
    avgViolations: +(sum('violations') / n).toFixed(2),
    avgOutputs: +(sum('outputCount') / n).toFixed(1),
    avgEvents: Math.round(sum('eventCount') / n)
  };
}

// ---------------------------------------------------------------- shrinking a counterexample
// What went wrong in a run, as a comparable string: minimizing must keep the same failure, not any failure.
function failureSignature(summary) {
  const parts = summary.properties.filter(p => !p.ok).map(p => 'property:' + p.name).sort();
  if (!summary.ok) parts.push('error');
  if (summary.assertions) parts.push('assertion');
  return parts.join(',');
}

function runWith(scenario, seed, faults) {
  const scn = clone(scenario);
  scn.seed = seed;
  scn.faults = (scn.faults || []).concat(clone(faults));
  return summarize(C.runSimulation(scn), seed);
}

// Shrinks a fault schedule to the part that still produces the same failure: first by dropping faults one by
// one, then by shortening the ones that last for a while and by lowering omission probabilities. Every step
// is a whole simulation, so the number of them is capped.
function minimize(scenario, opts) {
  opts = opts || {};
  const seed = opts.seed !== undefined ? opts.seed : scenario.seed || 1;
  const maxRuns = opts.maxRuns || 200;
  const base = clone(scenario);
  let faults = clone(opts.faults || []);
  let runs = 0;
  const fails = candidate => {
    if (runs >= maxRuns) return false;
    runs++;
    return failureSignature(runWith(base, seed, candidate)) === signature;
  };
  const first = runWith(base, seed, faults);
  runs++;
  const signature = failureSignature(first);
  if (!signature) return { ok: false, reason: 'this run does not fail: there is nothing to shrink', faults, runs, signature: '' };

  // 1. drop faults, repeatedly, until no single one can be removed
  let changed = true;
  while (changed && runs < maxRuns) {
    changed = false;
    for (let i = 0; i < faults.length; i++) {
      const without = faults.slice(0, i).concat(faults.slice(i + 1));
      if (fails(without)) { faults = without; changed = true; break; }
    }
  }
  // 2. shorten what is left: a fault that lasts, and an omission that drops less, are easier to read
  const dur = v => { try { return C.parseDuration(v); } catch (e) { return null; } };
  for (let i = 0; i < faults.length && runs < maxRuns; i++) {
    const f = faults[i];
    if (f.from !== undefined && f.to) {
      let from = dur(f.from), to = dur(f.to);
      if (from === null || to === null) continue;
      for (let step = 0; step < 6 && runs < maxRuns && to - from > 1000; step++) {
        const shorter = Object.assign({}, f, { to: C.fmtDuration(from + Math.round((to - from) / 2)) });
        const candidate = faults.slice();
        candidate[i] = shorter;
        if (!fails(candidate)) break;
        faults = candidate;
        to = dur(shorter.to);
      }
    }
    if (faults[i].type === 'omission' && faults[i].prob > 0.1) {
      for (let step = 0; step < 4 && runs < maxRuns; step++) {
        const lower = Object.assign({}, faults[i], { prob: Math.round(faults[i].prob * 50) / 100 });
        if (lower.prob < 0.05) break;
        const candidate = faults.slice();
        candidate[i] = lower;
        if (!fails(candidate)) break;
        faults = candidate;
      }
    }
  }
  return { ok: true, faults, runs, signature, removed: (opts.faults || []).length - faults.length };
}

// ---------------------------------------------------------------- behaviour profile
// The same algorithm, over a grid of fault conditions: one row per condition, so that "what does it survive"
// has an answer instead of a feeling. Every row is an ordinary batch, so everything is reproducible.
const PROFILE_GRID = [
  { name: 'no faults', plan: '' },
  { name: 'one crash', plan: 'crash:1' },
  { name: 'two crashes', plan: 'crash:2' },
  { name: 'crash and recovery', plan: 'crash:1,recover:1' },
  { name: 'one pause', plan: 'pause:1' },
  { name: 'one partition', plan: 'partition:1' },
  { name: 'partitions 1.5/s', plan: 'partition:1.5/s' },
  { name: 'link failures 0.5/s', plan: 'link:0.5/s' },
  { name: 'omissions 0.5/s', plan: 'omission:0.5/s' },
  { name: 'a zone crashes', plan: 'zone:1' }
];

function median(xs) {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function profileRow(scenario, row, opts) {
  const res = runBatch(scenario, {
    seeds: opts.seeds, preset: opts.preset, set: opts.set,
    faults: row.plan || undefined, faultWindow: opts.faultWindow
  });
  const runs = res.runs;
  const n = runs.length || 1;
  const settle = runs.filter(r => r.outputs.length).map(r => r.outputs[r.outputs.length - 1].t);
  const nodes = (scenario.nodes || []).length || 1;
  const properties = {};
  for (const r of runs) for (const p of r.properties) {
    const e = properties[p.name] = properties[p.name] || { name: p.name, kind: p.kind, held: 0, failed: 0, firstFailure: null };
    if (p.ok) e.held++;
    else { e.failed++; if (e.firstFailure === null) e.firstFailure = r.seed; }
  }
  const out = {
    name: row.name,
    plan: row.plan,
    runs: runs.length,
    failed: runs.filter(r => !r.ok).length,
    assertions: runs.filter(r => r.assertions > 0).length,
    properties: Object.values(properties),
    avgMessages: +(runs.reduce((a, r) => a + r.messages, 0) / n).toFixed(1),
    avgLost: +(runs.reduce((a, r) => a + r.lost, 0) / n).toFixed(1),
    avgOutputs: +(runs.reduce((a, r) => a + r.outputCount, 0) / n).toFixed(1),
    // how much of the system produced something, and how long the last output took
    reach: +(runs.reduce((a, r) => a + r.nodesWithOutput / nodes, 0) / n).toFixed(2),
    settle: median(settle),
    worstSeed: (runs.find(r => !r.ok || r.propertyFailures || r.assertions) || {}).seed || null
  };
  return Object.assign(out, verdictOf(out));
}

// What this condition did to the algorithm, in one word and one sentence.
function verdictOf(row) {
  const broken = row.properties.filter(p => p.failed);
  if (row.failed) {
    return { verdict: 'failed', verdictText: row.failed + ' of ' + row.runs + ' run(s) ended with an error' };
  }
  if (broken.length) {
    return {
      verdict: 'broken',
      verdictText: broken.map(p => p.name + ' broken in ' + p.failed + '/' + row.runs).join(', ')
    };
  }
  if (row.assertions) return { verdict: 'broken', verdictText: row.assertions + ' run(s) failed an assertion' };
  if (row.reach < 0.999) return { verdict: 'degraded', verdictText: 'holds, ' + Math.round(row.reach * 100) + '% of the processes produce an output' };
  return { verdict: 'ok', verdictText: 'holds' };
}

// The profile in three lists, for a headline: what it survives, where it degrades, what breaks it.
function profileSummary(rows) {
  const pick = v => rows.filter(r => r.verdict === v).map(r => r.name);
  const survives = pick('ok');
  const degrades = pick('degraded');
  const broken = rows.filter(r => r.verdict === 'broken' || r.verdict === 'failed')
    .map(r => ({ name: r.name, verdict: r.verdict, text: r.verdictText, seed: r.worstSeed }));
  const list = xs => xs.length ? xs.join(', ') : 'nothing';
  let headline;
  if (!broken.length) headline = 'Every condition held: ' + list(survives.concat(degrades)) + '.';
  else {
    headline = 'Holds under ' + list(survives.concat(degrades)) + '. Breaks under ' +
      broken.map(b => b.name + ' (' + b.text + ')').join('; ') + '.';
  }
  return { survives, degrades, broken, headline };
}

function profile(scenario, opts) {
  opts = opts || {};
  const grid = opts.grid || PROFILE_GRID;
  const started = Date.now();
  const rows = [];
  for (const row of grid) {
    rows.push(profileRow(scenario, row, opts));
    if (opts.onRow && opts.onRow(rows[rows.length - 1], rows.length, grid.length) === false) break;
  }
  return { rows, seeds: seedList(opts.seeds !== undefined ? opts.seeds : scenario.seed || 1).length, ms: Date.now() - started };
}

// The profile as a Markdown report: a table, the verdicts and the sentence, ready to paste into an issue,
// a handout or a pull request.
function profileMarkdown(res, meta) {
  const rows = res.rows || res;
  const sum = profileSummary(rows);
  const names = rows.length ? rows[0].properties.map(p => p.name) : [];
  const MARK = { ok: 'held', degraded: 'held (partial reach)', broken: 'broken', failed: 'failed' };
  const out = [];
  out.push('# Behaviour profile' + (meta && meta.title ? ': ' + meta.title : ''));
  out.push('');
  out.push(sum.headline);
  out.push('');
  out.push('| condition | ' + names.concat(['messages', 'reach', 'settles', 'verdict']).join(' | ') + ' |');
  out.push('|---|' + names.concat(['', '', '', '']).map(() => '---|').join(''));
  for (const r of rows) {
    const cells = names.map(n => {
      const p = r.properties.find(x => x.name === n);
      return p ? p.held + '/' + r.runs : '—';
    });
    cells.push(String(r.avgMessages), Math.round(r.reach * 100) + '%',
      r.settle === null ? '—' : C.fmtDuration(r.settle), MARK[r.verdict] || r.verdict);
    out.push('| ' + r.name + ' | ' + cells.join(' | ') + ' |');
  }
  const broken = rows.filter(r => r.verdict === 'broken' || r.verdict === 'failed');
  if (broken.length) {
    out.push('');
    out.push('## What broke');
    out.push('');
    for (const r of broken) {
      out.push('- **' + r.name + '**: ' + r.verdictText + (r.worstSeed !== null ? ' (seed ' + r.worstSeed + ')' : ''));
    }
  }
  out.push('');
  out.push('_' + (res.seeds || rows[0] && rows[0].runs || 0) + ' seed(s) per condition' +
    (meta && meta.window ? ', faults within ' + meta.window : '') +
    '. Reach is the share of processes that produced an output; settles is the median time of the last one._');
  return out.join('\n') + '\n';
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

const Runner = { runBatch, summarize, aggregate, outcomes, seedList, applyOverride, checkScenario, planFaults, parsePlan, parseWindow, describePlanFault, minimize, failureSignature, profile, profileSummary, profileMarkdown, verdictOf, PROFILE_GRID };
if (typeof module !== 'undefined' && module.exports) module.exports = Runner;
else root.SimRunner = Runner;
})(typeof self !== 'undefined' ? self : this);
