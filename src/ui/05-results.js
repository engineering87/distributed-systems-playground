// 05-results.js — turning a run into the indexes the views read

// ============================================================ results
function clearResults(msg) {
  stopPlay();
  S.res = null; S.stale = false; S.cursor = 0;
  $('#stale').hidden = true;
  $('#btn-run').classList.remove('pulse');
  prepareResults();
  if (msg) setStatus(msg, '');
  renderChips(); renderLog(); drawDiagram(); updateTransport();
  if (S.tab === 'state') renderInspector();
}
function prepareResults() {
  S.resVer = (S.resVer || 0) + 1;
  const r = S.res;
  S.msgsBySend = r ? r.msgs.slice().sort((a, b) => a.sendT - b.sendT || a.id - b.id) : [];
  S.msgById = new Map(S.msgsBySend.map(m => [m.id, m]));
  S.maxLat = 0;
  for (const m of S.msgsBySend) if (m.recvT !== null) S.maxLat = Math.max(S.maxLat, m.recvT - m.sendT);
  S.outIdx = {};
  if (r) for (const o of r.outputs) (S.outIdx[o.node] = S.outIdx[o.node] || []).push(o);
  for (const k in S.outIdx) S.outIdx[k].sort((a, b) => a.t - b.t);
  S.activity = r ? r.activity.slice().sort((a, b) => a.t - b.t) : [];
  S.maxBusy = 0;
  for (const a of S.activity) S.maxBusy = Math.max(S.maxBusy, a.end - a.t);
  const ts = new Set([0]);
  if (r) {
    for (const e of r.log) ts.add(e.t);
    for (const m of r.msgs) { ts.add(m.sendT); if (m.recvT !== null) ts.add(m.recvT); }
    for (const a of S.activity) ts.add(a.t);
  }
  S.times = [...ts].filter(t => !r || t <= r.endT).sort((a, b) => a - b);
  S.playEnd = r ? focusEnd(r) : 0;
  S.view = { start: 0, span: r ? S.playEnd * 1.03 : 1e6 };
  S.logSorted = r ? r.log.map((e, i) => Object.assign({ i }, e)).sort((a, b) => a.t - b.t || a.i - b.i) : [];
  S.localByNode = {};
  if (r) {
    r.localEvents.forEach((e, i) => { e.i = i; (S.localByNode[e.node] = S.localByNode[e.node] || []).push(e); });
    for (const k in S.localByNode) S.localByNode[k].sort((a, b) => a.t - b.t || a.i - b.i);
  }
  S.cone = null;
  S.stackKey = '';
  renderConeInfo();
  if (S.selected && S.selected.type === 'msg' && !S.msgById.has(S.selected.id)) S.selected = null;
  updatePulse();
}
// color of the module that originated a message (depth in the stack picks the hue)
function layerColor(specId) {
  const spec = S.res && S.res.specs[specId];
  const pal = S.colors.layers || [];
  if (!spec || !pal.length) return S.colors.blue;
  return pal[spec.id % pal.length];
}
function layersOn() { return !!(S.res && $('#layers').checked); }
function renderLayerLegend() {
  const box = $('#layer-legend');
  const on = layersOn();
  box.hidden = !on;
  $('#status-legend').hidden = on;
  if (!on) return;
  box.textContent = '';
  box.append(el('b', {}, 'Originated by'));
  for (const sp of S.res.specs) {
    if (!S.res.msgs.some(m => m.origin === sp.id)) continue;
    const sw = el('i', { class: 'sw' });
    sw.style.background = layerColor(sp.id);
    box.append(el('span', {}, sw, sp.algo));
  }
}
// the last moment where something visible happens (messages, outputs, crashes, log entries);
// rounds and timers can keep a run going long after the algorithm has finished
function focusEnd(r) {
  let f = 0;
  for (const m of r.msgs) f = Math.max(f, m.recvT === null ? m.sendT : Math.min(m.recvT, r.endT));
  for (const o of r.outputs) f = Math.max(f, o.t);
  for (const k in r.downs) for (const d of r.downs[k]) f = Math.max(f, d.from, d.to || 0);
  for (const e of r.log) if (e.kind !== 'warn') f = Math.max(f, e.t);
  if (f <= 0) return r.endT;
  return Math.min(r.endT, Math.max(f * 1.08, f + 1000));
}
function setStatus(text, cls) { const s = $('#status'); s.textContent = text || ''; s.className = 'status ' + (cls || ''); }

