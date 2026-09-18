(function () {
'use strict';
const C = window.SimCore, EX = window.SimExamples, LIB = window.SimLibrary;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const SVGNS = 'http://www.w3.org/2000/svg';
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
const UIF = "'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif";
const STORE_KEY = 'ds-playground:scenario:v1';
const R_NODE = 18;
const PULSE_REAL_S = 0.45;      // how long arrival/processing effects last, in real seconds
const STEP_REAL_MS = 650;       // duration of one step in "event by event" playback
const AUTO_REAL_S = 25;         // "auto" speed plays the whole run in about this many seconds

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids) { if (c === null || c === undefined || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
function sv(tag, attrs, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}
// Keys that could reach an object's prototype are dropped from every JSON document that comes from outside
// the page (imported files, shared links, local storage).
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function safeParse(text) { return JSON.parse(text, (k, v) => (UNSAFE_KEYS.has(k) ? undefined : v)); }
const clone = o => safeParse(JSON.stringify(o));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* browser storage unavailable */ } }
};
function upperBound(arr, t, f) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f(arr[m]) <= t) lo = m + 1; else hi = m; } return lo; }
function lowerBound(arr, t, f) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f(arr[m]) < t) lo = m + 1; else hi = m; } return lo; }
function lastAtOrBefore(arr, t, f) { const i = upperBound(arr, t, f) - 1; return i >= 0 ? arr[i] : null; }
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
// shortest exact text for a time in microseconds, e.g. 2s, 9.993526s, 40ms, 1.5ms
function fmtDurInput(us) {
  us = Math.round(us);
  if (us % 1000000 === 0) return (us / 1e6) + 's';
  if (us >= 1e6) return (us / 1e6).toFixed(6).replace(/0+$/, '') + 's';
  return (us / 1000).toFixed(3).replace(/\.?0+$/, '') + 'ms';
}
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

const S = {
  scn: null, res: null, stale: false, cursor: 0, playing: false, lastFrame: 0,
  selected: null, mode: 'move', linkFrom: null,
  view: { start: 0, span: 1e6 }, times: [], msgsBySend: [], maxLat: 0, outIdx: {}, logSorted: [], logRows: [], logCur: -1,
  activity: [], maxBusy: 0, msgById: new Map(),
  colors: {}, tab: 'code', diag: { errors: [], warnings: [] }, runtimeErr: null, algos: [], topReqs: [], segs: [],
  pulse: 1000, seg: null
};

const BLANK_CODE = `// Empty scenario: edit freely.

interface App
  request Start()
  indication Done(count)
end

algorithm MyAlgorithm
  implements App as app
  uses Net as net
  state
    count := 0

  upon event ⟨app, Start⟩ do
    forall q in neighbors do
      trigger ⟨net, Send | q, [HELLO, self]⟩
    end
  end

  upon event ⟨net, Deliver | p, [HELLO, id]⟩ do
    count := count + 1
    trigger ⟨app, Done | count⟩
  end
end
`;
function blankScenario() {
  const ids = [1, 2, 3, 4, 5];
  const p = EX.PRESETS.async;
  return {
    version: 1, seed: 1, nodes: EX.ringLayout(ids, 330, 230, 150),
    links: ids.map((id, i) => ({ a: id, b: ids[(i + 1) % ids.length], directed: false, enabled: true })),
    code: BLANK_CODE, top: 'MyAlgorithm', inputs: '0ms 1 Start', faults: [], preset: 'async',
    assumed: clone(p.assumed), actual: clone(p.actual), violationPolicy: p.violationPolicy, tieBreak: 'stable', stopAt: '2s'
  };
}

function ensureScenario(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('not a scenario object');
  s = clone(s);
  if (!Array.isArray(s.nodes)) throw new Error('"nodes" must be a list');
  if (typeof s.code !== 'string') throw new Error('"code" must be text');
  if (s.links !== undefined && !Array.isArray(s.links)) throw new Error('"links" must be a list');
  if (s.faults !== undefined && !Array.isArray(s.faults)) throw new Error('"faults" must be a list');
  const base = EX.PRESETS.async;
  const out = Object.assign({
    version: 1, seed: 1, nodes: [], links: [], code: '', top: '', inputs: '', faults: [], preset: 'custom',
    stopAt: '5s', tieBreak: 'stable', violationPolicy: base.violationPolicy, haltOnAssert: false
  }, s);
  out.assumed = Object.assign({}, base.assumed, s.assumed || {});
  out.actual = Object.assign({}, base.actual, s.actual || {});
  out.seed = parseInt(out.seed, 10) || 0;
  const seen = new Set();
  out.nodes = out.nodes.map(n => ({ id: Math.trunc(+(n && n.id)), x: +(n && n.x) || 0, y: +(n && n.y) || 0 }))
    .filter(n => Number.isFinite(n.id) && n.id > 0 && !seen.has(n.id) && seen.add(n.id));
  if (typeof out.inputs !== 'string') out.inputs = '';
  if (typeof out.stopAt !== 'string') out.stopAt = String(out.stopAt || '5s');
  out.links = (out.links || []).filter(l => l && typeof l === 'object').map(l => ({
    a: +l.a, b: +l.b, directed: !!l.directed, enabled: l.enabled !== false,
    loss: l.loss === null || l.loss === undefined ? '' : String(l.loss), delay: l.delay || ''
  }));
  out.faults = (out.faults || []).filter(f => f && typeof f === 'object').map(f => {
    const type = f.type || 'crash';
    const str = v => (v === null || v === undefined ? '' : String(v));
    if (type === 'link') return { type, a: +f.a, b: +f.b, from: str(f.from), to: str(f.to) };
    if (type === 'partition') return { type, groups: Array.isArray(f.groups) ? f.groups.map(g => [].concat(g).join(' ')).join(' | ') : str(f.groups), from: str(f.from), to: str(f.to) };
    return { type, node: +f.node, at: str(f.at) };
  });
  if (out.preset !== 'custom' && !EX.PRESETS[out.preset]) out.preset = 'custom';
  return out;
}

// Form fields are bound to scenario properties through data-bind paths written in the template.
// Only own properties are followed, and keys that could reach a prototype are refused.
function pathKeys(p) {
  const ks = String(p).split('.');
  if (ks.some(k => !k || UNSAFE_KEYS.has(k))) throw new Error('Invalid property path: ' + p);
  return ks;
}
function getPath(o, p) {
  let a = o;
  for (const k of pathKeys(p)) {
    if (a === null || typeof a !== 'object' || !Object.prototype.hasOwnProperty.call(a, k)) return undefined;
    a = a[k];
  }
  return a;
}
function setPath(o, p, v) {
  const ks = pathKeys(p);
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i];
    if (!Object.prototype.hasOwnProperty.call(a, k) || a[k] === null || typeof a[k] !== 'object') {
      Object.defineProperty(a, k, { value: {}, writable: true, enumerable: true, configurable: true });
    }
    a = a[k];
  }
  Object.defineProperty(a, ks[ks.length - 1], { value: v, writable: true, enumerable: true, configurable: true });
}

// ============================================================ validation
function validate(kind, v) {
  v = String(v === null || v === undefined ? '' : v).trim();
  try {
    switch (kind) {
      case 'dist': C.parseDist(v); break;
      case 'dist-x': C.parseDist(v, true); break;
      case 'dist-opt': if (v) C.parseDist(v); break;
      case 'dur': if (C.parseDuration(v) === null) throw new Error('A duration is required, e.g. 50ms'); break;
      case 'dur-opt': if (v && v !== 'none') C.parseDuration(v); break;
      case 'dur-unknown':
        if (v && v !== 'unknown') { const d = C.parseDuration(v); if (d === null || d <= 0) throw new Error('A positive duration or unknown'); }
        break;
      case 'num-unknown':
        if (v && v !== 'unknown' && !(parseFloat(v) >= 0 && /^[0-9.eE+-]+$/.test(v))) throw new Error('A number ≥ 0 or unknown');
        break;
      case 'prob': { const x = v === '' ? 0 : Number(v); if (!(x >= 0 && x <= 1)) throw new Error('A value between 0 and 1'); break; }
    }
    return null;
  } catch (e) { return e.message; }
}
function setInvalid(inp, err) {
  inp.setAttribute('aria-invalid', err ? 'true' : 'false');
  const f = inp.closest('.field');
  if (!f) { inp.title = err || ''; return; }
  let m = f.querySelector('.msg-err');
  if (err) { if (!m) { m = el('span', { class: 'msg-err' }); f.append(m); } m.textContent = err; }
  else if (m) m.remove();
}

// ============================================================ forms
function bindForms() {
  $$('[data-bind]').forEach(inp => {
    const evName = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
    inp.addEventListener(evName, () => {
      const path = inp.dataset.bind;
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (path === 'seed') v = parseInt(v, 10) || 0;
      if (inp.dataset.kind) setInvalid(inp, validate(inp.dataset.kind, v));
      setPath(S.scn, path, v);
      const timingField = path.startsWith('assumed.') || path.startsWith('actual.') || path === 'violationPolicy' || path === 'tieBreak';
      if (timingField) {
        S.scn.preset = 'custom';
        if (path === 'assumed.timing') onTimingChange();
        renderPresets(); syncBodyAttrs(); scheduleCheck(); drawPreview();
      }
      markStale();
    });
  });
}
function fillForms() {
  $$('[data-bind]').forEach(inp => {
    const v = getPath(S.scn, inp.dataset.bind);
    if (inp.type === 'checkbox') inp.checked = !!v;
    else inp.value = v === null || v === undefined ? '' : v;
    if (inp.dataset.kind) setInvalid(inp, validate(inp.dataset.kind, inp.value));
  });
  $('#code').value = S.scn.code;
  onTimingChange();
  syncBodyAttrs(); renderPresets(); renderFaults(); refreshCode(); drawPreview();
}
function onTimingChange() {
  const asyncM = S.scn.assumed.timing === 'asynchronous';
  for (const k of ['DELTA', 'PHI', 'RHO']) {
    const inp = $('[data-bind="assumed.' + k + '"]');
    if (asyncM) { S.scn.assumed[k] = 'unknown'; inp.value = 'unknown'; setInvalid(inp, null); }
    inp.disabled = asyncM;
  }
}
function syncBodyAttrs() {
  document.body.dataset.mode = S.mode;
  if (!S.scn) return;
  document.body.dataset.timing = S.scn.assumed.timing;
  document.body.dataset.roundmode = S.scn.actual.roundMode;
}
function renderPresets() {
  const box = $('#presets'); box.textContent = '';
  for (const k of Object.keys(EX.PRESETS)) {
    const on = S.scn.preset === k;
    box.append(el('button', { type: 'button', class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', onclick: () => applyPreset(k) }, EX.PRESETS[k].label));
  }
  if (S.scn.preset === 'custom') box.append(el('span', { class: 'custom' }, 'Custom'));
  $('#preset-note').textContent = EX.PRESETS[S.scn.preset]
    ? EX.PRESETS[S.scn.preset].note
    : 'Parameters edited by hand. Pick a preset to start again from a known configuration.';
}
function applyPreset(k) {
  const p = EX.PRESETS[k];
  S.scn.assumed = clone(p.assumed); S.scn.actual = clone(p.actual);
  S.scn.violationPolicy = p.violationPolicy; S.scn.preset = k;
  fillForms(); scheduleCheck(); markStale();
}

function markStale() {
  S.stale = !!S.res;
  $('#stale').hidden = !S.stale;
  $('#btn-run').classList.toggle('pulse', S.stale);
  scheduleSave();
}
let saveT = 0;
function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(() => store.set(STORE_KEY, JSON.stringify(S.scn)), 400); }

// ============================================================ code editor
const BI = new Set([...C.BUILTIN_VARS, ...Object.keys(C.BUILTIN_FUNS), 'timer']);
function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
// The highlighted copy of the editor is built as DOM nodes: the code is only ever used as text.
function highlight(src, errLines) {
  const frag = document.createDocumentFragment();
  const lines = src.split('\n');
  let inBlock = false;
  lines.forEach((line, i) => {
    const row = document.createElement('span');
    row.className = 'ln' + (errLines.has(i + 1) ? ' e' : '');
    const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; row.append(s); };
    const plain = text => row.append(text);
    let j = 0;
    while (j < line.length) {
      if (inBlock) {
        const e = line.indexOf('*/', j);
        const end = e < 0 ? line.length : e + 2;
        span('t-cm', line.slice(j, end));
        j = end; if (e >= 0) inBlock = false;
        continue;
      }
      const rest = line.slice(j);
      let m;
      if (rest.startsWith('//')) { span('t-cm', rest); break; }
      if (rest.startsWith('/*')) { span('t-cm', '/*'); j += 2; inBlock = true; continue; }
      if ((m = /^"(?:[^"\\]|\\.)*"?/.exec(rest))) { span('t-str', m[0]); j += m[0].length; continue; }
      if ((m = /^\d+(?:\.\d+)?(?:[eE]-?\d+)?(?:us|ms|s)?(?![A-Za-z0-9_])/.exec(rest))) { span('t-num', m[0]); j += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
        const w = m[0];
        let cls = '';
        if (C.KEYWORDS.has(w)) cls = 't-kw';
        else if (BI.has(w)) cls = 't-bi';
        else if (C.isAtomName(w)) cls = 't-at';
        else if (/^[A-Z]/.test(w)) cls = 't-ty';
        if (cls) span(cls, w); else plain(w);
        j += w.length; continue;
      }
      const c = rest[0];
      if (c === 'Π') span('t-bi', c);
      else if ('⟨⟩∪∩∈∉∅∧∨¬⊆≠≤≥←\\↦'.includes(c)) span('t-op', c);
      else plain(c);
      j++;
    }
    if (!row.childNodes.length) row.append(' ');
    frag.append(row);
  });
  const last = document.createElement('span');
  last.className = 'ln';
  last.textContent = ' ';
  frag.append(last);
  return frag;
}
function refreshCode() {
  if (!S.scn) return;
  const src = S.scn.code;
  const errLines = new Set(S.diag.errors.map(e => e.line).filter(Boolean));
  if (S.runtimeErr && S.runtimeErr.line) errLines.add(S.runtimeErr.line);
  $('#code-hl').replaceChildren(highlight(src, errLines));
  const n = src.split('\n').length;
  const gutter = document.createDocumentFragment();
  for (let i = 1; i <= n; i++) {
    if (errLines.has(i)) { const e = document.createElement('span'); e.className = 'e'; e.textContent = String(i); gutter.append(e, '\n'); }
    else gutter.append(i + '\n');
  }
  gutter.append('\n');
  $('#gutter').replaceChildren(gutter);
  syncScroll();
}
function syncScroll() {
  const ta = $('#code'), hl = $('#code-hl');
  hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft;
  $('#gutter').scrollTop = ta.scrollTop;
}
function knownFromScn() {
  const a = S.scn.assumed, r = {};
  for (const k of ['DELTA', 'PHI', 'RHO']) {
    const v = String(a[k] === null || a[k] === undefined ? '' : a[k]).trim();
    if (!v || v === 'unknown' || a.timing === 'asynchronous') { r[k] = null; continue; }
    try { r[k] = k === 'RHO' ? parseFloat(v) : C.parseDuration(v); } catch (e) { r[k] = null; }
  }
  return r;
}
function checkCode() {
  let prog = null, d;
  try {
    prog = C.parseProgram(S.scn.code);
    d = C.check(prog, { timing: S.scn.assumed.timing, roundMode: S.scn.actual.roundMode, known: knownFromScn() });
  } catch (e) {
    if (e instanceof C.DslError) d = { errors: [{ msg: e.message, line: e.line, col: e.col }], warnings: [] };
    else d = { errors: [{ msg: 'Internal checker error: ' + e.message, line: 0 }], warnings: [] };
  }
  S.diag = { errors: d.errors, warnings: d.warnings };
  if (prog) {
    S.algos = prog.algorithms.map(a => ({ name: a.name, impl: a.implType, uses: a.uses.map(u => u.type) }));
    S.ifaces = prog.interfaces;
  }
  renderTopSelect(); updateTopReqs(); renderDiag(); refreshCode();
}
function updateTopReqs() {
  const a = (S.algos || []).find(x => x.name === S.scn.top);
  const it = a && S.ifaces ? S.ifaces.get(a.impl) : null;
  const next = it ? [...it.requests].map(([name, arity]) => ({ name, arity })) : [];
  const changed = JSON.stringify(next) !== JSON.stringify(S.topReqs);
  S.topReqs = next;
  if (changed && S.selected && S.selected.type === 'node') renderProps();
}
let checkT = 0;
function scheduleCheck() { clearTimeout(checkT); checkT = setTimeout(checkCode, 300); }
function renderTopSelect() {
  const sel = $('#top');
  const algos = S.algos || [];
  if (!algos.some(a => a.name === S.scn.top)) {
    const used = new Set(algos.flatMap(a => a.uses));
    const cand = algos.filter(a => !used.has(a.impl));
    const pick = cand[cand.length - 1] || algos[algos.length - 1];
    S.scn.top = pick ? pick.name : '';
  }
  sel.textContent = '';
  for (const a of algos) sel.append(el('option', { value: a.name }, a.name + ' (' + a.impl + ')'));
  sel.value = S.scn.top;
}
function renderDiag() {
  const ul = $('#diag'); ul.textContent = '';
  const items = [
    ...S.diag.errors.map(e => ['err', e]),
    ...(S.runtimeErr ? [['err', S.runtimeErr]] : []),
    ...S.diag.warnings.map(w => ['warn', w])
  ];
  if (!items.length) { ul.append(el('li', { class: 'ok' }, 'No errors: the code is consistent with the assumed model.')); return; }
  for (const [cls, e] of items) {
    ul.append(el('li', { class: cls, onclick: () => gotoLine(e.line, e.col) },
      e.line ? el('span', { class: 'ln' }, 'line ' + e.line) : null, e.msg));
  }
}
function gotoLine(line, col) {
  if (!line) return;
  if (S.tab !== 'code') setTab('code');
  const ta = $('#code');
  const lines = ta.value.split('\n');
  let off = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
  const end = off + (lines[line - 1] || '').length;
  ta.focus();
  ta.setSelectionRange(Math.min(end, off + Math.max(0, (col || 1) - 1)), end);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 19;
  ta.scrollTop = Math.max(0, (line - 5) * lh);
  syncScroll();
}
function insertText(t) {
  const ta = $('#code');
  ta.focus();
  let ok = false;
  try { ok = document.execCommand && document.execCommand('insertText', false, t); } catch (e) { ok = false; }
  if (!ok) {
    ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  }
}
function bindEditor() {
  const ta = $('#code');
  ta.addEventListener('input', () => {
    S.scn.code = ta.value; S.runtimeErr = null;
    refreshCode(); scheduleCheck(); markStale();
  });
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); insertText('  '); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const v = ta.value, p = ta.selectionStart;
      const ls = v.lastIndexOf('\n', p - 1) + 1;
      const before = v.slice(ls, p);
      const ind = /^[ \t]*/.exec(before)[0];
      const extra = /(\bdo|\bthen|\belse|^\s*state|^\s*params|^\s*interface\b.*|^\s*algorithm\b.*)\s*$/.test(before) ? '  ' : '';
      insertText('\n' + ind + extra);
    }
  });
  $$('.symbols button').forEach(b => b.addEventListener('click', () => insertText(b.dataset.ins)));
  $('#top').addEventListener('change', e => { S.scn.top = e.target.value; updateTopReqs(); markStale(); });
  const addSel = $('#add-module');
  const groups = {};
  for (const m of LIB.MODULES) {
    if (!groups[m.group]) { groups[m.group] = el('optgroup', { label: m.group }); addSel.append(groups[m.group]); }
    groups[m.group].append(el('option', { value: m.key }, m.name + ' (' + m.implements + ')'));
  }
  addSel.addEventListener('change', () => {
    const k = addSel.value;
    addSel.value = '';
    if (k) insertModule(k);
  });
}
function insertModule(key) {
  let prog;
  try { prog = C.parseProgram(S.scn.code); }
  catch (e) { toast('Fix the syntax errors in the code before adding a module.'); return; }
  const m = LIB.byKey.get(key);
  if (prog.algorithms.some(a => a.name === m.name)) { toast(m.name + ' is already in the code.'); return; }
  const plan = LIB.plan(key, prog.algorithms.map(a => a.implType), [...prog.interfaces.keys()]);
  const parts = plan.interfaces.map(i => LIB.IFACES[i]).concat(plan.modules.filter(x => !prog.algorithms.some(a => a.name === x.name)).map(x => x.source));
  const ta = $('#code');
  const text = ta.value.replace(/\s*$/, '') + '\n\n' + parts.join('\n\n') + '\n';
  ta.value = text;
  S.scn.code = text;
  S.runtimeErr = null;
  refreshCode(); checkCode(); markStale();
  ta.scrollTop = ta.scrollHeight; syncScroll();
  const added = plan.modules.map(x => x.name);
  toast('Added ' + added.join(', ') + '. Use it with "uses ' + m.implements + ' as …".');
  const info = $('#module-info');
  info.hidden = false;
  info.textContent = m.name + ': ' + m.summary + ' Guarantees: ' + m.properties;
}

