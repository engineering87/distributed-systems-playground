// 12b-batch.js — running a scenario over many seeds without blocking the page

// The worker runs core.js, examples.js and runner.js, which never touch the page. Its source is inlined in
// the bundle as a plain text script, turned into a blob URL here. Where blob workers are not allowed (some
// browsers refuse them on file://), the batch falls back to the main thread, in slices, so the page still
// answers between seeds.
let workerUrl = null;
function batchWorkerUrl() {
  if (workerUrl !== null) return workerUrl;
  const el = document.getElementById('worker-src');
  workerUrl = el ? URL.createObjectURL(new Blob([el.textContent], { type: 'text/javascript' })) : '';
  return workerUrl;
}
function makeWorkers(n) {
  const url = batchWorkerUrl();
  if (!url) return [];
  const out = [];
  try { for (let i = 0; i < n; i++) out.push(new Worker(url)); }
  catch (e) { out.forEach(w => w.terminate()); return []; }
  return out;
}

// runs `seeds` of `scenario`, calling onRun(summary) as results arrive; returns a handle with cancel().
// `faultsFor(seed)` adds a generated schedule to that run, drawn from its seed.
function runBatch(scenario, seeds, onRun, onDone, faultsFor) {
  const scenarioFor = seed => {
    const added = faultsFor ? faultsFor(seed) : [];
    if (!added.length) return { scn: scenario, added };
    const scn = clone(scenario);
    scn.faults = (scn.faults || []).concat(added);
    return { scn, added };
  };
  const pending = seeds.slice();
  const results = [];
  let cancelled = false;
  const finish = () => { if (!cancelled) onDone(results.sort((a, b) => a.seed - b.seed)); };
  const take = () => (pending.length ? pending.shift() : null);
  const collect = (summary, added) => {
    if (cancelled) return;
    summary.faults = added || [];
    results.push(summary);
    onRun(summary, results.length, seeds.length);
  };
  const workers = makeWorkers(Math.min(seeds.length, Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))));
  if (workers.length) {
    let active = workers.length;
    for (const w of workers) {
      let sent = null;
      const next = () => {
        const seed = take();
        if (seed === null) { w.terminate(); if (--active === 0) finish(); return; }
        const { scn, added } = scenarioFor(seed);
        sent = added;
        w.postMessage({ scenario: scn, seed });
      };
      w.onmessage = e => { const added = sent; collect(e.data, added); next(); };
      w.onerror = () => { w.terminate(); if (--active === 0) finish(); };
      next();
    }
    return { cancel() { cancelled = true; workers.forEach(w => w.terminate()); } };
  }
  // fallback: one seed per animation frame, so the page keeps answering
  const step = () => {
    if (cancelled) return;
    const seed = take();
    if (seed === null) { finish(); return; }
    const { scn, added } = scenarioFor(seed);
    collect(window.SimRunner.runBatch(scn, { seeds: [seed] }).runs[0], added);
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
  return { cancel() { cancelled = true; } };
}