function run(keepCursor, resume) {
  stopPlay();
  const prevCursor = S.cursor;
  setStatus('Simulating…', '');
  $('#btn-run').disabled = true;
  setTimeout(() => {
    let r = null;
    try { r = C.runSimulation(clone(S.scn)); }
    catch (e) { console.error(e); setStatus('Internal simulator error: ' + e.message, 'err'); }
    $('#btn-run').disabled = false;
    if (!r) return;
    S.runtimeErr = null;
    if (r.compile) S.diag = { errors: r.compile.errors, warnings: r.compile.warnings };
    if (!r.ok) {
      S.res = null; S.stale = false; $('#stale').hidden = true; $('#btn-run').classList.remove('pulse');
      prepareResults();
      setStatus(r.error, 'err');
      if (r.compile && r.compile.errors.length) setTab('code');
      renderDiag(); refreshCode(); renderResultViews();
      return;
    }
    if (r.error) S.runtimeErr = { msg: r.error, line: r.errorLine };
    S.res = r; S.stale = false;
    $('#stale').hidden = true; $('#btn-run').classList.remove('pulse');
    prepareResults();
    renderDiag(); refreshCode();
    const warn = r.warnings.length ? ' Warnings: ' + r.warnings.join('; ') + '.' : '';
    if (r.error) setStatus(r.error + (r.errorLine ? ' (line ' + r.errorLine + ')' : ''), 'err');
    else setStatus(r.stopReason + ': ' + r.eventCount + ' events processed.' + warn, 'ok');
    let play = false;
    if (keepCursor) { S.cursor = Math.min(prevCursor, r.endT); play = !!resume; }
    else if ($('#autoplay').checked) { S.cursor = 0; play = true; }
    else S.cursor = r.endT;
    renderResultViews();
    if (play) startPlay();
  }, 20);
}
function renderResultViews() { renderChips(); renderLog(); renderProps(); renderLayerLegend(); setCursor(S.cursor); }

function renderChips() {
  const box = $('#chips'); box.textContent = '';
  if (!S.res) return;
  const r = S.res;
  let del = 0, lost = 0;
  for (const m of r.msgs) { if (m.status === 'delivered') del++; else if (m.status !== 'pending') lost++; }
  const items = [
    el('span', { class: 'chip' }, r.msgs.length + ' messages'),
    el('span', { class: 'chip' }, del + ' delivered'),
    lost ? el('span', { class: 'chip' }, lost + ' lost') : null,
    el('span', { class: 'chip' + (r.violations ? ' bad' : '') }, r.violations + (r.violations === 1 ? ' violation' : ' violations')),
    el('span', { class: 'chip' }, r.outputs.length + (r.outputs.length === 1 ? ' output' : ' outputs')),
    r.properties && r.properties.length
      ? el('span', { class: 'chip' + (r.properties.some(p => !p.ok) ? ' bad' : ' good'), title: r.properties.map(p => p.name + ' (' + p.kind + '): ' + (p.error ? p.error : p.ok ? 'holds' : p.kind === 'always' ? 'violated at ' + C.fmtDuration(p.at) + ' on p' + p.node : 'never held')).join('\n') },
        r.properties.filter(p => p.ok).length + '/' + r.properties.length + ' properties')
      : null
  ].filter(Boolean);
  box.append(...items);
}