// ============================================================ topology
const svg = () => $('#topo');
function nodeById(id) {
  if (!S.nodeMap || S.nodeMapVer !== S.topoVer) { S.nodeMap = new Map(S.scn.nodes.map(n => [n.id, n])); S.nodeMapVer = S.topoVer; }
  return S.nodeMap.get(id);
}
function nextId() { return S.scn.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1; }
function neighborsOf(id) {
  const out = new Set();
  for (const l of S.scn.links) {
    if (l.a === id) out.add(l.b);
    else if (!l.directed && l.b === id) out.add(l.a);
  }
  return [...out].sort((a, b) => a - b);
}
function svgPoint(evt) {
  const s = svg(); const pt = s.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(s.getScreenCTM().inverse());
}
function fitView() {
  const ns = S.scn.nodes, s = svg();
  const fx = $('#topo-fx');
  if (!ns.length) { s.setAttribute('viewBox', '0 0 700 460'); fx.setAttribute('viewBox', '0 0 700 460'); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const pad = 80;
  const w = Math.max(x1 - x0 + 2 * pad, 420), h = Math.max(y1 - y0 + 2 * pad, 300);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = (cx - w / 2) + ' ' + (cy - h / 2) + ' ' + w + ' ' + h;
  s.setAttribute('viewBox', vb);
  fx.setAttribute('viewBox', vb);
}
function unit(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
function linkGeom(a, b, curved) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const [ux, uy] = unit(dx, dy);
  let cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  if (curved) { cx += -uy * 24; cy += ux * 24; }
  const sa = unit(cx - a.x, cy - a.y), sb = unit(cx - b.x, cy - b.y);
  return { x1: a.x + sa[0] * R_NODE, y1: a.y + sa[1] * R_NODE, x2: b.x + sb[0] * (R_NODE + 2), y2: b.y + sb[1] * (R_NODE + 2), cx, cy };
}
function geomPath(g) { return 'M' + g.x1 + ' ' + g.y1 + ' Q' + g.cx + ' ' + g.cy + ' ' + g.x2 + ' ' + g.y2; }
function geomAt(g, f) { const u = 1 - f; return [u * u * g.x1 + 2 * u * f * g.cx + f * f * g.x2, u * u * g.y1 + 2 * u * f * g.cy + f * f * g.y2]; }
// first part of the quadratic curve, up to parameter f (de Casteljau)
function geomPrefix(g, f) {
  const qx = g.x1 + (g.cx - g.x1) * f, qy = g.y1 + (g.cy - g.y1) * f;
  const [px, py] = geomAt(g, f);
  return 'M' + g.x1.toFixed(1) + ' ' + g.y1.toFixed(1) + ' Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + px.toFixed(1) + ' ' + py.toFixed(1);
}
function dirSet() {
  if (!V.dirSet || V.dirVer !== S.topoVer) {
    V.dirSet = new Set(S.scn.links.filter(l => l.directed).map(l => l.a + '>' + l.b));
    V.dirVer = S.topoVer;
  }
  return V.dirSet;
}
function isCurved(a, b) { const d = dirSet(); return d.has(a + '>' + b) && d.has(b + '>' + a); }
function msgGeom(m) {
  const a = nodeById(m.from), b = nodeById(m.to);
  if (!a || !b || m.from === m.to) return null;
  return linkGeom(a, b, isCurved(m.from, m.to));
}
// is process id down at time t in the last run?
function downAt(id, t) {
  const d = S.res && S.res.downs[id];
  if (!d) return null;
  for (const x of d) if (t >= x.from && (x.to === null || t < x.to)) return x;
  return null;
}
// is the channel between a and b interrupted at time t in the last run?
function cutAtUI(a, b, t) {
  const nf = S.res && S.res.netFaults;
  if (!nf) return null;
  for (const l of nf.links)
    if (((l.a === a && l.b === b) || (l.a === b && l.b === a)) && t >= l.from && (l.to === null || t < l.to)) return 'link down';
  for (const p of nf.partitions) {
    if (t < p.from || (p.to !== null && t >= p.to)) continue;
    if (!p.groupOf) { p.groupOf = new Map(); p.groups.forEach((g, i) => g.forEach(id => p.groupOf.set(id, i))); }
    const ga = p.groupOf.has(a) ? p.groupOf.get(a) : -1, gb = p.groupOf.has(b) ? p.groupOf.get(b) : -1;
    if (ga !== gb) return 'partition';
  }
  return null;
}
function lastOutput(id, t) { return lastAtOrBefore(S.outIdx[id] || [], t, o => o.t); }
function snapAt(id, t) { return S.res ? lastAtOrBefore(S.res.snaps[id] || [], t, s => s.t) : null; }
function packetLabel(m) {
  const mm = /^\[([A-Z][A-Z0-9_]+)/.exec(m.payload);
  return mm ? mm[1] : truncate(m.payload, 14);
}

// ---- topology rendering
// The static part (links and process nodes) is rebuilt only when the topology, the selection or the run
// changes; on every frame the existing elements are updated in place, and the animation layers reuse
// pooled elements. This keeps playback smooth on large graphs.
const V = { key: '', nodes: new Map(), links: [], dir: new Set(), pools: {} };
function topoChanged() { S.topoVer = (S.topoVer || 0) + 1; }
function staticKey() { return String(S.topoVer || 0); }
function buildStatic() {
  const gL = $('#g-links'), gN = $('#g-nodes');
  gL.textContent = ''; gN.textContent = '';
  S.nodeMap = new Map(S.scn.nodes.map(n => [n.id, n]));
  V.dir = new Set(S.scn.links.filter(l => l.directed).map(l => l.a + '>' + l.b));
  V.links = [];
  S.scn.links.forEach((l, i) => {
    const a = nodeById(l.a), b = nodeById(l.b);
    if (!a || !b) return;
    const g = linkGeom(a, b, l.directed && isCurved(l.a, l.b));
    const d = geomPath(g);
    const path = sv('path', { d, class: 'lk' });
    const hit = sv('path', { d, class: 'lk-hit', 'data-link': i });
    const title = sv('title', {});
    hit.append(title);
    const [mx, my] = geomAt(g, 0.5);
    const mark = sv('text', { x: mx, y: my, class: 'cut-mark', display: 'none' }, '✂');
    gL.append(path, hit, mark);
    V.links.push({ l, i, path, hit, title, mark, cut: undefined, state: {} });
  });
  V.nodes = new Map();
  for (const n of S.scn.nodes) {
    const g = sv('g', { class: 'nd', 'data-node': n.id, transform: 'translate(' + n.x + ' ' + n.y + ')', tabindex: 0, role: 'button', 'aria-label': 'Process p' + n.id });
    const glow = sv('circle', { r: R_NODE + 6, class: 'glow', display: 'none' });
    const cross = sv('path', { class: 'cross', d: 'M-10 -10L10 10M10 -10L-10 10', display: 'none' });
    const icon = sv('text', { class: 'icon', x: -R_NODE - 4, y: -R_NODE + 2, display: 'none' }, '⏱');
    const out = sv('text', { class: 'out', y: R_NODE + 14, display: 'none' });
    const badge = sv('text', { class: 'badge', x: R_NODE + 3, y: -R_NODE + 2, display: 'none' });
    badge.style.textAnchor = 'start';
    g.append(glow, sv('circle', { r: R_NODE, class: 'body' }), sv('text', { class: 'name' }, 'p' + n.id), cross, icon, out, badge);
    gN.append(g);
    V.nodes.set(n.id, { g, glow, cross, icon, out, badge, state: {} });
  }
  V.key = staticKey();
}
// move a process and its links in place while dragging (no rebuild, so the dragged element survives)
function moveNodeDOM(n) {
  const R = V.nodes.get(n.id);
  if (R) R.g.setAttribute('transform', 'translate(' + n.x + ' ' + n.y + ')');
  for (const L of V.links) {
    if (L.l.a !== n.id && L.l.b !== n.id) continue;
    const a = nodeById(L.l.a), b = nodeById(L.l.b);
    if (!a || !b) continue;
    const g = linkGeom(a, b, L.l.directed && isCurved(L.l.a, L.l.b));
    const d = geomPath(g);
    L.path.setAttribute('d', d); L.hit.setAttribute('d', d);
    const [mx, my] = geomAt(g, 0.5);
    L.mark.setAttribute('x', mx); L.mark.setAttribute('y', my);
  }
}
// set an attribute or text only when it changes
function setIf(rec, k, el, attr, v) {
  if (rec.state[k] === v) return;
  rec.state[k] = v;
  if (attr === 'text') el.textContent = v;
  else if (attr === 'class') el.setAttribute('class', v);
  else el.setAttribute(attr, v);
}
function renderTopo() {
  if (!S.scn) return;
  if (V.key !== staticKey()) buildStatic();
  const t = S.cursor;
  for (const L of V.links) {
    const cut = S.res ? cutAtUI(L.l.a, L.l.b, t) : null;
    const sel = !!(S.selected && S.selected.type === 'link' && S.selected.idx === L.i);
    setIf(L, 'cls', L.path, 'class', 'lk' + (L.l.enabled ? '' : ' off') + (cut ? ' cut' : '') + (sel ? ' sel' : ''));
    if (L.l.directed) setIf(L, 'mk', L.path, 'marker-end', sel ? 'url(#arrow-sel)' : 'url(#arrow)');
    if (cut === L.cut) continue;
    L.cut = cut;
    L.mark.setAttribute('display', cut ? 'inline' : 'none');
    L.title.textContent = 'p' + L.l.a + (L.l.directed ? ' → ' : ' — ') + 'p' + L.l.b + (L.l.enabled ? '' : ' (disabled)') + (cut ? ' (' + cut + ')' : '');
  }
  const busy = busyAt(t);
  for (const [id, R] of V.nodes) {
    const crashed = !!downAt(id, t);
    const b = crashed ? null : busy.get(id);
    const base = 'nd' + (S.selected && S.selected.type === 'node' && S.selected.id === id ? ' sel' : '') + (S.linkFrom === id ? ' from' : '');
    let coneCls = '';
    if (S.cone) {
      if (id === S.cone.node) coneCls = ' origin';
      else if (t >= S.cone.future[id]) coneCls = ' influenced';
      else if (t <= S.cone.past[id]) coneCls = ' cause';
    }
    setIf(R, 'cls', R.g, 'class', base + (crashed ? ' crashed' : '') + (b ? ' busy' : '') + coneCls);
    setIf(R, 'cross', R.cross, 'display', crashed ? 'inline' : 'none');
    if (b) {
      setIf(R, 'glow', R.glow, 'display', 'inline');
      R.glow.setAttribute('r', (R_NODE + 6 + 3 * b.strength).toFixed(1));
      R.glow.setAttribute('opacity', (0.25 + 0.55 * b.strength).toFixed(2));
    } else setIf(R, 'glow', R.glow, 'display', 'none');
    setIf(R, 'icon', R.icon, 'display', b && b.timer ? 'inline' : 'none');
    const o = S.res ? lastOutput(id, t) : null;
    setIf(R, 'outd', R.out, 'display', o ? 'inline' : 'none');
    if (o) setIf(R, 'outt', R.out, 'text', truncate(o.text, 26));
    const sn = S.res && S.res.rounds ? snapAt(id, t) : null;
    const showBadge = !!(sn && sn.round > 0);
    setIf(R, 'bd', R.badge, 'display', showBadge ? 'inline' : 'none');
    if (showBadge) {
      setIf(R, 'bdt', R.badge, 'text', 'r' + sn.round);
      setIf(R, 'bdc', R.badge, 'class', 'badge' + (b && b.round ? ' flash' : ''));
    }
  }
  renderAnim();
}

// which nodes are processing an event at time t (with a fading tail after the step ends)
function busyAt(t) {
  const out = new Map();
  if (!S.res || !S.activity.length) return out;
  const W = S.pulse;
  const lo = lowerBound(S.activity, t - S.maxBusy - W, a => a.t);
  const hi = upperBound(S.activity, t, a => a.t);
  for (let i = lo; i < hi; i++) {
    const a = S.activity[i];
    const until = Math.max(a.end, a.t + W);
    if (t > until) continue;
    const strength = t <= a.end ? 1 : 1 - (t - a.end) / Math.max(1, until - a.end);
    const cur = out.get(a.node) || { strength: 0, timer: false, round: false };
    cur.strength = Math.max(cur.strength, strength);
    if (a.type === 'timer') cur.timer = true;
    if (a.type === 'roundStart') cur.round = true;
    out.set(a.node, cur);
  }
  return out;
}

// a pool of SVG elements in one layer: take() hands out an element, finish() hides the unused ones
function pool(layerId, make) {
  let P = V.pools[layerId + ':' + make.name];
  if (!P) {
    P = V.pools[layerId + ':' + make.name] = { items: [], used: 0, layer: $(layerId) };
  }
  return {
    take() {
      let it = P.items[P.used];
      if (!it) { it = make(); P.items.push(it); P.layer.append(it.root); }
      else if (it.hidden) { it.root.removeAttribute('display'); it.hidden = false; }
      P.used++;
      return it;
    },
    finish() {
      for (let i = P.used; i < P.items.length; i++) {
        const it = P.items[i];
        if (!it.hidden) { it.root.setAttribute('display', 'none'); it.hidden = true; }
      }
      P.used = 0;
    }
  };
}
function resetPools() {
  for (const k in V.pools) { const P = V.pools[k]; P.items.forEach(it => it.root.remove()); }
  V.pools = {};
}
function mkTrail() { const root = sv('path', {}); return { root }; }
function mkPacket() {
  const root = sv('g', {});
  const rect = sv('rect', { y: -8.5, height: 17, rx: 8.5 });
  const dot = sv('circle', { r: 5.5 });
  const text = sv('text', {});
  const title = sv('title', {});
  root.append(rect, dot, text, title);
  return { root, rect, dot, text, title, s: {} };
}
function mkRing() { const root = sv('circle', {}); return { root }; }
function mkBurst() { const root = sv('path', {}); return { root }; }
function mkBubble() {
  const root = sv('g', { class: 'bubble' });
  const path = sv('path', {});
  const text = sv('text', { y: -12 });
  root.append(path, text);
  return { root, path, text, s: {} };
}

// packets in flight, trails, arrival ripples, loss marks, output bubbles, crash and recovery flashes
function renderAnim() {
  const trails = pool('#g-fx', mkTrail), rings = pool('#g-fx', mkRing);
  const packets = pool('#g-msgs', mkPacket);
  const bursts = pool('#g-top', mkBurst), bubbles = pool('#g-top', mkBubble);
  if (S.res) {
    const t = S.cursor, W = S.pulse;
    // with many packets on screen, labels and trails only add clutter and cost
    const crowd = S.lastInFlight || 0;
    const labels = $('#labels').checked && crowd <= 120;
    const layers = layersOn();
    const withTrails = crowd <= 200;
    const sel = S.selected && S.selected.type === 'msg' ? S.selected.id : null;
    const hi = upperBound(S.msgsBySend, t, m => m.sendT);
    const lo = lowerBound(S.msgsBySend, t - S.maxLat - W, m => m.sendT);
    let count = 0;
    for (let i = lo; i < hi; i++) {
      const m = S.msgsBySend[i];
      if (m.status === 'dropped-link' || m.recvT === null) continue;
      if (m.status === 'dropped-cut' && m.recvT === m.sendT) continue;
      const self = m.from === m.to;
      const inFlight = m.recvT > t && m.recvT > m.sendT;
      if (inFlight) {
        if (self || count >= 400) continue;
        const g = msgGeom(m);
        if (!g) continue;
        let f = (t - m.sendT) / (m.recvT - m.sendT);
        f = 1 - Math.pow(1 - f, 1.6);
        if (m.status === 'dropped-loss') f *= 0.5;
        if (labels) f = 0.14 + 0.72 * f;
        const cls = m.violation ? 'late' : (m.status === 'dropped-loss' || m.status === 'dropped-cut') ? 'lossy' : m.status === 'lost-crash' ? 'doomed' : 'ok';
        const tint = layers && cls === 'ok' ? layerColor(m.origin) : '';
        if (withTrails) {
          const tr = trails.take();
          tr.root.setAttribute('d', geomPrefix(g, f));
          tr.root.setAttribute('class', 'trail ' + cls);
          tr.root.style.stroke = tint;
        }
        const [x, y] = geomAt(g, f);
        const P = packets.take();
        P.root.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
        const pcls = 'pk ' + cls + (m.dup ? ' dup' : '') + (sel === m.id ? ' sel' : '');
        if (P.s.cls !== pcls) { P.root.setAttribute('class', pcls); P.s.cls = pcls; }
        if (P.s.tint !== tint) { P.s.tint = tint; P.rect.style.fill = tint; P.rect.style.stroke = tint; P.dot.style.fill = tint; P.dot.style.stroke = tint; }
        if (P.s.id !== m.id || P.s.labels !== labels) {
          P.s.id = m.id; P.s.labels = labels;
          P.root.setAttribute('data-msg', m.id);
          P.title.textContent = 'p' + m.from + ' → p' + m.to + ': ' + m.payload;
          if (labels) {
            const txt = packetLabel(m);
            const w = Math.max(18, txt.length * 6.7 + 12);
            P.rect.setAttribute('x', -w / 2); P.rect.setAttribute('width', w);
            P.rect.removeAttribute('display'); P.text.removeAttribute('display');
            P.dot.setAttribute('display', 'none');
            P.text.textContent = txt;
          } else {
            P.rect.setAttribute('display', 'none'); P.text.setAttribute('display', 'none');
            P.dot.removeAttribute('display');
          }
        }
        count++;
        continue;
      }
      // arrival effects within the pulse window
      const age = t - m.recvT;
      if (age < 0 || age > W) continue;
      const k = age / Math.max(1, W);
      const to = nodeById(m.to);
      if (!to) continue;
      if (m.status === 'delivered') {
        const r = rings.take().root;
        r.setAttribute('cx', to.x); r.setAttribute('cy', to.y);
        r.setAttribute('r', (R_NODE + 4 + 16 * k).toFixed(1));
        r.setAttribute('class', 'ripple' + (m.violation ? ' late' : ''));
        r.setAttribute('opacity', (1 - k).toFixed(2));
      } else {
        let x, y;
        const g = msgGeom(m);
        if (m.status === 'dropped-loss' && g) [x, y] = geomAt(g, 0.5);
        else if (g) [x, y] = geomAt(g, 1);
        else { x = to.x; y = to.y; }
        const cls = (m.status === 'dropped-loss' || m.status === 'dropped-cut') ? 'lossy' : m.status === 'lost-crash' ? 'doomed' : 'late';
        const sz = 5 + 4 * k;
        const b = bursts.take().root;
        b.setAttribute('d', `M${x - sz} ${y - sz}L${x + sz} ${y + sz}M${x + sz} ${y - sz}L${x - sz} ${y + sz}`);
        b.setAttribute('class', 'burst ' + cls);
        b.setAttribute('opacity', (1 - k).toFixed(2));
      }
    }
    S.lastInFlight = count;
    // output bubbles
    for (const id in S.outIdx) {
      const n = nodeById(+id);
      if (!n) continue;
      const arr = S.outIdx[id];
      const i = upperBound(arr, t, o => o.t) - 1;
      if (i < 0) continue;
      const o = arr[i];
      const age = t - o.t;
      if (age > 2.5 * W) continue;
      const k = age / Math.max(1, 2.5 * W);
      const B = bubbles.take();
      B.root.setAttribute('transform', 'translate(' + n.x + ' ' + (n.y - R_NODE - 16) + ')');
      B.root.setAttribute('opacity', (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3).toFixed(2));
      const txt = truncate(o.text, 30);
      if (B.s.txt !== txt) {
        B.s.txt = txt;
        const w = txt.length * 6.6 + 16;
        B.path.setAttribute('d', `M${-w / 2} -22 h${w} a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h${-w / 2 + 6} l-6 6 l-6 -6 h${-w / 2 + 6} a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4z`);
        B.text.textContent = txt;
      }
    }
    // crash and recovery flashes
    for (const id in S.res.downs) {
      const n = nodeById(+id);
      if (!n) continue;
      for (const d of S.res.downs[id]) {
        for (const [at, cls] of [[d.from, 'crashring'], [d.to, 'recoverring']]) {
          if (at === null) continue;
          const age = t - at;
          if (age < 0 || age > 2 * W) continue;
          const k = age / Math.max(1, 2 * W);
          const r = rings.take().root;
          r.setAttribute('cx', n.x); r.setAttribute('cy', n.y);
          r.setAttribute('r', (R_NODE + 6 + 22 * k).toFixed(1));
          r.setAttribute('class', cls);
          r.setAttribute('opacity', (1 - k).toFixed(2));
        }
      }
    }
  }
  trails.finish(); rings.finish(); packets.finish(); bursts.finish(); bubbles.finish();
}

function select(sel) {
  S.selected = sel;
  renderTopo(); renderProps();
  if (S.tab === 'state') renderInspector();
  if (S.tab === 'stack') renderStack(true);
}
function setMode(m) {
  S.mode = m; S.linkFrom = null;
  $$('.seg [data-mode]').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  syncBodyAttrs(); renderTopo(); renderProps();
}
function bindTopo() {
  const s = svg();
  let drag = null;
  // Touch: SVG children ignore touch-action, so dragging a process uses touch events, which can be
  // cancelled reliably; a swipe on the empty graph still scrolls the page.
  let tdrag = null;
  const touchPoint = t => svgPoint({ clientX: t.clientX, clientY: t.clientY });
  s.addEventListener('touchstart', e => {
    const nEl = e.target.closest('[data-node]');
    if (S.mode !== 'move' || nEl) e.preventDefault();
    if (S.mode === 'move' && nEl && e.touches.length === 1) {
      const n = nodeById(+nEl.dataset.node);
      const p = touchPoint(e.touches[0]);
      if (n) tdrag = { id: n.id, dx: n.x - p.x, dy: n.y - p.y, moved: false };
    }
  }, { passive: false });
  s.addEventListener('touchmove', e => {
    if (!tdrag) return;
    e.preventDefault();
    const n = nodeById(tdrag.id);
    if (!n) return;
    const p = touchPoint(e.touches[0]);
    n.x = Math.round(p.x + tdrag.dx); n.y = Math.round(p.y + tdrag.dy);
    tdrag.moved = true;
    moveNodeDOM(n);
    renderAnim();
  }, { passive: false });
  const tend = () => { if (tdrag && tdrag.moved) scheduleSave(); tdrag = null; };
  s.addEventListener('touchend', tend);
  s.addEventListener('touchcancel', tend);
  $('#topo-fx').addEventListener('pointerdown', e => {
    const pEl = e.target.closest('[data-msg]');
    if (!pEl) return;
    e.stopPropagation();
    // a process under the pointer wins over a packet drawn on top of it
    const pt = svgPoint(e);
    const hit = S.scn.nodes.find(n => Math.hypot(n.x - pt.x, n.y - pt.y) <= R_NODE + 2);
    if (hit) { select({ type: 'node', id: hit.id }); return; }
    stopPlay();
    select({ type: 'msg', id: +pEl.dataset.msg });
  });
  s.addEventListener('pointerdown', e => {
    const nEl = e.target.closest('[data-node]'), lEl = e.target.closest('[data-link]');
    const id = nEl ? +nEl.dataset.node : null;
    const li = lEl ? +lEl.dataset.link : null;
    if (S.mode === 'move') {
      if (id !== null) {
        select({ type: 'node', id });
        if (e.pointerType !== 'touch') {
          const p = svgPoint(e), n = nodeById(id);
          drag = { id, dx: n.x - p.x, dy: n.y - p.y, moved: false };
          s.setPointerCapture(e.pointerId);
        }
      } else if (li !== null) select({ type: 'link', idx: li });
      else select(null);
    } else if (S.mode === 'add') {
      if (id === null && li === null) { const p = svgPoint(e); addNode(Math.round(p.x), Math.round(p.y)); }
      else if (id !== null) select({ type: 'node', id });
    } else if (S.mode === 'link') {
      if (id !== null && S.linkFrom === null) S.linkFrom = id;
      else if (id !== null && S.linkFrom !== id) { const a = S.linkFrom; S.linkFrom = null; addLink(a, id); return; }
      else S.linkFrom = null;
      renderTopo(); renderProps();
    } else if (S.mode === 'delete') {
      if (id !== null) deleteNode(id);
      else if (li !== null) deleteLink(li);
    }
  });
  s.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = svgPoint(e), n = nodeById(drag.id);
    if (!n) return;
    n.x = Math.round(p.x + drag.dx); n.y = Math.round(p.y + drag.dy);
    drag.moved = true;
    moveNodeDOM(n);
    renderAnim();
  });
  const end = () => { if (drag && drag.moved) scheduleSave(); drag = null; };
  s.addEventListener('pointerup', end);
  s.addEventListener('pointercancel', end);
  s.addEventListener('keydown', e => {
    const nEl = e.target.closest && e.target.closest('[data-node]');
    if (nEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); select({ type: 'node', id: +nEl.dataset.node }); }
  });
  $$('.seg [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#btn-gen').addEventListener('click', () => generate($('#gen').value, parseInt($('#gen-n').value, 10) || 6));
  $('#btn-fit').addEventListener('click', fitView);
  $('#labels').addEventListener('change', renderAnim);
}
function topologyChanged() {
  topoChanged();
  clearResults('Topology changed: press Run to simulate again.');
  renderTopo(); renderProps(); scheduleSave();
}
function addNode(x, y) {
  const id = nextId();
  S.scn.nodes.push({ id, x, y });
  S.selected = { type: 'node', id };
  topologyChanged();
}
function addLink(a, b) {
  const directed = $('#directed').checked;
  const dup = S.scn.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a && (!l.directed || !directed)));
  if (dup) { toast('That link already exists.'); renderTopo(); renderProps(); return; }
  S.scn.links.push({ a, b, directed, enabled: true, loss: '', delay: '' });
  S.selected = { type: 'link', idx: S.scn.links.length - 1 };
  topologyChanged();
}
function deleteNode(id) {
  S.scn.nodes = S.scn.nodes.filter(n => n.id !== id);
  S.scn.links = S.scn.links.filter(l => l.a !== id && l.b !== id);
  S.scn.faults = S.scn.faults.filter(f => !faultMentions(f, id)).concat(
    S.scn.faults.filter(f => f.type === 'partition' && faultMentions(f, id)).map(f => withoutFromPartition(f, id)).filter(Boolean));
  S.selected = null;
  renderFaults();
  topologyChanged();
}
function deleteLink(i) { S.scn.links.splice(i, 1); S.selected = null; topologyChanged(); }
function groupsOf(f) { try { return C.parseGroups(f.groups); } catch (e) { return []; } }
function faultMentions(f, id) {
  if (f.type === 'link') return f.a === id || f.b === id;
  if (f.type === 'partition') return groupsOf(f).some(g => g.includes(id));
  return f.node === id;
}
function withoutFromPartition(f, id) {
  const groups = groupsOf(f).map(g => g.filter(x => x !== id)).filter(g => g.length);
  return groups.length ? Object.assign({}, f, { groups: groups.map(g => g.join(' ')).join(' | ') }) : null;
}
function describeFault(f) {
  const until = f.to ? ' until ' + f.to : ' onwards';
  switch (f.type) {
    case 'crash': return 'p' + f.node + ' crashes at ' + f.at;
    case 'recover': return 'p' + f.node + ' recovers at ' + f.at;
    case 'link': return 'link p' + f.a + '–p' + f.b + ' down from ' + f.from + until;
    case 'partition': {
      const groups = groupsOf(f);
      const listed = new Set(groups.flat());
      const rest = S.scn.nodes.map(n => n.id).filter(id => !listed.has(id));
      const all = rest.length ? groups.concat([rest]) : groups;
      return 'partition ' + all.map(g => '{' + g.map(id => 'p' + id).join(', ') + '}').join(' | ') + ' from ' + f.from + until;
    }
  }
  return f.type;
}
// validate and add a fault; returns true on success
function addFault(f) {
  try { C.normalizeFault(f); }
  catch (e) { const m = e.message.replace(/^Fault \d*: /, ''); toast(m.charAt(0).toUpperCase() + m.slice(1) + '.'); return false; }
  const ids = f.type === 'link' ? [f.a, f.b] : f.type === 'partition' ? groupsOf(f).flat() : [f.node];
  const missing = ids.filter(id => !nodeById(id));
  if (missing.length) { toast('No such process: ' + missing.map(id => 'p' + id).join(', ')); return false; }
  S.scn.faults.push(f);
  renderFaults();
  markStale();
  return true;
}
// add a fault that starts at the cursor and continue the run from there
// build receives the cursor time as text; the cursor is rounded up to a whole microsecond
// so that, after the re-run, the fault is already in effect at the cursor
function faultHere(build, describe) {
  const resume = S.playing;
  S.cursor = Math.ceil(S.cursor);
  const f = build(fmtDurInput(S.cursor));
  if (!addFault(f)) return;
  run(true, resume);
  toast(describe + ' at ' + C.fmtDuration(S.cursor) + '.');
}
function untilFrom(input) {
  const v = input.value.trim();
  if (!v || v === 'forever') return '';
  const d = C.parseDuration(v);
  return d === null ? '' : fmtDurInput(S.cursor + d);
}
// add an external event at the cursor and re-run, keeping the cursor (what-if)
function injectEvent(id, ev, args) {
  S.cursor = Math.ceil(S.cursor);
  const line = fmtDurInput(S.cursor) + ' ' + id + ' ' + ev + (args ? ' | ' + args : '');
  try { C.parseInputs(line); } catch (e) { toast(e.message.replace(/^Input line 1: /, '')); return; }
  const text = S.scn.inputs.replace(/\s+$/, '');
  S.scn.inputs = (text ? text + '\n' : '') + line;
  $('#inputs').value = S.scn.inputs;
  const resume = S.playing;
  run(true, resume);
  toast('Injected ' + ev + ' on p' + id + ' at ' + C.fmtDuration(S.cursor) + '.');
}
function renderProps() {
  if (!S.scn) return;
  const box = $('#props'); box.textContent = '';
  const sel = S.selected;
  if (S.mode === 'link') {
    box.append(S.linkFrom === null ? 'Click the source process, then the destination.' : 'Source: p' + S.linkFrom + '. Now click the destination (Esc to cancel).');
    return;
  }
  if (S.mode === 'add') { box.append('Click an empty spot to add a process.'); return; }
  if (S.mode === 'delete') { box.append('Click a process or a link to delete it.'); return; }
  if (!sel) {
    box.append(S.scn.nodes.length
      ? S.scn.nodes.length + ' processes, ' + S.scn.links.length + ' links. Select an element to edit it, drag processes to move them, click a message in flight to inspect it.'
      : 'No processes yet: use the Node tool or a generator.');
    return;
  }
  if (sel.type === 'msg') { renderMsgProps(box, sel.id); return; }
  if (sel.type === 'node') {
    const n = nodeById(sel.id);
    if (!n) return;
    const nb = neighborsOf(n.id);
    const own = S.scn.faults.filter(f => faultMentions(f, n.id));
    box.append(
      el('b', {}, 'p' + n.id),
      el('span', {}, nb.length ? 'neighbors: ' + nb.map(x => 'p' + x).join(', ') : 'no neighbors'),
      el('span', { class: 'hint', style: 'margin:0' }, own.length ? own.length + (own.length === 1 ? ' fault' : ' faults') + ' scheduled' : 'no faults scheduled'),
      el('button', { type: 'button', class: 'ghost', onclick: () => deleteNode(n.id) }, 'Delete')
    );
    if (S.res) {
      const row = el('div', { class: 'inject' });
      row.append(el('span', { class: 'lbl' }, 'At ' + C.fmtDuration(S.cursor) + ':'));
      if (S.topReqs.length) {
        const evSel = el('select', { 'aria-label': 'Event to inject' });
        for (const r of S.topReqs) evSel.append(el('option', { value: r.name }, r.name + (r.arity ? '(' + r.arity + ')' : '')));
        const args = el('input', { placeholder: 'arguments, e.g. "hello"', 'aria-label': 'Event arguments', style: 'width:170px' });
        const sync = () => { const r = S.topReqs.find(x => x.name === evSel.value); args.disabled = !r || r.arity === 0; };
        evSel.addEventListener('change', sync); sync();
        const go = () => injectEvent(n.id, evSel.value, args.disabled ? '' : args.value.trim());
        args.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        row.append(evSel, args, el('button', { type: 'button', class: 'primary small', onclick: go }, 'Inject event'));
      }
      if (downAt(n.id, S.cursor)) {
        row.append(el('button', { type: 'button', class: 'ghost small', 'data-down': '1',
          onclick: () => faultHere(at => ({ type: 'recover', node: n.id, at }), 'p' + n.id + ' recovers') }, 'Recover here'));
      } else {
        row.append(el('button', { type: 'button', class: 'ghost small', 'data-down': '0',
          onclick: () => faultHere(at => ({ type: 'crash', node: n.id, at }), 'p' + n.id + ' crashes') }, 'Crash here'));
      }
      const iso = el('input', { class: 'narrow', value: '2s', placeholder: 'forever', 'aria-label': 'Isolation duration', title: 'Duration, empty for forever' });
      row.append(el('span', { class: 'sep' }), iso, el('button', { type: 'button', class: 'ghost small',
        onclick: () => faultHere(at => ({ type: 'partition', groups: String(n.id), from: at, to: untilFrom(iso) }),
          'p' + n.id + ' is isolated') }, 'Isolate here'));
      box.append(row);
    }
    return;
  }
  const l = S.scn.links[sel.idx];
  if (!l) return;
  const en = el('input', { type: 'checkbox' }); en.checked = l.enabled;
  en.addEventListener('change', () => { l.enabled = en.checked; topoChanged(); renderTopo(); markStale(); });
  const dir = el('input', { type: 'checkbox' }); dir.checked = l.directed;
  dir.addEventListener('change', () => { l.directed = dir.checked; topologyChanged(); });
  const loss = el('input', { class: 'narrow', value: l.loss || '', placeholder: 'global', 'aria-label': 'Link loss' });
  loss.addEventListener('input', () => {
    const v = loss.value.trim();
    const err = v === '' ? null : validate('prob', v);
    loss.setAttribute('aria-invalid', err ? 'true' : 'false'); loss.title = err || '';
    if (!err) { l.loss = v; markStale(); }
  });
  const delay = el('input', { value: l.delay || '', placeholder: 'global', style: 'width:160px', 'aria-label': 'Link delay' });
  delay.addEventListener('input', () => {
    const v = delay.value.trim();
    const err = v === '' ? null : validate('dist', v);
    delay.setAttribute('aria-invalid', err ? 'true' : 'false'); delay.title = err || '';
    if (!err) { l.delay = v; markStale(); }
  });
  let cutRow = null;
  if (S.res) {
    const dur = el('input', { class: 'narrow', value: '1s', placeholder: 'forever', 'aria-label': 'Link failure duration', title: 'Duration, empty for forever' });
    cutRow = el('div', { class: 'inject' },
      el('span', { class: 'lbl' }, 'At ' + C.fmtDuration(S.cursor) + ':'),
      el('span', {}, 'take the link down for'), dur,
      el('button', { type: 'button', class: 'ghost small',
        onclick: () => faultHere(at => ({ type: 'link', a: l.a, b: l.b, from: at, to: untilFrom(dur) }),
          'Link p' + l.a + '–p' + l.b + ' goes down') }, 'Cut here'));
  }
  box.append(
    el('b', {}, 'p' + l.a + (l.directed ? ' → ' : ' — ') + 'p' + l.b),
    el('label', { class: 'check', title: 'Unchecked: the link is down for the whole run' }, en, 'Enabled'),
    el('label', { class: 'check' }, dir, 'Directed'),
    el('label', { class: 'field' }, el('span', {}, 'Loss'), loss),
    el('label', { class: 'field' }, el('span', {}, 'Delay'), delay),
    el('button', { type: 'button', class: 'ghost', onclick: () => deleteLink(sel.idx) }, 'Delete'),
    cutRow
  );
}
function renderMsgProps(box, id) {
  const m = S.msgById.get(id);
  if (!m) { box.append('This message is not part of the current run.'); return; }
  const extra = [];
  if (m.violation) extra.push('violates the assumed model');
  if (m.dup) extra.push('duplicate');
  box.append(
    el('b', {}, 'p' + m.from + ' → p' + m.to),
    el('code', { class: 'payload' }, m.payload),
    el('span', {}, STATUS_TEXT[m.status] + (extra.length ? ', ' + extra.join(', ') : '')),
    el('span', { class: 'hint', style: 'margin:0' }, 'sent ' + C.fmtDuration(m.sendT) +
      (m.recvT !== null ? ', arrives ' + C.fmtDuration(m.recvT) + ' (delay ' + C.fmtDuration(m.recvT - m.sendT) + ')' : '') +
      (m.round ? ', round ' + m.round : '')),
    el('button', { type: 'button', class: 'ghost small', onclick: () => { stopPlay(); setCursor(m.sendT); } }, 'Go to send'),
    m.recvT !== null ? el('button', { type: 'button', class: 'ghost small', onclick: () => { stopPlay(); setCursor(m.recvT); } }, 'Go to arrival') : null
  );
}
function generate(kind, n) {
  n = Math.max(2, Math.min(40, n | 0));
  const directed = $('#directed').checked;
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const links = [];
  const L = (a, b, d) => links.push({ a, b, directed: !!d, enabled: true, loss: '', delay: '' });
  const cx = 350, cy = 240, rad = Math.max(130, n * 17);
  let nodes;
  switch (kind) {
    case 'ring':
      nodes = EX.ringLayout(ids, cx, cy, rad);
      ids.forEach((id, i) => L(id, ids[(i + 1) % n], directed));
      if (n === 2) links.pop();
      break;
    case 'complete':
      nodes = EX.ringLayout(ids, cx, cy, rad);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) L(ids[i], ids[j], false);
      break;
    case 'star':
      nodes = [{ id: 1, x: cx, y: cy }].concat(EX.ringLayout(ids.slice(1), cx, cy, Math.max(140, n * 15)));
      ids.slice(1).forEach(id => L(1, id, directed));
      break;
    case 'line':
      nodes = ids.map((id, i) => ({ id, x: 80 + i * 110, y: cy }));
      ids.slice(1).forEach((id, i) => L(ids[i], id, directed));
      break;
    case 'grid': {
      const w = Math.ceil(Math.sqrt(n));
      nodes = ids.map((id, i) => ({ id, x: 90 + (i % w) * 130, y: 80 + Math.floor(i / w) * 120 }));
      ids.forEach((id, i) => {
        if ((i + 1) % w !== 0 && i + 1 < n) L(id, id + 1, false);
        if (i + w < n) L(id, id + w, false);
      });
      break;
    }
    case 'tree': {
      const levels = Math.floor(Math.log2(n)) + 1;
      const width = Math.max(600, Math.pow(2, levels - 1) * 80);
      nodes = ids.map((id, i) => {
        const lv = Math.floor(Math.log2(i + 1));
        const first = Math.pow(2, lv) - 1, cnt = Math.pow(2, lv);
        return { id, x: Math.round(60 + (i - first + 0.5) * width / cnt), y: 70 + lv * 100 };
      });
      ids.slice(1).forEach(id => L(Math.floor((id - 2) / 2) + 1, id, directed));
      break;
    }
    default: { // connected random graph
      let st = ((S.scn.seed >>> 0) || 1) % 233280;
      const rnd = () => (st = (st * 9301 + 49297) % 233280) / 233280;
      nodes = EX.ringLayout(ids, cx, cy, rad);
      for (let i = 1; i < n; i++) L(ids[Math.floor(rnd() * i)], ids[i], false);
      const p = Math.min(0.35, 2.5 / n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (links.some(l => (l.a === ids[i] && l.b === ids[j]) || (l.a === ids[j] && l.b === ids[i]))) continue;
        if (rnd() < p) L(ids[i], ids[j], false);
      }
    }
  }
  S.scn.nodes = nodes; S.scn.links = links;
  const valid = new Set(ids);
  S.scn.faults = S.scn.faults.filter(f =>
    f.type === 'link' ? valid.has(f.a) && valid.has(f.b)
    : f.type === 'partition' ? groupsOf(f).flat().every(id => valid.has(id))
    : valid.has(f.node));
  S.selected = null;
  renderFaults(); fitView(); topologyChanged();
}
function renderFaults() {
  const ul = $('#faults'); ul.textContent = '';
  if (!S.scn.faults.length) ul.append(el('li', {}, el('span', { class: 'hint' }, 'No faults scheduled.')));
  S.scn.faults.forEach((f, i) => ul.append(el('li', {},
    el('span', { class: 'ft-' + f.type }, describeFault(f)),
    el('button', { type: 'button', class: 'ghost small', onclick: () => { S.scn.faults.splice(i, 1); renderFaults(); markStale(); renderProps(); } }, 'Remove'))));
}

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