// Shrinks the schedule of one run to the faults that still produce the same failure. One worker, or the
// page itself where workers are refused.
function minimizeRun(r, done) {
  const scenario = clone(S.scn);
  const url = batchWorkerUrl();
  if (url) {
    let w = null;
    try { w = new Worker(url); } catch (e) { w = null; }
    if (w) {
      w.onmessage = e => { w.terminate(); done(e.data); };
      w.onerror = () => { w.terminate(); done(null); };
      w.postMessage({ scenario, seed: r.seed, minimize: r.faults });
      return;
    }
  }
  setTimeout(() => done(window.SimRunner.minimize(scenario, { seed: r.seed, faults: r.faults })), 0);
}
let batchHandle = null;
function parseSeedSpec(text) {
  try { return window.SimRunner.seedList(text.trim() || '1'); }
  catch (e) { return null; }
}
let lastRuns = [], lastSeeds = [];
function renderBatchResults(runs, seeds) {
  lastRuns = runs; lastSeeds = seeds;
  const box = $('#batch-results');
  box.textContent = '';
  if (!runs.length) return;
  const props = {};
  for (const r of runs) for (const p of r.properties) {
    const e = props[p.name] = props[p.name] || { name: p.name, kind: p.kind, held: 0, failed: 0, first: null };
    if (p.ok) e.held++; else { e.failed++; if (e.first === null) e.first = r.seed; }
  }
  const failed = runs.filter(r => !r.ok || r.propertyFailures || r.assertions);
  box.append(el('p', { class: 'batch-summary' },
    runs.length + ' of ' + seeds.length + ' run(s), ',
    el('b', { class: failed.length ? 'bad' : 'good' }, failed.length ? failed.length + ' with a problem' : 'all clean')));
  for (const p of Object.values(props)) {
    box.append(el('p', { class: 'batch-prop' + (p.failed ? ' bad' : '') },
      el('b', {}, p.name), ' (' + p.kind + ') held in ' + p.held + '/' + (p.held + p.failed) + ' run(s)',
      p.first !== null ? ', first broken at seed ' + p.first : ''));
  }
  const list = el('ul', { class: 'batch-list' });
  const shown = failed.length ? failed : runs;
  for (const r of shown.slice(0, 60)) {
    const broken = r.properties.filter(p => !p.ok).map(p => p.name);
    const faults = (r.faults || []).map(f => window.SimRunner.describePlanFault(f)).join('; ');
    const what = !r.ok ? (r.error || 'does not compile')
      : broken.length ? broken.join(', ') + ' broken'
        : r.assertions ? r.assertions + ' failed assertion(s)'
          : r.violations ? r.violations + ' violation(s)' : 'ok';
    list.append(el('li', {},
      el('button', {
        type: 'button', class: 'link', title: faults ? 'Open this run, with its generated faults' : 'Open this run',
        onclick: () => openBatchRun(r)
      }, 'seed ' + r.seed),
      el('span', { class: r.ok && !broken.length && !r.assertions ? '' : 'bad' }, ' ' + what),
      el('span', { class: 'hint' }, faults ? '  ' + faults : '  ' + r.messages + ' messages, ' + r.outputCount + ' outputs'),
      (r.faults || []).length > 1 && (!r.ok || r.propertyFailures || r.assertions)
        ? el('button', {
          type: 'button', class: 'link', title: 'Find the faults that are enough to produce this failure',
          onclick: ev => {
            const b = ev.target;
            b.disabled = true;
            b.textContent = 'shrinking…';
            minimizeRun(r, res => {
              b.disabled = false;
              b.textContent = 'minimize';
              if (!res || !res.ok) { toast('This run could not be shrunk.'); return; }
              const was = r.faults.length;
              r.faults = res.faults;
              toast(was + ' faults reduced to ' + res.faults.length + ' in ' + res.runs + ' runs.');
              renderBatchResults(lastRuns, lastSeeds);
            });
          }
        }, 'minimize')
        : null));
  }
  box.append(list);
  if (shown.length > 60) box.append(el('p', { class: 'hint' }, 'showing the first 60 of ' + shown.length + '.'));
}
// opens one run of a batch: its seed, and the faults that run was given
function openBatchRun(r) {
  $('#seed').value = r.seed;
  S.scn.seed = r.seed;
  if ((r.faults || []).length) {
    S.scn.faults = (S.scn.faults || []).concat(clone(r.faults));
    renderFaults();
    toast('Added the faults of seed ' + r.seed + ' to the scenario.');
  }
  run(false);
  setTab('scen');
}
function startBatch() {
  const btn = $('#btn-batch');
  if (batchHandle) { batchHandle.cancel(); batchHandle = null; btn.textContent = 'Run over seeds'; $('#batch-progress').textContent = 'stopped'; return; }
  const seeds = parseSeedSpec($('#batch-seeds').value);
  if (!seeds) { toast('Seeds look like 1..50, or 3, or 1,4,9.'); return; }
  if (seeds.length > 500) { toast('That is a lot of seeds: try at most 500.'); return; }
  const spec = $('#batch-faults').value.trim();
  let faultsFor = null;
  if (spec) {
    try {
      const plan = window.SimRunner.parsePlan(spec);
      const win = window.SimRunner.parseWindow($('#batch-window').value);
      faultsFor = seed => window.SimRunner.planFaults(plan, win, S.scn, seed);
      faultsFor(seeds[0]);
    } catch (e) { toast(e.message); return; }
  }
  const scenario = clone(S.scn);
  $('#batch-results').textContent = '';
  $('#batch-progress').textContent = '0 / ' + seeds.length;
  btn.textContent = 'Stop';
  const started = Date.now();
  const runs = [];
  batchHandle = runBatch(scenario, seeds,
    (summary, done, total) => {
      runs.push(summary);
      $('#batch-progress').textContent = done + ' / ' + total;
      if (done === total || done % 10 === 0) renderBatchResults(runs.slice().sort((a, b) => a.seed - b.seed), seeds);
    },
    all => {
      batchHandle = null;
      btn.textContent = 'Run over seeds';
      $('#batch-progress').textContent = all.length + ' run(s) in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s';
      renderBatchResults(all, seeds);
    }, faultsFor);
}
function bindBatch() {
  $('#btn-batch').addEventListener('click', startBatch);
  $('#batch-seeds').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); startBatch(); } });
}
