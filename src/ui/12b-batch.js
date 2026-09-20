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

// runs `seeds` of `scenario`, calling onRun(summary) as results arrive; returns a handle with cancel()
function runBatch(scenario, seeds, onRun, onDone) {
  const pending = seeds.slice();
  const results = [];
  let cancelled = false;
  const finish = () => { if (!cancelled) onDone(results.sort((a, b) => a.seed - b.seed)); };
  const take = () => (pending.length ? pending.shift() : null);
  const collect = summary => {
    if (cancelled) return;
    results.push(summary);
    onRun(summary, results.length, seeds.length);
  };
  const workers = makeWorkers(Math.min(seeds.length, Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))));
  if (workers.length) {
    let active = workers.length;
    for (const w of workers) {
      const next = () => {
        const seed = take();
        if (seed === null) { w.terminate(); if (--active === 0) finish(); return; }
        w.postMessage({ scenario, seed });
      };
      w.onmessage = e => { collect(e.data); next(); };
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
    collect(window.SimRunner.runBatch(scenario, { seeds: [seed] }).runs[0]);
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
  return { cancel() { cancelled = true; } };
}

let batchHandle = null;
function parseSeedSpec(text) {
  try { return window.SimRunner.seedList(text.trim() || '1'); }
  catch (e) { return null; }
}
function renderBatchResults(runs, seeds) {
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
    const what = !r.ok ? (r.error || 'does not compile')
      : broken.length ? broken.join(', ') + ' broken'
        : r.assertions ? r.assertions + ' failed assertion(s)'
          : r.violations ? r.violations + ' violation(s)' : 'ok';
    list.append(el('li', {},
      el('button', {
        type: 'button', class: 'link', title: 'Open this run',
        onclick: () => { $('#seed').value = r.seed; S.scn.seed = r.seed; run(false); setTab('scen'); }
      }, 'seed ' + r.seed),
      el('span', { class: r.ok && !broken.length && !r.assertions ? '' : 'bad' }, ' ' + what),
      el('span', { class: 'hint' }, '  ' + r.messages + ' messages, ' + r.outputCount + ' outputs')));
  }
  box.append(list);
  if (shown.length > 60) box.append(el('p', { class: 'hint' }, 'showing the first 60 of ' + shown.length + '.'));
}
function startBatch() {
  const btn = $('#btn-batch');
  if (batchHandle) { batchHandle.cancel(); batchHandle = null; btn.textContent = 'Run over seeds'; $('#batch-progress').textContent = 'stopped'; return; }
  const seeds = parseSeedSpec($('#batch-seeds').value);
  if (!seeds) { toast('Seeds look like 1..50, or 3, or 1,4,9.'); return; }
  if (seeds.length > 500) { toast('That is a lot of seeds: try at most 500.'); return; }
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
    });
}
function bindBatch() {
  $('#btn-batch').addEventListener('click', startBatch);
  $('#batch-seeds').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); startBatch(); } });
}