// ============================================================ space-time diagram
let ROW = 26, TOP = 26;
const LEFT = 52, RIGHT = 14;
let PathCtor = window.Path2D;
// font helper: sizes grow in presentation mode
function fnt(size, family, weight) { return (weight ? weight + ' ' : '') + Math.round(size * (S.fontScale || 1)) + 'px ' + family; }
const T = s => (window.SimI18n ? window.SimI18n.t(s) : s);
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['paper', 'surface', 'grid', 'grid-strong', 'rule', 'ink', 'muted', 'blue', 'red', 'amber', 'green', 'violet'])
    S.colors[k] = cs.getPropertyValue('--' + k).trim();
  S.colors.layers = [0, 1, 2, 3, 4, 5].map(i => cs.getPropertyValue('--layer-' + i).trim());
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
function plotWidth(W) { return Math.max(10, W - LEFT - RIGHT); }
function xToT(x, W) { return S.view.start + (x - LEFT) / plotWidth(W) * S.view.span; }

// target (optional): { ctx, W, Path2D } to draw somewhere else than the on-screen canvas
function diagramHeight() { return Math.max(120, TOP + S.scn.nodes.length * ROW + 14); }
function drawDiagram(target) {
  if (!S.scn) return;
  // event handlers and observers pass their own arguments: only an object with a context is a target
  if (!(target && target.ctx)) target = null;
  const wrap = $('#st-wrap'), cv = $('#st');
  const nodes = S.scn.nodes.slice().sort((a, b) => a.id - b.id);
  const W = target ? target.W : (wrap.clientWidth || 600);
  const H = diagramHeight();
  let ctx;
  const savedSegs = S.segs;
  if (target) {
    ctx = target.ctx;
    PathCtor = target.Path2D || window.Path2D;
  } else {
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
    }
    ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  try { drawDiagramInto(ctx, nodes, W, H); }
  finally {
    PathCtor = window.Path2D;
    if (target) S.segs = savedSegs;
  }
}
function drawDiagramInto(ctx, nodes, W, H) {
  const col = S.colors;
  ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
  const rowY = new Map(nodes.map((n, i) => [n.id, TOP + i * ROW + ROW / 2]));
  const v = S.view, pw = plotWidth(W);
  const X = t => LEFT + (t - v.start) / v.span * pw;
  S.segs = [];

  // time grid
  const step = niceStep(v.span / Math.max(2, pw / 95));
  ctx.lineWidth = 1; ctx.strokeStyle = col.grid; ctx.fillStyle = col.muted;
  ctx.font = fnt(11, MONO); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let t = Math.max(0, Math.ceil(v.start / step) * step); t <= v.start + v.span; t += step) {
    const x = Math.round(X(t)) + 0.5;
    if (x < LEFT + 12) continue;
    ctx.beginPath(); ctx.moveTo(x, TOP - 8); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillText(C.fmtDuration(t), x, 10);
  }
  const r = S.res, t = S.cursor, ghost = $('#ghost').checked;

  ctx.save();
  ctx.beginPath(); ctx.rect(LEFT, 0, pw + RIGHT, H); ctx.clip();
  if (r) {
    if (r.cfg && r.cfg.gst !== null && r.cfg.gst !== undefined) {
      const x = X(r.cfg.gst);
      ctx.strokeStyle = col.amber; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, TOP - 8); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col.amber; ctx.textAlign = 'left'; ctx.font = fnt(11, UIF, 700);
      ctx.fillText(T('GST'), x + 4, TOP - 4);
    }
    if (r.rounds) {
      const R = r.rounds.R;
      if (r.rounds.lockstep) {
        ctx.strokeStyle = col.rule; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.fillStyle = col.muted; ctx.font = fnt(11, UIF); ctx.textAlign = 'left';
        for (let k = Math.max(0, Math.floor(v.start / R)); k * R <= v.start + v.span; k++) {
          const x = X(k * R);
          ctx.beginPath(); ctx.moveTo(x, TOP - 8); ctx.lineTo(x, H); ctx.stroke();
          if (X((k + 1) * R) - x > 30) ctx.fillText('r' + (k + 1), x + 4, TOP - 4);
        }
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = col.muted; ctx.lineWidth = 1;
        for (const n of nodes) {
          const y = rowY.get(n.id);
          for (const s of (r.rounds.starts[n.id] || [])) {
            if (s < v.start || s > v.start + v.span) continue;
            const x = X(s);
            ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
          }
        }
      }
    }
  }
  // network faults: partitions shade the whole diagram, link failures shade the rows between the two processes
  if (r && r.netFaults) {
    const horizon = ghost ? Infinity : t;
    const band = (from, to, y1, y2, label) => {
      if (from > horizon) return;
      const x1 = X(from), x2 = X(Math.min(to === null ? Infinity : to, horizon, v.start + v.span));
      if (x2 <= x1) return;
      ctx.fillStyle = col.red; ctx.globalAlpha = 0.08;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.red; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); ctx.stroke(); ctx.setLineDash([]);
      if (label && x2 - x1 > 60) { ctx.fillStyle = col.red; ctx.font = fnt(11, UIF, 700); ctx.textAlign = 'left'; ctx.fillText(label, x1 + 4, y1 + 9); }
    };
    for (const p of r.netFaults.partitions) band(p.from, p.to, TOP - 8, H, T('partition'));
    for (const l of r.netFaults.links) {
      const ya = rowY.get(l.a), yb = rowY.get(l.b);
      if (ya === undefined || yb === undefined) continue;
      band(l.from, l.to, Math.min(ya, yb) - 6, Math.max(ya, yb) + 6, 'p' + l.a + '–p' + l.b + ' ' + T('down'));
    }
  }
  // causal cone: the part of each process line that can affect the origin, and the part it can affect
  if (r && S.cone) {
    const c = S.cone;
    for (const n of nodes) {
      const y = rowY.get(n.id);
      const pst = c.past[n.id], fut = c.future[n.id];
      if (pst > -Infinity) {
        ctx.fillStyle = col.blue; ctx.globalAlpha = 0.13;
        const x2 = Math.min(X(pst), W);
        ctx.fillRect(LEFT, y - 9, Math.max(0, x2 - LEFT), 18);
      }
      if (fut < Infinity) {
        ctx.fillStyle = col.amber; ctx.globalAlpha = 0.16;
        const x1 = Math.max(X(fut), LEFT);
        ctx.fillRect(x1, y - 9, Math.max(0, W - x1), 18);
      }
      ctx.globalAlpha = 1;
    }
  }
  // process lines: solid while running, dashed from a crash to the recovery (or to the end)
  for (const n of nodes) {
    const y = rowY.get(n.id);
    const downs = r ? (r.downs[n.id] || []) : [];
    const seg = (xa, xb, down) => {
      xa = Math.max(xa, LEFT); xb = Math.min(xb, W);
      if (xb <= xa) return;
      ctx.strokeStyle = down ? col.violet : col.ink; ctx.lineWidth = 1.4;
      ctx.setLineDash(down ? [2, 4] : []);
      ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke();
      ctx.setLineDash([]);
    };
    let from = X(0);
    for (const d of downs) {
      if (d.from > t && !ghost) break;               // later crashes are not shown yet
      const xa = X(d.from);
      seg(from, xa, false);
      const recoveryShown = d.to !== null && (d.to <= t || ghost);
      const xb = recoveryShown ? X(d.to) : W;
      seg(xa, xb, true);
      ctx.strokeStyle = col.violet; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(xa - 6, y - 6); ctx.lineTo(xa + 6, y + 6); ctx.moveTo(xa + 6, y - 6); ctx.lineTo(xa - 6, y + 6); ctx.stroke();
      if (!recoveryShown) { from = W; break; }
      ctx.strokeStyle = col.green; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(xb, y, 5, 0, Math.PI * 2); ctx.stroke();
      from = xb;
    }
    seg(from, W, false);
  }
  if (r) {
    // processing steps as short bars on the process lines
    const aHi = upperBound(S.activity, Math.min(t, v.start + v.span), a => a.t);
    const aLo = lowerBound(S.activity, v.start - S.maxBusy, a => a.t);
    const bars = new PathCtor();
    let lastX = {};
    for (let i = aLo; i < aHi; i++) {
      const a = S.activity[i];
      const y = rowY.get(a.node);
      if (y === undefined) continue;
      const x1 = X(a.t), x2 = Math.max(x1 + 2, X(Math.min(a.end, t)));
      if (lastX[a.node] !== undefined && x2 <= lastX[a.node]) continue;  // hidden under the previous bar
      lastX[a.node] = x2;
      bars.rect(x1, y - 3, x2 - x1, 6);
    }
    ctx.fillStyle = col.blue; ctx.globalAlpha = 0.35;
    ctx.fill(bars);
    ctx.globalAlpha = 1;
    // messages
    const hi = upperBound(S.msgsBySend, v.start + v.span, m => m.sendT);
    const lo = lowerBound(S.msgsBySend, v.start - S.maxLat, m => m.sendT);
    let drawn = 0;
    const selId = S.selected && S.selected.type === 'msg' ? S.selected.id : null;
    const batches = msgBatches();
    const layers = layersOn();
    const last = ghost ? hi : Math.min(hi, upperBound(S.msgsBySend, t, m => m.sendT));
    for (let i = lo; i < last && drawn < 30000; i++) {
      const m = S.msgsBySend[i];
      if (m.sendT > t) { drawMsg(batches, m, 0.16, Infinity, X, rowY, false, layers); continue; }
      drawMsg(batches, m, inCone(m) ? 1 : 0.25, t, X, rowY, m.id === selId, layers);
      drawn++;
    }
    batches.flush(ctx);
    if (S.cone) {
      const c = S.cone, y = rowY.get(c.node);
      if (y !== undefined) {
        ctx.strokeStyle = col.ink; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(X(c.t), y, 7, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // violations, assertions, errors
    const logHi = upperBound(S.logSorted, ghost ? v.start + v.span : Math.min(t, v.start + v.span), e => e.t);
    const logLo = lowerBound(S.logSorted, v.start, e => e.t);
    for (let i = logLo; i < logHi; i++) {
      const e = S.logSorted[i];
      const y = rowY.get(e.node);
      if (y === undefined) continue;
      const x = X(e.t);
      ctx.globalAlpha = e.t > t ? 0.3 : 1;
      if (e.kind === 'violation') {
        ctx.strokeStyle = col.red; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      } else if (e.kind === 'assert' || e.kind === 'error') {
        ctx.fillStyle = col.red; ctx.fillRect(x - 4, y - 4, 8, 8);
      }
      ctx.globalAlpha = 1;
    }
    // outputs
    ctx.font = fnt(11, UIF); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const lastLabel = {};
    for (const o of r.outputs) {
      if (o.t < v.start || o.t > v.start + v.span) continue;
      if (o.t > t && !ghost) continue;
      const y = rowY.get(o.node);
      if (y === undefined) continue;
      const x = X(o.t);
      ctx.globalAlpha = o.t > t ? 0.3 : 1;
      ctx.fillStyle = col.green;
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
      const label = truncate(o.text, 22);
      const wTxt = ctx.measureText(label).width;
      if (lastLabel[o.node] === undefined || x - lastLabel[o.node] > 8) {
        ctx.fillText(label, x + 6, y - 6);
        lastLabel[o.node] = x + 6 + wTxt;
      }
      ctx.globalAlpha = 1;
    }
    // cursor
    const xc = X(t);
    ctx.strokeStyle = col.blue; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xc, TOP - 10); ctx.lineTo(xc, H); ctx.stroke();
  }
  ctx.restore();

  // label column
  ctx.fillStyle = col.surface; ctx.fillRect(0, 0, LEFT, H);
  ctx.strokeStyle = col.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LEFT - 0.5, 0); ctx.lineTo(LEFT - 0.5, H); ctx.stroke();
  ctx.font = fnt(12, UIF, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const n of nodes) {
    ctx.fillStyle = r && downAt(n.id, t) ? col.muted : col.ink;
    ctx.fillText('p' + n.id, 10, rowY.get(n.id));
  }
  if (!r) {
    ctx.fillStyle = col.muted; ctx.font = fnt(13, UIF); ctx.textAlign = 'center';
    ctx.fillText(T(nodes.length ? 'Press Run to see the space-time diagram.' : 'Add some processes to get started.'), LEFT + pw / 2, Math.min(H - 20, TOP + 30));
  }
}

