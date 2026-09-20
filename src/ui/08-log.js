// 08-log.js — event log, state inspector and stack view

// ============================================================ event log
const LOG_MAX = 3000;
const KIND_LABEL = { fault: 'fault', output: 'output', violation: 'violation', drop: 'dropped', warn: 'warning', error: 'error', assert: 'assertion failed', input: 'input', log: 'log', property: 'property' };
function renderLog() {
  const ol = $('#log'); ol.textContent = '';
  S.logRows = []; S.logCur = -1;
  if (!S.res) return;
  const f = $('#log-filter').value;
  const match = e => f === 'all' || e.kind === f ||
    (f === 'warn' && (e.kind === 'warn' || e.kind === 'error')) ||
    (f === 'log' && (e.kind === 'log' || e.kind === 'assert'));
  const items = S.logSorted.filter(match);
  const frag = document.createDocumentFragment();
  for (const e of items.slice(0, LOG_MAX)) {
    const label = KIND_LABEL[e.kind];
    const li = el('li', { class: 'k-' + e.kind },
      el('span', { class: 't' }, C.fmtDuration(e.t)),
      el('span', { class: 'n' }, e.node !== null && e.node !== undefined ? 'p' + e.node : ''),
      el('span', { class: 'x' }, label ? label + ': ' + e.text : e.text));
    li.addEventListener('click', () => { stopPlay(); setCursor(e.t); if (e.line && S.tab === 'code') gotoLine(e.line); });
    li._t = e.t;
    frag.append(li);
    S.logRows.push(li);
  }
  if (items.length > LOG_MAX) frag.append(el('li', { class: 'more' }, (items.length - LOG_MAX) + ' more events not shown: use a filter.'));
  if (!items.length) frag.append(el('li', { class: 'more' }, 'No events match this filter.'));
  ol.append(frag);
  updateLogCursor();
}
function updateLogCursor() {
  const rows = S.logRows;
  if (!rows.length) return;
  const k = upperBound(rows, S.cursor, li => li._t) - 1;
  const old = S.logCur;
  if (k === old) return;
  const a = Math.min(old, k) + 1, b = Math.max(old, k);
  for (let i = Math.max(0, a); i <= b && i < rows.length; i++) rows[i].classList.toggle('past', i <= k);
  if (old >= 0 && rows[old]) rows[old].classList.remove('cur');
  if (k >= 0) {
    rows[k].classList.add('cur');
    const ol = $('#log'), top = rows[k].offsetTop;
    if (top < ol.scrollTop || top > ol.scrollTop + ol.clientHeight - 24) ol.scrollTop = top - ol.clientHeight / 2;
  }
  S.logCur = k;
}

// ============================================================ state inspector
function inspectorKey() {
  const sel = S.selected;
  if (!sel || sel.type !== 'node' || !S.res) return 'x|' + (sel ? sel.type + (sel.id || sel.idx) : '') + '|' + (S.resVer || 0);
  const snaps = S.res.snaps[sel.id] || [];
  const outs = S.outIdx[sel.id] || [];
  return [sel.id, S.resVer, upperBound(snaps, S.cursor, x => x.t), upperBound(outs, S.cursor, o => o.t), !!downAt(sel.id, S.cursor),
    S.playing ? Math.floor(S.cursor / 50000) : S.cursor].join('|');
}
function renderInspector(force) {
  const key = inspectorKey();
  if (!force && key === S.inspKey) return;
  S.inspKey = key;
  const box = $('#inspector'); box.textContent = '';
  const sel = S.selected;
  if (!sel || sel.type !== 'node') {
    box.append(el('p', { class: 'empty' }, 'Select a process in the topology to see its state at the cursor time.'));
    return;
  }
  const id = sel.id;
  const wrap = el('div', { class: 'insp' });
  wrap.append(el('h3', { style: 'margin-top:0' }, 'p' + id + ' at t = ' + C.fmtDuration(S.cursor)));
  box.append(wrap);
  const r = S.res;
  if (!r) { wrap.append(el('p', { class: 'empty' }, 'Run the simulation to inspect the state.')); return; }
  const info = r.nodeInfo[id];
  if (!info) { wrap.append(el('p', { class: 'empty' }, 'This process did not exist in the last run.')); return; }
  const snaps = r.snaps[id] || [];
  const i = upperBound(snaps, S.cursor, s => s.t) - 1;
  const cur = i >= 0 ? snaps[i] : null, prev = i > 0 ? snaps[i - 1] : null;
  const down = downAt(id, S.cursor);
  const pause = pausedAt(id, S.cursor);
  const past = (r.downs[id] || []).filter(d => d.to !== null && d.to <= S.cursor);
  const status = down ? 'crashed at ' + C.fmtDuration(down.from)
    : pause ? 'paused until ' + C.fmtDuration(pause.to)
      : past.length ? 'running, recovered at ' + C.fmtDuration(past[past.length - 1].to) : 'running';
  wrap.append(el('div', { class: 'meta' },
    el('span', {}, 'status ', el('b', {}, status)),
    el('span', {}, 'local clock ', el('b', {}, C.fmtDuration(Math.round(info.offset + (1 + info.rho) * S.cursor)))),
    el('span', {}, 'offset ', el('b', {}, C.fmtDuration(info.offset))),
    el('span', {}, 'drift ', el('b', {}, info.rho === 0 ? '0' : info.rho.toExponential(2))),
    r.rounds && cur ? el('span', {}, 'round ', el('b', {}, String(cur.round))) : null));
  if (!cur) wrap.append(el('p', { class: 'hint' }, 'No event processed yet.'));
  else {
    for (const path of Object.keys(cur.states)) {
      const st = cur.states[path], ps = prev ? prev.states[path] : null;
      const spec = r.specs.find(s => s.path === path);
      wrap.append(el('h4', { class: 'path' }, path + (spec ? ' : ' + spec.algo : '')));
      const names = Object.keys(st);
      if (!names.length) { wrap.append(el('p', { class: 'hint' }, 'No state variables.')); continue; }
      const tb = el('table');
      for (const k of names) {
        const v = C.fmt(st[k]);
        const changed = ps && C.fmt(ps[k]) !== v;
        tb.append(el('tr', { class: changed ? 'chg' : null, title: changed ? 'changed in the last step' : null }, el('td', {}, k), el('td', {}, v)));
      }
      wrap.append(tb);
    }
  }
  const outs = (S.outIdx[id] || []).filter(o => o.t <= S.cursor).slice(-8);
  wrap.append(el('h4', {}, 'Latest outputs'));
  if (outs.length) wrap.append(el('ol', { class: 'outs' }, ...outs.map(o => el('li', {}, C.fmtDuration(o.t) + '  ' + o.text))));
  else wrap.append(el('p', { class: 'hint' }, 'None.'));
}

