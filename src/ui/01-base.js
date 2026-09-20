// 01-base.js — state, helpers and small utilities shared by the rest of the interface

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