// Messages are collected into batches that share a style and drawn with one stroke and one fill each.
function msgBatches() {
  const map = new Map();
  return {
    get(color, width, dash, alpha) {
      const k = color + '|' + width + '|' + dash.join(',') + '|' + alpha;
      let b = map.get(k);
      if (!b) { b = { color, width, dash, alpha, line: new PathCtor(), mark: new PathCtor(), fill: new PathCtor() }; map.set(k, b); }
      return b;
    },
    flush(ctx) {
      for (const b of map.values()) {
        ctx.globalAlpha = b.alpha;
        ctx.strokeStyle = b.color; ctx.fillStyle = b.color;
        ctx.lineWidth = b.width; ctx.setLineDash(b.dash);
        ctx.stroke(b.line);
        ctx.setLineDash([]); ctx.lineWidth = 1.6;
        ctx.stroke(b.mark);
        ctx.fill(b.fill);
      }
      ctx.globalAlpha = 1;
    }
  };
}
function drawMsg(B, m, alpha, tcut, X, rowY, selected, layers) {
  const col = S.colors;
  const y1 = rowY.get(m.from);
  const y2 = rowY.get(m.to);
  if (y1 === undefined) return;
  const x1 = X(m.sendT);
  if (m.status === 'dropped-link' || y2 === undefined || (m.status === 'dropped-cut' && m.recvT === m.sendT)) {
    const b = B.get(col.amber, 1.5, [], alpha);
    b.mark.moveTo(x1 - 3, y1 - 3); b.mark.lineTo(x1 + 3, y1 + 3); b.mark.moveTo(x1 + 3, y1 - 3); b.mark.lineTo(x1 - 3, y1 + 3);
    return;
  }
  let color = m.violation ? col.red : layers ? layerColor(m.origin) : col.blue;
  let dash = [];
  if (m.status === 'dropped-loss' || m.status === 'dropped-cut') { color = col.amber; dash = [4, 3]; }
  else if (m.status === 'lost-crash') { color = col.muted; dash = [2, 3]; }
  else if (m.status === 'dropped-late') dash = [4, 3];
  const lost = m.status === 'dropped-loss' || m.status === 'dropped-late' || m.status === 'lost-crash' || m.status === 'dropped-cut';
  let tt = m.recvT, ty = y2;
  if (m.status === 'dropped-loss') { tt = (m.sendT + m.recvT) / 2; ty = (y1 + y2) / 2; }
  let frac = 1;
  if (tcut < tt && tt > m.sendT) frac = Math.max(0, (tcut - m.sendT) / (tt - m.sendT));
  const self = m.from === m.to;
  const xe = x1 + (X(tt) - x1) * frac;
  const ye = self ? y1 : y1 + (ty - y1) * frac;
  const b = B.get(color, selected ? 3 : m.violation ? 1.9 : 1.2, dash, alpha);
  b.line.moveTo(x1, y1);
  if (self) b.line.quadraticCurveTo((x1 + xe) / 2, y1 - 11, xe, y1);
  else b.line.lineTo(xe, ye);
  if (frac >= 1) {
    if (lost) {
      b.mark.moveTo(xe - 3.5, ye - 3.5); b.mark.lineTo(xe + 3.5, ye + 3.5); b.mark.moveTo(xe + 3.5, ye - 3.5); b.mark.lineTo(xe - 3.5, ye + 3.5);
    } else if (!self) {
      const a = Math.atan2(ye - y1, xe - x1);
      b.fill.moveTo(xe, ye);
      b.fill.lineTo(xe - 7 * Math.cos(a - 0.4), ye - 7 * Math.sin(a - 0.4));
      b.fill.lineTo(xe - 7 * Math.cos(a + 0.4), ye - 7 * Math.sin(a + 0.4));
      b.fill.closePath();
    }
  } else {
    b.fill.moveTo(xe + 3.2, ye);
    b.fill.arc(xe, ye, 3.2, 0, Math.PI * 2);
  }
  if (alpha > 0.2) S.segs.push({ x1, y1, x2: xe, y2: ye, m });
}
function inCone(m) {
  const c = S.cone;
  if (!c) return true;
  if (m.status === 'delivered' && m.recvT <= c.past[m.to]) return true;
  return m.sendT >= c.future[m.from];
}
function distSeg(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L2 = dx * dx + dy * dy;
  let u = L2 ? ((px - s.x1) * dx + (py - s.y1) * dy) / L2 : 0;
  u = clamp(u, 0, 1);
  return Math.hypot(px - (s.x1 + u * dx), py - (s.y1 + u * dy));
}
const STATUS_TEXT = {
  delivered: 'delivered', pending: 'still in transit when the run ended', 'dropped-loss': 'lost by the network',
  'dropped-late': 'discarded because late', 'lost-crash': 'recipient crashed', 'dropped-link': 'no link',
  'dropped-cut': 'dropped by a link failure or a partition'
};
function nearestSeg(x, y) {
  let best = null, bd = 7;
  for (const s of S.segs) { const d = distSeg(x, y, s); if (d < bd) { bd = d; best = s; } }
  return best;
}
function bindDiagram() {
  const cv = $('#st'), tip = $('#tip'), wrap = $('#st-wrap');
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, start: S.view.start, moved: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (drag) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) { drag.moved = true; cv.classList.add('dragging'); }
      if (drag.moved) {
        S.view.start = Math.max(-S.view.span * 0.05, drag.start - dx / plotWidth(rect.width) * S.view.span);
        $('#follow').checked = false;
        drawDiagram();
      }
      tip.hidden = true;
      return;
    }
    const best = nearestSeg(x, y);
    if (!best) { tip.hidden = true; return; }
    const m = best.m;
    tip.textContent = '';
    const extra = [];
    if (m.violation) extra.push('violates the assumed model');
    if (m.dup) extra.push('duplicate');
    tip.append(
      el('div', {}, el('b', {}, 'p' + m.from + ' → p' + m.to), ': ' + STATUS_TEXT[m.status] + (extra.length ? ', ' + extra.join(', ') : '')),
      el('div', {}, el('code', {}, m.payload)),
      el('div', { class: 'hint', style: 'margin:0' },
        'sent at ' + C.fmtDuration(m.sendT) +
        (m.recvT !== null && m.status !== 'dropped-link' ? ', arrives at ' + C.fmtDuration(m.recvT) + ' (delay ' + C.fmtDuration(m.recvT - m.sendT) + ')' : '') +
        (m.round ? ', round ' + m.round : '') + '. Click to select.')
    );
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(x + 14, wrap.clientWidth - tw - 6)) + 'px';
    tip.style.top = (y + 14) + 'px';
  });
  cv.addEventListener('pointerup', e => {
    if (drag && !drag.moved && S.res) {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const best = nearestSeg(x, y);
      stopPlay();
      if ($('#cone-mode').checked && x > LEFT) setCone(y, xToT(x, rect.width));
      else if (best) select({ type: 'msg', id: best.m.id });
      else if (x > LEFT) setCursor(xToT(x, rect.width));
    }
    drag = null; cv.classList.remove('dragging');
  });
  cv.addEventListener('pointercancel', () => { drag = null; cv.classList.remove('dragging'); });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; });
  cv.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    zoomAt(xToT(e.clientX - rect.left, rect.width), e.deltaY > 0 ? 1.25 : 0.8);
  }, { passive: false });
  const center = () => (S.cursor >= S.view.start && S.cursor <= S.view.start + S.view.span) ? S.cursor : S.view.start + S.view.span / 2;
  $('#zoom-in').addEventListener('click', () => zoomAt(center(), 0.5));
  $('#zoom-out').addEventListener('click', () => zoomAt(center(), 2));
  $('#zoom-all').addEventListener('click', () => { S.view = { start: 0, span: (S.res ? S.res.endT : 1e6) * 1.03 }; drawDiagram(); });
  $('#zoom-fit').addEventListener('click', () => { S.view = { start: 0, span: (S.res ? S.playEnd : 1e6) * 1.03 }; drawDiagram(); });
  $('#ghost').addEventListener('change', drawDiagram);
  $('#cone-mode').addEventListener('change', () => {
    document.body.classList.toggle('cone-mode', $('#cone-mode').checked);
    if (!$('#cone-mode').checked) clearCone();
    else toast('Click an event on the diagram to see its causal past and future.');
  });
  $('#layers').addEventListener('change', () => { renderLayerLegend(); renderAnim(); drawDiagram(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawDiagram()).observe(wrap);
  else window.addEventListener('resize', drawDiagram);
}
// pick the event of the clicked process nearest to the clicked time and compute its causal cone
function setCone(y, t) {
  const nodes = S.scn.nodes.slice().sort((a, b) => a.id - b.id);
  const row = Math.floor((y - TOP) / ROW);
  const n = nodes[row];
  if (!n || !S.res) return;
  const acts = S.activity.filter(a => a.node === n.id);
  if (!acts.length) { toast('p' + n.id + ' has no events in this run.'); return; }
  let best = acts[0];
  for (const a of acts) if (Math.abs(a.t - t) < Math.abs(best.t - t)) best = a;
  S.cone = C.causalCone(S.res, n.id, best.t);
  renderConeInfo();
  setCursor(best.t);
}
function clearCone() { S.cone = null; renderConeInfo(); renderTopo(); drawDiagram(); }
function renderConeInfo() {
  const box = $('#cone-info');
  if (!box) return;
  box.textContent = '';
  box.hidden = !S.cone;
  if (!S.cone) return;
  const c = S.cone;
  box.append(
    el('span', {}, 'Event of ', el('b', {}, 'p' + c.node), ' at ' + C.fmtDuration(c.t) + ':'),
    el('span', { class: 'past' }, c.counts.past + ' events could have caused it'),
    el('span', { class: 'future' }, c.counts.future + ' events it could affect'),
    el('span', {}, c.counts.concurrent + ' concurrent'),
    el('button', { type: 'button', class: 'ghost small', onclick: clearCone }, 'Clear'));
}
function zoomAt(tc, factor) {
  const v = S.view;
  const ns = Math.max(1000, v.span * factor);
  const f = (tc - v.start) / v.span;
  v.start = tc - f * ns; v.span = ns;
  drawDiagram();
}

// ============================================================ playback
// simulated microseconds per real second; null means "event by event"
function speedSim() {
  const v = $('#speed').value;
  if (v === 'step') return null;
  if (v === 'auto') return Math.max(1000, (S.res ? S.playEnd : 1e6) / AUTO_REAL_S);
  return +v * 1000;
}
function updatePulse(segLen) {
  const sp = speedSim();
  if (sp !== null) S.pulse = Math.max(1, sp * PULSE_REAL_S);
  else if (segLen !== undefined) S.pulse = Math.max(1, segLen);
  else if (!S.pulse) S.pulse = 1000;
}
function setCursor(t) {
  const end = S.res ? S.res.endT : 0;
  S.cursor = clamp(t, 0, end);
  if ($('#follow').checked && S.res) {
    const v = S.view;
    if (S.cursor < v.start || S.cursor > v.start + v.span * (S.playing ? 0.92 : 1))
      v.start = Math.max(0, S.cursor - v.span * (S.playing ? 0.1 : 0.5));
  }
  renderTopo(); drawDiagram(); updateTransport(); updateLogCursor();
  if (S.tab === 'state') renderInspector();
  if (S.tab === 'stack') renderStack();
  if (S.selected && (S.selected.type === 'node' || S.selected.type === 'link') && S.res) {
    const lbl = $('#props .inject .lbl');
    if (lbl) lbl.textContent = 'At ' + C.fmtDuration(S.cursor) + ':';
    if (S.selected.type === 'node') {
      const down = !!downAt(S.selected.id, S.cursor);
      const shown = !!$('#props .inject button[data-down="1"]');
      const hasBtn = !!$('#props .inject button[data-down]');
      if (hasBtn && down !== shown) renderProps();
    }
  }
}
function updateTransport() {
  const end = S.res ? S.res.endT : 0;
  $('#scrub').value = end ? Math.round(S.cursor / end * 10000) : 0;
  $('#tlabel').textContent = 't = ' + C.fmtDuration(S.cursor) + ' / ' + C.fmtDuration(end);
  const pb = $('#btn-play');
  pb.textContent = S.playing ? '❚❚' : '▶︎';
  pb.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
  for (const s of ['#btn-start', '#btn-prev', '#btn-play', '#btn-next', '#btn-end', '#scrub']) $(s).disabled = !S.res;
}
function stepEvent(dir) {
  if (!S.res) return;
  stopPlay();
  let target = null;
  if (dir > 0) { const i = upperBound(S.times, S.cursor, x => x); if (i < S.times.length) target = S.times[i]; }
  else { const i = lowerBound(S.times, S.cursor, x => x) - 1; if (i >= 0) target = S.times[i]; }
  if (target === null) return;
  updatePulse(Math.abs(target - S.cursor));
  setCursor(target);
}
function startPlay() {
  if (!S.res || S.playing) return;
  if (S.cursor >= S.res.endT || (S.cursor >= S.playEnd && S.playEnd < S.res.endT && S.cursor < S.playEnd + 1)) S.cursor = 0;
  S.playing = true; S.seg = null;
  S.lastFrame = performance.now();
  updateTransport();
  requestAnimationFrame(frame);
}
function togglePlay() { if (S.playing) stopPlay(); else startPlay(); }
function stopPlay() { S.seg = null; if (!S.playing) return; S.playing = false; updateTransport(); }
function frame(now) {
  if (!S.playing || !S.res) return;
  // stop where the action ends, unless playback started after that point
  const end = S.cursor < S.playEnd ? S.playEnd : S.res.endT;
  const sp = speedSim();
  if (sp === null) {
    if (!S.seg) {
      const i = upperBound(S.times, S.cursor, x => x);
      if (i >= S.times.length || S.times[i] > end) { S.playing = false; setCursor(end); updateTransport(); return; }
      S.seg = { from: S.cursor, to: S.times[i], start: now };
      updatePulse(S.seg.to - S.seg.from);
    }
    const p = Math.min(1, (now - S.seg.start) / STEP_REAL_MS);
    if (p >= 1) { const to = S.seg.to; S.seg = null; setCursor(to); }
    else setCursor(S.seg.from + (S.seg.to - S.seg.from) * ease(p));
  } else {
    const dt = Math.min(100, now - S.lastFrame);
    updatePulse();
    const nt = S.cursor + dt / 1000 * sp;
    if (nt >= end) { S.playing = false; setCursor(end); updateTransport(); return; }
    setCursor(nt);
  }
  S.lastFrame = now;
  requestAnimationFrame(frame);
}
function bindTransport() {
  $('#btn-start').addEventListener('click', () => { stopPlay(); setCursor(0); });
  $('#btn-end').addEventListener('click', () => { stopPlay(); if (S.res) setCursor(S.res.endT); });
  $('#btn-prev').addEventListener('click', () => stepEvent(-1));
  $('#btn-next').addEventListener('click', () => stepEvent(1));
  $('#btn-play').addEventListener('click', togglePlay);
  $('#scrub').addEventListener('input', e => { if (!S.res) return; stopPlay(); setCursor(+e.target.value / 10000 * S.res.endT); });
  $('#follow').addEventListener('change', () => setCursor(S.cursor));
  $('#speed').addEventListener('change', () => { S.seg = null; updatePulse(); renderTopo(); });
}

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
  const past = (r.downs[id] || []).filter(d => d.to !== null && d.to <= S.cursor);
  const status = down ? 'crashed at ' + C.fmtDuration(down.from)
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

// ============================================================ delay preview
function drawPreview() {
  if (!S.scn) return;
  const cv = $('#delay-preview');
  if (!cv || cv.offsetParent === null) return;
  const W = cv.clientWidth || 300, H = 92, dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const col = S.colors, a = S.scn.actual, stats = $('#delay-stats');
  let xs, pre = null;
  try { xs = C.previewDelay(a.delay, a.spikeProb, a.spikeExtra, a.bound, 4000); }
  catch (e) { stats.textContent = 'The delay distribution is not valid.'; return; }
  try { if (a.preGstDelay && a.gst) pre = C.previewDelay(a.preGstDelay, 0, '0ms', '', 4000); } catch (e) { pre = null; }
  const D = knownFromScn().DELTA;
  const bound = (() => { try { return a.bound ? C.parseDuration(a.bound) : null; } catch (e) { return null; } })();
  const sorted = xs.slice().sort((p, q) => p - q);
  const q = f => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  const xmax = Math.max(q(0.99) * 1.15, D ? D * 1.3 : 0, bound ? bound * 1.1 : 0, 1000);
  const bins = 50, B = 14;
  const hist = new Array(bins).fill(0);
  for (const x of xs) hist[Math.min(bins - 1, Math.floor(x / xmax * bins))]++;
  let hp = null;
  if (pre) { hp = new Array(bins).fill(0); for (const x of pre) hp[Math.min(bins - 1, Math.floor(x / xmax * bins))]++; }
  const mx = Math.max(...hist, ...(hp || [0]), 1);
  const bw = (W - 8) / bins;
  ctx.fillStyle = col.blue; ctx.globalAlpha = 0.55;
  hist.forEach((c, i) => { const h = c / mx * (H - B - 8); ctx.fillRect(4 + i * bw, H - B - h, Math.max(1, bw - 1), h); });
  ctx.globalAlpha = 1;
  if (hp) {
    ctx.strokeStyle = col.amber; ctx.lineWidth = 1.4;
    ctx.beginPath();
    hp.forEach((c, i) => { const y = H - B - c / mx * (H - B - 8); if (i === 0) ctx.moveTo(4, y); else ctx.lineTo(4 + i * bw, y); ctx.lineTo(4 + (i + 1) * bw, y); });
    ctx.stroke();
  }
  const vline = (val, color, label, dash) => {
    const x = 4 + val / xmax * (W - 8);
    ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, H - B); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.font = '700 11px ' + UIF; ctx.textAlign = x > W - 60 ? 'right' : 'left';
    ctx.fillText(label, x + (x > W - 60 ? -4 : 4), 12);
  };
  if (bound) vline(bound, col.ink, 'bound', []);
  if (D) vline(D, col.red, 'DELTA', [5, 3]);
  ctx.fillStyle = col.muted; ctx.font = '11px ' + MONO; ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillText('0', 4, H - 2);
  ctx.textAlign = 'right'; ctx.fillText(C.fmtDuration(Math.round(xmax)), W - 4, H - 2);
  let txt = 'Median ' + C.fmtDuration(Math.round(q(0.5))) + ', 99th percentile ' + C.fmtDuration(Math.round(q(0.99))) + '.';
  if (D) {
    const over = xs.filter(x => x > D).length / xs.length;
    txt += ' ' + pct(over) + ' of messages exceed DELTA' + (a.gst ? ' (after GST)' : '') + '.';
    if (S.scn.assumed.timing === 'synchronous-rounds' && a.roundMode === 'emulated')
      txt += ' With emulated rounds the usable window is about DELTA + PHI, shrunk by clock offsets.';
  }
  if (pre) txt += ' The amber line is the delay before GST.';
  stats.textContent = txt;
}