// ============================================================ stack view
function stackNode() {
  if (S.selected && S.selected.type === 'node') return S.selected.id;
  return S.stackNode || (S.scn.nodes[0] && S.scn.nodes[0].id);
}
function renderStack(force) {
  const box = $('#stack-view');
  if (!box || !S.scn) return;
  const id = stackNode();
  const W = S.pulse;
  const key = [S.resVer, id, Math.floor(S.cursor / Math.max(1, W / 6)), box.clientWidth].join('|');
  if (!force && key === S.stackKey) return;
  S.stackKey = key;
  box.textContent = '';
  const wrap = el('div', { class: 'stack' });
  box.append(wrap);
  if (!S.res) { wrap.append(el('p', { class: 'empty' }, 'Run the simulation to see how events move through the module stack.')); return; }
  const sel = el('select', { 'aria-label': 'Process' });
  for (const n of S.scn.nodes.slice().sort((a, b) => a.id - b.id)) sel.append(el('option', { value: n.id }, 'p' + n.id));
  sel.value = id;
  sel.addEventListener('change', () => { S.stackNode = +sel.value; select({ type: 'node', id: +sel.value }); renderStack(true); });
  wrap.append(el('div', { class: 'pick' }, el('label', { class: 'field inline' }, el('span', {}, 'Process'), sel),
    el('span', { class: 'hint', style: 'margin:0' }, 'at t = ' + C.fmtDuration(S.cursor) + '. Requests go down (blue), indications come up (green).')));
  const specs = S.res.specs;
  // layout: a tree of modules, the application on top and the network at the bottom
  const children = {};
  specs.forEach(sp => { if (sp.parent !== null) (children[sp.parent] = children[sp.parent] || []).push(sp.id); });
  const col = {};
  let leaf = 0;
  const place = idx => {
    const ch = children[idx] || [];
    if (!ch.length) { col[idx] = leaf++; return; }
    ch.forEach(place);
    col[idx] = (col[ch[0]] + col[ch[ch.length - 1]]) / 2;
  };
  place(0);
  const cols = Math.max(1, leaf);
  const maxDepth = Math.max(...specs.map(sp => sp.depth));
  const Wd = Math.max(280, box.clientWidth - 4);
  const boxW = Math.min(230, Wd / cols - 16), boxH = 42, gap = 44;
  const cx = c => (c + 0.5) * Wd / cols;
  const yOf = d => 14 + (d + 1) * (boxH + gap);
  const H = yOf(maxDepth + 1) + boxH + 14;
  const svgEl = sv('svg', { viewBox: `0 0 ${Wd} ${H}`, role: 'img', 'aria-label': 'Module stack of p' + id });
  svgEl.style.height = H + 'px';
  const pos = {};
  pos.app = { x: cx(col[0]), y: 14 };
  specs.forEach(sp => { pos[sp.id] = { x: cx(col[sp.id]), y: yOf(sp.depth) }; });
  const netUsers = specs.filter(sp => sp.builtins.length);
  const netX = netUsers.length ? netUsers.reduce((a, sp) => a + pos[sp.id].x, 0) / netUsers.length : Wd / 2;
  pos.net = { x: netX, y: yOf(maxDepth + 1) };
  // counts of events handled so far
  const evs = S.localByNode[id] || [];
  const hi = upperBound(evs, S.cursor, e => e.t);
  const handled = {};
  for (let i = 0; i < hi; i++) { const e = evs[i]; handled[e.to] = (handled[e.to] || 0) + 1; }
  // static edges
  const edge = (a, b) => svgEl.append(sv('line', { x1: pos[a].x, y1: pos[a].y + boxH, x2: pos[b].x, y2: pos[b].y, class: 'edge' }));
  edge('app', 0);
  specs.forEach(sp => { if (sp.parent !== null) edge(sp.parent, sp.id); });
  netUsers.forEach(sp => edge(sp.id, 'net'));
  // recent flows within the animation window
  // the latest group of events of this process is always shown; older ones only within the animation window
  const recent = new Map();
  const lastT = hi ? evs[hi - 1].t : -Infinity;
  const since = Math.min(lastT, S.cursor - Math.max(W, 1));
  for (let i = hi - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.t < since) break;
    const k = e.from + '>' + e.to;
    if (!recent.has(k)) recent.set(k, e);
  }
  const labels = sv('g', {});
  for (const [k, e] of recent) {
    if (e.from === 'timer') continue;
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const down = e.from === 'app' || (typeof e.from === 'number' && (e.to === 'net' || (typeof e.to === 'number' && specs[e.to].parent === e.from)));
    const age = e.t === lastT ? Math.min(0.6, (S.cursor - e.t) / Math.max(W, 1) * 0.3) : Math.min(1, (S.cursor - e.t) / Math.max(W, 1));
    const off = down ? -9 : 9;
    const [x1, y1, x2, y2] = down ? [a.x + off, a.y + boxH, b.x + off, b.y] : [a.x + off, a.y, b.x + off, b.y + boxH];
    const line = sv('line', { x1, y1, x2, y2, class: 'flow ' + (down ? 'down' : 'up'), opacity: (1 - 0.7 * age).toFixed(2), 'marker-end': 'url(#arrow)' });
    svgEl.append(line);
    const txt = e.ev + (e.args ? ' | ' + truncate(e.args, 26) : '');
    const lx = (x1 + x2) / 2 + (down ? -6 : 6), ly = (y1 + y2) / 2 + 4;
    const t = sv('text', { x: lx, y: ly, class: 'flow-label ' + (down ? 'down' : 'up'), 'text-anchor': down ? 'end' : 'start', opacity: (1 - 0.6 * age).toFixed(2) }, txt);
    labels.append(t);
  }
  // boxes
  const hot = new Set([...recent.values()].flatMap(e => [e.from, e.to]).map(String));
  const drawBox = (k, title, sub, ext) => {
    const P = pos[k];
    const g = sv('g', { class: 'box' + (ext ? ' ext' : '') + (hot.has(String(k)) ? ' hot' : ''), transform: `translate(${P.x - boxW / 2} ${P.y})` });
    const rect = sv('rect', { width: boxW, height: boxH });
    if (typeof k === 'number') rect.style.stroke = layerColor(k);
    g.append(rect, sv('text', { x: 8, y: 17, class: 't1' }, truncate(title, Math.floor(boxW / 7.5))),
      sv('text', { x: 8, y: 33, class: 't2' }, truncate(sub, Math.floor(boxW / 6.8))));
    if (handled[k]) g.append(sv('text', { x: boxW - 7, y: 17, class: 'cnt' }, String(handled[k])));
    svgEl.append(g);
  };
  drawBox('app', 'Application', 'inputs and outputs', true);
  specs.forEach(sp => drawBox(sp.id, sp.algo, sp.alias + ' : ' + sp.iface, false));
  drawBox('net', netUsers.some(sp => sp.builtins.includes('Rounds')) ? 'Rounds' : 'Network', 'provided by the simulator', true);
  svgEl.append(labels);
  wrap.append(svgEl);
  // recent events as text
  wrap.append(el('h4', {}, 'Latest events on p' + id));
  const list = el('ol', { class: 'recent' });
  const name = k => k === 'app' ? 'app' : k === 'net' ? 'net' : k === 'timer' ? 'timer' : specs[k].alias;
  for (let i = hi - 1; i >= Math.max(0, hi - 14); i--) {
    const e = evs[i];
    const dir = e.from === 'timer' ? 'timer' : (e.to === 'app' || e.from === 'net' || (typeof e.from === 'number' && typeof e.to === 'number' && specs[e.from].parent === e.to)) ? 'up' : 'down';
    list.append(el('li', {}, el('span', { class: 't' }, C.fmtDuration(e.t)),
      el('span', { class: 'd-' + dir }, name(e.from) + (dir === 'up' ? ' ↑ ' : dir === 'down' ? ' ↓ ' : ' ⏱ ') + name(e.to) + '  ' + e.ev + (e.args ? ' | ' + e.args : ''))));
  }
  if (!hi) list.append(el('li', {}, el('span', {}, ''), el('span', { class: 'hint' }, 'Nothing has happened on this process yet.')));
  wrap.append(list);
  if (S.res.localTruncated) wrap.append(el('p', { class: 'hint' }, 'The run is long: only its first 200,000 local events were recorded.'));
}