// ============================================================ tabs
function setTab(t) {
  S.tab = t;
  $$('.tabs [data-tab]').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  $$('.tab-body').forEach(d => { d.hidden = d.dataset.body !== t; });
  if (t === 'state') renderInspector(true);
  if (t === 'stack') renderStack(true);
  if (t === 'time') drawPreview();
  if (t === 'code') refreshCode();
}

// ============================================================ sharing scenarios
function b64url(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const s = atob(str), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
async function shareLink() {
  const bytes = new TextEncoder().encode(JSON.stringify(S.scn));
  let data = bytes, tag = 'j';
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    data = new Uint8Array(await new Response(stream).arrayBuffer());
    tag = 'z';
  }
  return location.href.split('#')[0] + '#s=' + tag + b64url(data);
}
async function fromHash() {
  const m = /#s=([zj])([A-Za-z0-9_-]+)/.exec(location.hash || '');
  if (!m) return null;
  let bytes = unb64url(m[2]);
  if (m[1] === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return safeParse(new TextDecoder().decode(bytes));
}
async function copyText(text, msgEl) {
  try { await navigator.clipboard.writeText(text); msgEl.textContent = 'Copied to the clipboard.'; }
  catch (e) { msgEl.textContent = 'Copying is not allowed here: select the text and copy it manually.'; }
}
async function saveFile(name, text, mime, msgEl) {
  const msg = msgEl || $('#export-msg');
  mime = mime || 'application/json';
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      msg.textContent = 'Preparing the file…';
      const dl = await window.claude.use('downloads');
      if (!dl) { msg.textContent = mime === 'application/json' ? 'Saving files is not available here: use Copy JSON.' : 'Saving files is not available here.'; return; }
      try {
        await dl.save({ filename: name, data: text });
        msg.textContent = 'Saved ' + name + '.';
      } catch (e) {
        const code = e && e.code;
        msg.textContent = code === 'declined' ? 'Save cancelled.'
          : code === 'rate_limited' ? 'A save request is already open.'
          : (mime === 'application/json' ? 'Saving files is not available here: use Copy JSON.' : 'Saving files is not available here.');
      }
      return;
    }
    // The blob is always typed application/octet-stream, even for images: a blob: URL is same-origin, and an
    // SVG or HTML type would be rendered (and could run script) if the link were opened instead of downloaded.
    const blob = new Blob([text instanceof Blob ? text : String(text)], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    msg.textContent = 'Downloading ' + name + '.';
  } catch (e) { msg.textContent = 'Could not save the file: ' + e.message; }
}
function fileName() {
  const base = (S.scn.top || 'scenario').replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
  return 'scenario-' + base + '-seed' + S.scn.seed + '.json';
}
async function openExport() {
  $('#export-text').value = JSON.stringify(S.scn, null, 2);
  $('#export-msg').textContent = '';
  $('#export-link').value = 'Preparing…';
  $('#dlg-export').showModal();
  try { $('#export-link').value = await shareLink(); }
  catch (e) { $('#export-link').value = 'Links are not supported in this browser'; }
}
function openImport() {
  $('#import-text').value = '';
  $('#import-msg').textContent = '';
  $('#import-file').value = '';
  $('#dlg-import').showModal();
}
function bindDialogs() {
  $('#btn-export').addEventListener('click', openExport);
  $('#btn-import').addEventListener('click', openImport);
  $('#btn-copy-json').addEventListener('click', () => copyText($('#export-text').value, $('#export-msg')));
  $('#btn-copy-link').addEventListener('click', () => copyText($('#export-link').value, $('#export-msg')));
  $('#btn-save-json').addEventListener('click', () => saveFile(fileName(), JSON.stringify(S.scn, null, 2)));
  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { $('#import-text').value = await f.text(); $('#import-msg').textContent = ''; }
    catch (err) { $('#import-msg').textContent = 'Could not read the file: ' + err.message; }
  });
  $('#btn-do-import').addEventListener('click', () => {
    try {
      const obj = safeParse($('#import-text').value);
      if (!obj || !Array.isArray(obj.nodes) || typeof obj.code !== 'string')
        throw new Error('This is not a scenario: "nodes" or "code" is missing.');
      loadScenario(obj, 'Scenario imported.');
      $('#dlg-import').close();
    } catch (e) {
      $('#import-msg').textContent = e instanceof SyntaxError ? 'Invalid JSON: ' + e.message : e.message;
    }
  });
}

// ============================================================ loading
let toastT = 0;
function toast(text, label, action) {
  const t = $('#toast');
  t.textContent = '';
  t.append(el('span', {}, text));
  if (label) t.append(el('button', { type: 'button', onclick: () => { t.hidden = true; action(); } }, label));
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, label ? 8000 : 3200);
}
function loadScenario(obj, msg, noUndo) {
  const prev = S.scn ? clone(S.scn) : null;
  stopPlay();
  let next;
  try { next = ensureScenario(clone(obj)); }
  catch (e) {
    toast('Could not open the scenario: ' + e.message);
    if (prev) return;
    next = ensureScenario(clone(EX.EXAMPLES[0].scenario));
  }
  S.scn = next;
  topoChanged(); resetPools();
  S.selected = null; S.linkFrom = null; S.runtimeErr = null; S.res = null; S.cursor = 0;
  S.algos = []; S.ifaces = null; S.topReqs = [];
  fillForms(); fitView(); checkCode(); renderTopo(); renderProps();
  store.set(STORE_KEY, JSON.stringify(S.scn));
  run(false);
  if (msg) {
    if (prev && !noUndo) toast(msg, 'Undo', () => loadScenario(prev, 'Previous scenario restored.', true));
    else toast(msg);
  }
}
function bindHeader() {
  const exSel = $('#example');
  for (const x of EX.EXAMPLES) exSel.append(el('option', { value: x.key }, x.title));
  exSel.append(el('option', { value: 'blank' }, 'Empty scenario'));
  exSel.addEventListener('change', () => {
    const k = exSel.value;
    exSel.value = '';
    if (!k) return;
    if (k === 'blank') { loadScenario(blankScenario(), 'Loaded the empty scenario.'); return; }
    const ex = EX.EXAMPLES.find(e => e.key === k);
    if (ex) loadScenario(ex.scenario, 'Loaded: ' + ex.title + '.');
  });
  $('#btn-run').addEventListener('click', () => run(false));
  $('#btn-rerun').addEventListener('click', () => run(false));
  $('#btn-dice').addEventListener('click', () => {
    S.scn.seed = Math.floor(Math.random() * 100000);
    $('#seed').value = S.scn.seed;
    scheduleSave();
    run(false);
  });
  $$('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#log-filter').addEventListener('change', renderLog);
  const syncFaultForm = () => {
    const type = $('#fault-type').value;
    $$('[data-ft]').forEach(e => { e.hidden = !e.dataset.ft.split(' ').includes(type); });
  };
  $('#fault-type').addEventListener('change', syncFaultForm);
  syncFaultForm();
  $('#btn-add-fault').addEventListener('click', () => {
    const type = $('#fault-type').value;
    const v = id => $(id).value.trim();
    const f = type === 'link' ? { type, a: parseInt(v('#fault-a'), 10), b: parseInt(v('#fault-b'), 10), from: v('#fault-from'), to: v('#fault-to') }
      : type === 'partition' ? { type, groups: v('#fault-groups'), from: v('#fault-from'), to: v('#fault-to') }
      : { type, node: parseInt(v('#fault-node'), 10), at: v('#fault-at') };
    if (addFault(f)) { renderProps(); toast('Fault added: ' + describeFault(f) + '.'); }
  });
}
function bindKeys() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(false); return; }
    if (tourStep >= 0) {
      if (e.key === 'Escape') { e.preventDefault(); endTour(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); $('#tour-next').click(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); $('#tour-back').click(); }
      return;
    }
    const tg = e.target || {};
    const tag = (tg.tagName || '').toLowerCase();
    const type = (tg.type || '').toLowerCase();
    const textLike = tag === 'textarea' || tag === 'select' || tg.isContentEditable ||
      (tag === 'input' && !['checkbox', 'radio', 'range', 'button', 'submit', 'file'].includes(type));
    if (textLike) return;
    // checkboxes and sliders keep Space and the arrow keys for themselves
    if (tag === 'input' && (e.key === ' ' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case ' ':
        if (tag === 'button') return;
        e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': case 'PageDown': e.preventDefault(); stepEvent(1); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); stepEvent(-1); break;
      case '?': e.preventDefault(); $('#dlg-shortcuts').showModal(); break;
      case 'p': case 'P': togglePresentation(); break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        break;
      case 'Home': stopPlay(); setCursor(0); break;
      case 'End': stopPlay(); if (S.res) setCursor(S.res.endT); break;
      case 'Delete': case 'Backspace':
        if (S.selected && (S.selected.type === 'node' || S.selected.type === 'link')) {
          e.preventDefault();
          if (S.selected.type === 'node') deleteNode(S.selected.id); else deleteLink(S.selected.idx);
        }
        break;
      case 'Escape':
        if (document.body.classList.contains('present')) { togglePresentation(false); break; }
        if (S.linkFrom !== null) { S.linkFrom = null; renderTopo(); renderProps(); }
        else select(null);
        break;
      case 'v': case 'V': setMode('move'); break;
      case 'n': case 'N': setMode('add'); break;
      case 'l': case 'L': setMode('link'); break;
      case 'd': case 'D': setMode('delete'); break;
    }
  });
}

// ============================================================ images
// A recorder with the subset of the Canvas 2D API used by the diagram, producing SVG.
class SvgPath {
  constructor() { this.d = ''; }
  moveTo(x, y) { this.d += 'M' + r2(x) + ' ' + r2(y); }
  lineTo(x, y) { this.d += 'L' + r2(x) + ' ' + r2(y); }
  quadraticCurveTo(cx, cy, x, y) { this.d += 'Q' + r2(cx) + ' ' + r2(cy) + ' ' + r2(x) + ' ' + r2(y); }
  closePath() { this.d += 'Z'; }
  rect(x, y, w, h) { this.d += 'M' + r2(x) + ' ' + r2(y) + 'h' + r2(w) + 'v' + r2(h) + 'h' + r2(-w) + 'Z'; }
  arc(x, y, r) { this.d += 'M' + r2(x + r) + ' ' + r2(y) + 'A' + r2(r) + ' ' + r2(r) + ' 0 1 0 ' + r2(x - r) + ' ' + r2(y) + 'A' + r2(r) + ' ' + r2(r) + ' 0 1 0 ' + r2(x + r) + ' ' + r2(y); }
}
function r2(v) { return Math.round(v * 100) / 100; }
function xmlEsc(v) { return String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
class SvgCtx {
  constructor() {
    this.out = []; this.path = new SvgPath(); this.stack = []; this.clipN = 0; this.open = 0;
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.globalAlpha = 1;
    this.font = '11px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.dash = [];
    this.measure = document.createElement('canvas').getContext('2d');
  }
  setTransform() {}
  setLineDash(d) { this.dash = d.slice(); }
  save() { this.stack.push({ f: this.fillStyle, s: this.strokeStyle, w: this.lineWidth, a: this.globalAlpha, font: this.font, ta: this.textAlign, tb: this.textBaseline, d: this.dash, open: this.open }); }
  restore() {
    const st = this.stack.pop();
    if (!st) return;
    while (this.open > st.open) { this.out.push('</g>'); this.open--; }
    this.fillStyle = st.f; this.strokeStyle = st.s; this.lineWidth = st.w; this.globalAlpha = st.a;
    this.font = st.font; this.textAlign = st.ta; this.textBaseline = st.tb; this.dash = st.d;
  }
  beginPath() { this.path = new SvgPath(); }
  moveTo(x, y) { this.path.moveTo(x, y); }
  lineTo(x, y) { this.path.lineTo(x, y); }
  quadraticCurveTo(a, b, c, d) { this.path.quadraticCurveTo(a, b, c, d); }
  closePath() { this.path.closePath(); }
  rect(x, y, w, h) { this.path.rect(x, y, w, h); }
  arc(x, y, r) { this.path.arc(x, y, r); }
  clip() {
    const id = 'c' + (++this.clipN);
    this.out.push('<clipPath id="' + id + '"><path d="' + this.path.d + '"/></clipPath><g clip-path="url(#' + id + ')">');
    this.open++;
  }
  alpha() { return this.globalAlpha < 1 ? ' opacity="' + r2(this.globalAlpha) + '"' : ''; }
  stroke(p) {
    const d = (p || this.path).d;
    if (!d) return;
    this.out.push('<path d="' + d + '" fill="none" stroke="' + this.strokeStyle + '" stroke-width="' + r2(this.lineWidth) + '"' +
      (this.dash.length ? ' stroke-dasharray="' + this.dash.join(' ') + '"' : '') + ' stroke-linecap="round"' + this.alpha() + '/>');
  }
  fill(p) {
    const d = (p || this.path).d;
    if (d) this.out.push('<path d="' + d + '" fill="' + this.fillStyle + '"' + this.alpha() + '/>');
  }
  fillRect(x, y, w, h) {
    this.out.push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" fill="' + this.fillStyle + '"' + this.alpha() + '/>');
  }
  measureText(t) { this.measure.font = this.font; return this.measure.measureText(t); }
  fillText(t, x, y) {
    const m = /^(?:(\d+)\s+)?([\d.]+)px\s+(.*)$/.exec(this.font) || [];
    const anchor = { center: 'middle', right: 'end', end: 'end' }[this.textAlign] || 'start';
    const base = this.textBaseline === 'middle' ? ' dominant-baseline="central"' : '';
    this.out.push('<text x="' + r2(x) + '" y="' + r2(y) + '" fill="' + this.fillStyle + '" font-size="' + (m[2] || 11) + '"' +
      (m[1] ? ' font-weight="' + m[1] + '"' : '') + ' font-family="' + xmlEsc(m[3] || 'sans-serif') + '" text-anchor="' + anchor + '"' + base + this.alpha() + '>' + xmlEsc(t) + '</text>');
  }
  svg(W, H) {
    while (this.open > 0) { this.out.push('</g>'); this.open--; }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + this.out.join('') + '</svg>';
  }
}
function diagramWidth() { return Math.max(600, $('#st-wrap').clientWidth || 900); }
function exportName(ext, what) {
  const base = (S.scn.top || 'scenario').replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
  return base + '-' + what + '-seed' + S.scn.seed + '.' + ext;
}
function diagramSvg() {
  const W = diagramWidth();
  const c = new SvgCtx();
  drawDiagram({ ctx: c, W, Path2D: SvgPath });
  return c.svg(W, diagramHeight());
}
function diagramPng() {
  const W = diagramWidth(), H = diagramHeight(), k = 2;
  const cv = document.createElement('canvas');
  cv.width = W * k; cv.height = H * k;
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawDiagram({ ctx, W });
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
// the graph: both SVG layers merged, with computed styles written inline
function graphSvg() {
  const src = [$('#topo'), $('#topo-fx')];
  const vb = src[0].getAttribute('viewBox') || '0 0 700 460';
  const [, , w, h] = vb.split(/\s+/).map(Number);
  const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'opacity',
    'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'];
  const out = document.createElementNS(SVGNS, 'svg');
  out.setAttribute('xmlns', SVGNS);
  out.setAttribute('viewBox', vb);
  out.setAttribute('width', Math.round(w));
  out.setAttribute('height', Math.round(h));
  const [vx, vy] = vb.split(/\s+/).map(Number);
  const bg = document.createElementNS(SVGNS, 'rect');
  bg.setAttribute('x', vx); bg.setAttribute('y', vy); bg.setAttribute('width', w); bg.setAttribute('height', h);
  bg.setAttribute('fill', S.colors.paper || '#ffffff');
  out.append(bg);
  const copy = (node, parent) => {
    if (node.nodeType === 3) { parent.append(node.textContent); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'title' || tag === 'pattern' || node.id === 'topo-bg' || node.classList.contains('lk-hit')) return;
    if (['script', 'foreignobject', 'iframe', 'use', 'a', 'image'].includes(tag)) return;
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || node.getAttribute('display') === 'none') return;
    const el2 = document.createElementNS(SVGNS, tag);
    for (const a of node.attributes) {
      const n = a.name.toLowerCase();
      if (['class', 'style', 'tabindex', 'role', 'data-node', 'data-link', 'data-msg', 'aria-label'].includes(n)) continue;
      if (n.startsWith('on') || /^\s*(javascript|data):/i.test(a.value)) continue;
      el2.setAttribute(a.name, a.value);
    }
    if (tag !== 'g' && tag !== 'svg' && tag !== 'defs' && tag !== 'marker') {
      for (const pr of props) {
        const v = cs.getPropertyValue(pr);
        if (v && v !== 'none' || pr === 'fill') el2.setAttribute(pr, v);
      }
    }
    parent.append(el2);
    for (const ch of node.childNodes) copy(ch, el2);
  };
  for (const s of src) for (const ch of s.childNodes) copy(ch, out);
  return new XMLSerializer().serializeToString(out);
}
// Last line of defense for the two SVG exports: the content is generated and escaped, but an image that leaves
// the page must never carry script, event handlers or javascript: URLs.
function sanitizeSvg(svg) {
  return String(svg)
    .replace(/<\s*(script|foreignObject|iframe|use|a)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe|use|a)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/(href|xlink:href|src)\s*=\s*"\s*(javascript|data):[^"]*"/gi, '')
    .replace(/(href|xlink:href|src)\s*=\s*'\s*(javascript|data):[^']*'/gi, '');
}
async function exportImage(kind) {
  const msg = $('#export-msg');
  if (!S.res && kind !== 'graph-svg') { msg.textContent = T('Run the simulation first.'); return; }
  try {
    if (kind === 'diagram-svg') await saveFile(exportName('svg', 'diagram'), sanitizeSvg(diagramSvg()), 'image/svg+xml', msg);
    else if (kind === 'diagram-png') await saveFile(exportName('png', 'diagram'), await diagramPng(), 'image/png', msg);
    else await saveFile(exportName('svg', 'graph'), sanitizeSvg(graphSvg()), 'image/svg+xml', msg);
  } catch (e) { msg.textContent = 'Could not create the image: ' + e.message; }
}

// ============================================================ settings
const SETTINGS_KEY = 'ds-playground:settings';
const SET = Object.assign({ theme: 'system', palette: 'standard', lang: 'en' }, (() => {
  try {
    const v = safeParse(store.get(SETTINGS_KEY) || '{}');
    const out = {};
    if (['system', 'light', 'dark'].includes(v.theme)) out.theme = v.theme;
    if (['standard', 'cvd'].includes(v.palette)) out.palette = v.palette;
    if (['en', 'it'].includes(v.lang)) out.lang = v.lang;
    return out;
  } catch (e) { return {}; }
})());
function applySettings() {
  const root = document.documentElement;
  if (SET.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', SET.theme);
  if (SET.palette === 'cvd') root.setAttribute('data-palette', 'cvd'); else root.removeAttribute('data-palette');
  root.setAttribute('lang', SET.lang);
  if (window.SimI18n) window.SimI18n.setLang(SET.lang);
  readColors();
  if (S.scn) { renderTopo(); drawDiagram(); drawPreview(); renderLayerLegend(); if (S.tab === 'stack') renderStack(true); }
}
function saveSettings() { store.set(SETTINGS_KEY, JSON.stringify(SET)); }
function bindSettings() {
  const dlg = $('#dlg-settings');
  $('#btn-settings').addEventListener('click', () => {
    $('#set-theme').value = SET.theme; $('#set-palette').value = SET.palette; $('#set-lang').value = SET.lang;
    dlg.showModal();
  });
  for (const [id, key] of [['#set-theme', 'theme'], ['#set-palette', 'palette'], ['#set-lang', 'lang']]) {
    $(id).addEventListener('change', e => { SET[key] = e.target.value; saveSettings(); applySettings(); });
  }
  const docs = dlg.querySelector('a.btn-link');
  if (location.protocol === 'file:' || /github\.io$/.test(location.hostname)) { docs.href = 'manual/index.html'; docs.removeAttribute('target'); }
  $('#btn-open-present').addEventListener('click', () => { dlg.close(); togglePresentation(true); });
  $('#btn-open-shortcuts').addEventListener('click', () => { dlg.close(); $('#dlg-shortcuts').showModal(); });
  $('#btn-open-tour').addEventListener('click', () => { dlg.close(); startTour(); });
  $('#btn-shortcuts').addEventListener('click', () => $('#dlg-shortcuts').showModal());
  $('#btn-present-exit').addEventListener('click', () => togglePresentation(false));
}

// ============================================================ presentation mode
function togglePresentation(on) {
  const body = document.body;
  on = on === undefined ? !body.classList.contains('present') : on;
  body.classList.toggle('present', on);
  $('#btn-present-exit').hidden = !on;
  S.fontScale = on ? 1.35 : 1;
  ROW = on ? 36 : 26; TOP = on ? 32 : 26;
  if (on) {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    toast(T('Presentation mode: arrows or a clicker step through events, P or Esc to leave.'));
  } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  setTimeout(() => { fitView(); renderTopo(); drawDiagram(); }, 60);
}

// ============================================================ welcome tour
const TOUR = [
  { sel: '.topo', title: 'The graph', text: 'Processes and the links between them. Messages travel along the links as packets. Click a process or a packet to inspect it.' },
  { sel: '[data-tab=code]', title: 'The algorithm', text: 'Algorithms are written in Upon, the event-driven pseudocode of the textbooks. Errors appear under the editor as you type.' },
  { sel: '[data-tab=time]', title: 'The timing model', text: 'Choose what the algorithm assumes and how the network really behaves. When reality breaks the assumption, the message turns red.' },
  { sel: '[data-tab=scen]', title: 'Inputs and faults', text: 'Tell processes what to do, and schedule crashes, recoveries, link failures and partitions.' },
  { sel: '#btn-run', title: 'Run', text: 'Simulate the scenario. The same seed always gives the same run.' },
  { sel: '.transport', title: 'Playback', text: 'Play, pause and step. "Event by event" is the easiest speed to follow an algorithm.' },
  { sel: '#st-wrap', title: 'The space-time diagram', text: 'One line per process, one arrow per message. Tick Causality and click an event to see what caused it.' },
  { sel: '#btn-gallery', title: 'Examples', text: 'Start from a classic algorithm. Each example comes with experiments to try. The ⚙ menu brings this tour back.' }
];
const TOUR_KEY = 'ds-playground:toured';
let tourStep = -1;
function startTour() { tourStep = 0; $('#tour').hidden = false; showTourStep(); }
function endTour() { tourStep = -1; $('#tour').hidden = true; store.set(TOUR_KEY, '1'); }
function showTourStep() {
  const step = TOUR[tourStep];
  const target = $(step.sel);
  if (!target) { endTour(); return; }
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = target.getBoundingClientRect();
  const ring = $('#tour .tour-ring'), card = $('#tour .tour-card');
  const pad = 6;
  Object.assign(ring.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + 2 * pad) + 'px', height: (r.height + 2 * pad) + 'px' });
  $('#tour-title').textContent = T(step.title);
  $('#tour-text').textContent = T(step.text);
  $('#tour-count').textContent = (tourStep + 1) + ' / ' + TOUR.length;
  $('#tour-back').disabled = tourStep === 0;
  $('#tour-next').textContent = T(tourStep === TOUR.length - 1 ? 'Done' : 'Next');
  const cw = Math.min(340, window.innerWidth - 20);
  card.style.width = cw + 'px';
  const ch = card.offsetHeight || 150;
  let top = r.bottom + pad + 10;
  if (top + ch > window.innerHeight - 10) top = Math.max(10, r.top - pad - 10 - ch);
  if (top + ch > window.innerHeight - 10) top = Math.max(10, window.innerHeight - ch - 10);
  const left = Math.max(10, Math.min(r.left, window.innerWidth - cw - 10));
  Object.assign(card.style, { top: top + 'px', left: left + 'px' });
  $('#tour-next').focus();
}
function bindTour() {
  $('#tour-next').addEventListener('click', () => { if (tourStep >= TOUR.length - 1) endTour(); else { tourStep++; showTourStep(); } });
  $('#tour-back').addEventListener('click', () => { if (tourStep > 0) { tourStep--; showTourStep(); } });
  $('#tour-skip').addEventListener('click', endTour);
  window.addEventListener('resize', () => { if (tourStep >= 0) showTourStep(); });
}

// ============================================================ gallery
function thumbnail(scn) {
  const ns = scn.nodes;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const W = 160, H = 96, pad = 12;
  const k = Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad) / Math.max(1, y1 - y0));
  const px = n => pad + (n.x - x0) * k + ((W - 2 * pad) - (x1 - x0) * k) / 2;
  const py = n => pad + (n.y - y0) * k + ((H - 2 * pad) - (y1 - y0) * k) / 2;
  const byId = new Map(ns.map(n => [+n.id, n]));
  const g = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'thumb', 'aria-hidden': 'true' });
  for (const l of scn.links || []) {
    const a = byId.get(+l.a), b = byId.get(+l.b);
    if (a && b) g.append(sv('line', { x1: px(a), y1: py(a), x2: px(b), y2: py(b) }));
  }
  for (const n of ns) g.append(sv('circle', { cx: px(n), cy: py(n), r: ns.length > 10 ? 3.5 : 5 }));
  return g;
}
const MODEL_NAMES = { 'asynchronous': 'asynchronous', 'partial': 'partially synchronous', 'synchronous-rounds': 'synchronous rounds', 'synchronous-timed': 'timed synchronous' };
function renderGallery(filter) {
  const grid = $('#gallery-grid'); grid.textContent = '';
  const cats = ['All'].concat([...new Set(EX.EXAMPLES.map(e => e.category))]);
  const bar = $('#gallery-filter'); bar.textContent = '';
  for (const c of cats) bar.append(el('button', { type: 'button', class: 'chip-btn' + (c === filter ? ' on' : ''), onclick: () => renderGallery(c) }, T(c)));
  const items = EX.EXAMPLES.filter(e => filter === 'All' || e.category === filter);
  for (const ex of items) {
    const card = el('button', { type: 'button', class: 'card', onclick: () => { $('#dlg-gallery').close(); loadScenario(ex.scenario, T('Loaded:') + ' ' + T(ex.title) + '.'); } },
      thumbnail(ex.scenario),
      el('span', { class: 'card-title' }, T(ex.title)),
      el('span', { class: 'card-text' }, T(ex.summary || '')),
      el('span', { class: 'card-tags' }, el('span', { class: 'tag' }, T(ex.category || '')), el('span', { class: 'tag' }, T(MODEL_NAMES[ex.scenario.assumed.timing] || ''))));
    grid.append(card);
  }
  const blank = el('button', { type: 'button', class: 'card', onclick: () => { $('#dlg-gallery').close(); loadScenario(blankScenario(), T('Loaded the empty scenario.')); } },
    thumbnail(blankScenario()), el('span', { class: 'card-title' }, T('Empty scenario')),
    el('span', { class: 'card-text' }, T('A small ring and a starter program to write your own algorithm.')),
    el('span', { class: 'card-tags' }, el('span', { class: 'tag' }, T('Getting started'))));
  if (filter === 'All') grid.append(blank);
}
function bindGallery() {
  $('#btn-gallery').addEventListener('click', () => { renderGallery('All'); $('#dlg-gallery').showModal(); });
  $('#btn-img-diagram-svg').addEventListener('click', () => exportImage('diagram-svg'));
  $('#btn-img-diagram-png').addEventListener('click', () => exportImage('diagram-png'));
  $('#btn-img-graph-svg').addEventListener('click', () => exportImage('graph-svg'));
}

async function init() {
  readColors();
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); renderTopo(); drawDiagram(); drawPreview(); });
  } catch (e) { /* older browsers */ }
  $('#toast').setAttribute('role', 'status');
  applySettings();
  bindHeader(); bindForms(); bindEditor(); bindTopo(); bindDiagram(); bindTransport(); bindDialogs(); bindKeys();
  bindSettings(); bindTour(); bindGallery();
  window.addEventListener('resize', () => { if (S.tab === 'time') drawPreview(); });
  window.addEventListener('hashchange', async () => {
    try { const shared = await fromHash(); if (shared) loadScenario(shared, 'Opened the shared scenario.'); }
    catch (e) { toast('The link does not contain a valid scenario.'); }
  });
  let initial = null;
  try { initial = await fromHash(); }
  catch (e) { toast('The link does not contain a valid scenario: loading the last saved one.'); }
  if (!initial) {
    const saved = store.get(STORE_KEY);
    if (saved) { try { initial = safeParse(saved); } catch (e) { initial = null; } }
  }
  if (!initial) initial = EX.EXAMPLES.find(x => x.key === 'flooding').scenario;
  loadScenario(initial, null);
  setMode('move');
  setTab('code');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawDiagram(); refreshCode(); });
  // the tour opens once, on the first visit (not under automated browsers)
  if (!store.get(TOUR_KEY) && !navigator.webdriver && !/[?&]notour\b/.test(location.search)) setTimeout(startTour, 900);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
