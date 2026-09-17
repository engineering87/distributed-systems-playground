/* Distributed Systems Playground — simulator core (no DOM dependencies) */
(function (root) {
'use strict';

// ============================================================
// Errors
// ============================================================
class DslError extends Error {
  constructor(msg, line, col) { super(msg); this.line = line || 0; this.col = col || 0; }
}

// ============================================================
// Durations and distributions
// ============================================================
const UNIT = { us: 1, ms: 1000, s: 1000000 };

function parseDuration(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).trim();
  if (s === '' || s === 'none' || s === 'unknown') return null;
  const m = /^(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*(us|ms|s)?$/i.exec(s);
  if (!m) throw new Error('Invalid duration: "' + s + '" (examples: 50ms, 2s, 300us)');
  const unit = (m[2] || 'ms').toLowerCase();
  return Math.round(parseFloat(m[1]) * UNIT[unit]);
}

function fmtDuration(us) {
  if (us === null || us === undefined) return '—';
  const a = Math.abs(us);
  const trim = s => s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
  if (a >= 1e6) return trim((us / 1e6).toFixed(a >= 1e7 ? 1 : 3)) + ' s';
  if (a >= 1e3) return trim((us / 1e3).toFixed(a >= 1e5 ? 0 : 2)) + ' ms';
  return us + ' µs';
}

// Distributions: unitless arguments are milliseconds, except shape parameters.
// dimensionless=true: arguments are plain numbers (e.g. clock drift rho).
const DIST_SHAPE = {
  const: ['d'], uniform: ['d', 'd'], exp: ['d'], normal: ['d', 'd'],
  lognormal: ['x', 'x'], pareto: ['d', 'x'], empirical: null
};

function parseDist(str, dimensionless) {
  const s = String(str).trim();
  const m = /^([a-z]+)\s*\(([^)]*)\)$/i.exec(s);
  if (!m) {
    // a plain number or duration = constant
    if (dimensionless) {
      const v = parseFloat(s);
      if (isNaN(v)) throw new Error('Invalid value: "' + s + '"');
      return { name: 'const', args: [v], src: s };
    }
    return { name: 'const', args: [parseDuration(s)], src: s };
  }
  const name = m[1].toLowerCase();
  if (!(name in DIST_SHAPE)) throw new Error('Unknown distribution: ' + name +
    ' (available: const, uniform, exp, normal, lognormal, pareto, empirical)');
  const raw = m[2].split(',').map(x => x.trim()).filter(x => x !== '');
  const shape = DIST_SHAPE[name];
  if (shape && raw.length !== shape.length)
    throw new Error(name + ' takes ' + shape.length + ' argument(s)');
  const args = raw.map((a, i) => {
    const kind = shape ? shape[i] : 'd';
    if (dimensionless || kind === 'x') {
      const v = parseFloat(a);
      if (isNaN(v)) throw new Error('Invalid argument in ' + name + ': ' + a);
      return v;
    }
    return parseDuration(a);
  });
  return { name, args, src: s };
}

function sampleDist(d, rng) {
  const a = d.args;
  switch (d.name) {
    case 'const': return a[0];
    case 'uniform': return a[0] + (a[1] - a[0]) * rng.next();
    case 'exp': return -a[0] * Math.log(1 - rng.next());
    case 'normal': return a[0] + a[1] * rng.gauss();
    case 'lognormal': return Math.exp(a[0] + a[1] * rng.gauss()) * 1000; // mu,sigma in log(ms)
    case 'pareto': return a[0] / Math.pow(1 - rng.next(), 1 / a[1]);
    case 'empirical': return a[Math.floor(rng.next() * a.length)];
  }
  return 0;
}

// ============================================================
// Deterministic PRNG: xoshiro128** with substreams derived via splitmix32
// ============================================================
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function splitmix32(a) {
  return function () {
    a |= 0; a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15); t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0);
  };
}
class Rng {
  constructor(seed, stream) {
    const sm = splitmix32((seed >>> 0) ^ fnv1a(stream));
    this.s = [sm(), sm(), sm(), sm()];
    if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[0] = 1;
    this._g = null;
  }
  u32() {
    const s = this.s;
    const r = Math.imul(rotl(Math.imul(s[1], 5), 7), 9);
    const t = s[1] << 11;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = rotl(s[3], 11);
    return r >>> 0;
  }
  next() { return this.u32() / 4294967296; }
  gauss() {
    if (this._g !== null) { const g = this._g; this._g = null; return g; }
    let u = 0; while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this._g = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
}
function rotl(x, k) { return (x << k) | (x >>> (32 - k)); }
class Streams {
  constructor(seed) { this.seed = seed >>> 0; this.map = new Map(); }
  get(name) {
    let r = this.map.get(name);
    if (!r) { r = new Rng(this.seed, name); this.map.set(name, r); }
    return r;
  }
}

// ============================================================
// Values (immutable)
// ============================================================
class Atom { constructor(name) { this.name = name; } }
class Tup { constructor(items) { this.items = items; } }
class VSet {
  constructor(entries) { this.m = entries || new Map(); this._sorted = null; }
  static of(arr) { const m = new Map(); for (const v of arr) m.set(key(v), v); return new VSet(m); }
  sorted() { if (!this._sorted) this._sorted = [...this.m.values()].sort(compare); return this._sorted; }
  get size() { return this.m.size; }
}
class VMap {
  constructor(entries) { this.m = entries || new Map(); this._sorted = null; }
  sorted() { if (!this._sorted) this._sorted = [...this.m.values()].sort((a, b) => compare(a[0], b[0])); return this._sorted; }
  get size() { return this.m.size; }
}
const atomCache = new Map();
function atom(name) { let a = atomCache.get(name); if (!a) { a = new Atom(name); atomCache.set(name, a); } return a; }

function key(v) {
  if (v === null || v === undefined) return 'z';
  switch (typeof v) {
    case 'number': return 'n' + v;
    case 'boolean': return v ? 'bT' : 'bF';
    case 'string': return 's' + JSON.stringify(v);
  }
  if (v._k !== undefined) return v._k;
  let k;
  if (v instanceof Atom) k = 'a' + v.name;
  else if (v instanceof Tup) k = 't[' + v.items.map(key).join(',') + ']';
  else if (v instanceof VSet) k = 'S{' + v.sorted().map(key).join(',') + '}';
  else if (v instanceof VMap) k = 'M{' + v.sorted().map(e => key(e[0]) + ':' + key(e[1])).join(',') + '}';
  else k = '?';
  Object.defineProperty(v, '_k', { value: k, enumerable: false });
  return k;
}
function rank(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 2;
  if (typeof v === 'string') return 3;
  if (v instanceof Atom) return 4;
  if (v instanceof Tup) return 5;
  if (v instanceof VSet) return 6;
  if (v instanceof VMap) return 7;
  return 8;
}
function compare(a, b) {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 0: return 0;
    case 1: return (a ? 1 : 0) - (b ? 1 : 0);
    case 2: return a < b ? -1 : a > b ? 1 : 0;
    case 3: return a < b ? -1 : a > b ? 1 : 0;
    case 4: return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    case 5: return cmpList(a.items, b.items);
    case 6: return cmpList(a.sorted(), b.sorted());
    case 7: return cmpList(a.sorted().map(e => new Tup(e)), b.sorted().map(e => new Tup(e)));
  }
  return 0;
}
function cmpList(x, y) {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) { const c = compare(x[i], y[i]); if (c) return c; }
  return x.length - y.length;
}
function eq(a, b) { return a === b || key(a) === key(b); }

function fmt(v) {
  if (v === null || v === undefined) return 'nil';
  switch (typeof v) {
    case 'number': return String(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'string': return JSON.stringify(v);
  }
  if (v instanceof Atom) return v.name;
  if (v instanceof Tup) return '[' + v.items.map(fmt).join(', ') + ']';
  if (v instanceof VSet) return v.size ? '{' + v.sorted().map(fmt).join(', ') + '}' : '∅';
  if (v instanceof VMap) return '{' + v.sorted().map(e => fmt(e[0]) + ' ↦ ' + fmt(e[1])).join(', ') + '}';
  return '?';
}
function typeName(v) {
  return ['nil', 'boolean', 'number', 'string', 'atom', 'tuple', 'set', 'map', '?'][rank(v)];
}

// ============================================================
// Lexer
// ============================================================
const KEYWORDS = new Set(('interface request indication algorithm implements as uses params state stable ' +
  'upon event where condition exists in do end trigger if then elif else forall while starttimer ' +
  'canceltimer assert log skip and or not notin union inter minus subseteq true false nil function return call via').split(' '));

const UNICODE_MAP = {
  '∪': ['kw', 'union'], '∩': ['kw', 'inter'], '∈': ['kw', 'in'], '∉': ['kw', 'notin'],
  '∧': ['kw', 'and'], '∨': ['kw', 'or'], '¬': ['kw', 'not'], '⊆': ['kw', 'subseteq'],
  '∀': ['kw', 'forall'], '≠': ['op', '!='], '≤': ['op', '<='], '≥': ['op', '>='],
  '←': ['op', ':='], '⟨': ['op', 'LANG'], '⟩': ['op', 'RANG'], '∅': ['op', 'EMPTY'],
  '\\': ['kw', 'minus'], '↦': ['op', '->']
};

function isAtomName(name) { return name.length >= 2 && /^[A-Z][A-Z0-9_]*$/.test(name); }

function lex(src) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const n = src.length;
  function adv(k) {
    for (let j = 0; j < k; j++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; }
  }
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(1); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') adv(1); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const l0 = line, c0 = col; adv(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv(1);
      if (i >= n) throw new DslError('Unterminated comment', l0, c0);
      adv(2); continue;
    }
    const L = line, C = col;
    if (c === 'Π') { toks.push({ t: 'id', v: 'Procs', line: L, col: C }); adv(1); continue; }
    if (UNICODE_MAP[c]) { const [t, v] = UNICODE_MAP[c]; toks.push({ t, v, line: L, col: C }); adv(1); continue; }
    if (/[0-9]/.test(c)) {
      const m = /^(\d+(?:\.\d+)?(?:[eE]-?\d+)?)(us|ms|s)?(?![A-Za-z0-9_])/.exec(src.slice(i));
      if (!m) throw new DslError('Invalid number', L, C);
      let v = parseFloat(m[1]);
      let isDur = false;
      if (m[2]) { v = Math.round(v * UNIT[m[2]]); isDur = true; }
      toks.push({ t: 'num', v, dur: isDur, line: L, col: C });
      adv(m[0].length); continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      const w = m[0];
      if (KEYWORDS.has(w)) toks.push({ t: 'kw', v: w, line: L, col: C });
      else toks.push({ t: 'id', v: w, line: L, col: C });
      adv(w.length); continue;
    }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\n') throw new DslError('Unterminated string', L, C);
        if (src[j] === '\\' && j + 1 < n) { s += src[j + 1]; j += 2; } else { s += src[j]; j++; }
      }
      if (j >= n) throw new DslError('Unterminated string', L, C);
      toks.push({ t: 'str', v: s, line: L, col: C });
      adv(j + 1 - i); continue;
    }
    const two = src.substr(i, 2);
    if ([':=', '<=', '>=', '!=', '->'].includes(two)) { toks.push({ t: 'op', v: two, line: L, col: C }); adv(2); continue; }
    if ('<>=()[]{},|+-*/%#;:'.includes(c)) { toks.push({ t: 'op', v: c, line: L, col: C }); adv(1); continue; }
    throw new DslError('Unexpected character "' + c + '"', L, C);
  }
  toks.push({ t: 'eof', v: '', line, col });
  return toks;
}

// ============================================================
// Parser
// ============================================================
class Parser {
  constructor(src) { this.toks = lex(src); this.p = 0; this.noAngle = false; }
  get tok() { return this.toks[this.p]; }
  peek(k) { return this.toks[this.p + (k || 1)]; }
  is(t, v) { const k = this.tok; return k.t === t && (v === undefined || k.v === v); }
  isKw(v) { return this.is('kw', v); }
  isOp(v) { return this.is('op', v); }
  err(msg, tok) { tok = tok || this.tok; throw new DslError(msg, tok.line, tok.col); }
  desc(tok) { return tok.t === 'eof' ? 'end of input' : '"' + tok.v + '"'; }
  eat(t, v, what) {
    if (!this.is(t, v)) this.err('Expected ' + (what || '"' + v + '"') + ', found ' + this.desc(this.tok));
    return this.toks[this.p++];
  }
  kw(v) { return this.eat('kw', v); }
  op(v) { return this.eat('op', v); }
  ident(what) { return this.eat('id', undefined, what || 'an identifier'); }
  lang() {
    if (this.isOp('LANG') || this.isOp('<')) return this.toks[this.p++];
    this.err('Expected "⟨" (or "<"), found ' + this.desc(this.tok));
  }
  rang() {
    if (this.isOp('RANG') || this.isOp('>')) return this.toks[this.p++];
    this.err('Expected "⟩" (or ">"), found ' + this.desc(this.tok));
  }
  skipSemis() { while (this.isOp(';')) this.p++; }

  program() {
    const prog = { interfaces: new Map(), algorithms: [] };
    while (!this.is('eof')) {
      if (this.isKw('interface')) {
        const it = this.iface();
        if (prog.interfaces.has(it.name)) this.err('Interface "' + it.name + '" is already defined', it.tok);
        prog.interfaces.set(it.name, it);
      } else if (this.isKw('algorithm')) prog.algorithms.push(this.algorithm());
      else this.err('Expected "interface" or "algorithm", found ' + this.desc(this.tok));
    }
    return prog;
  }

  iface() {
    const tok = this.kw('interface');
    const name = this.ident('the interface name').v;
    const it = { name, tok, requests: new Map(), indications: new Map(), builtin: false };
    while (this.isKw('request') || this.isKw('indication')) {
      const dir = this.tok.v; this.p++;
      const ev = this.ident('the event name');
      let params = [];
      if (this.isOp('(')) {
        this.p++;
        if (!this.isOp(')')) { params.push(this.ident().v); while (this.isOp(',')) { this.p++; params.push(this.ident().v); } }
        this.op(')');
      }
      const tgt = dir === 'request' ? it.requests : it.indications;
      if (tgt.has(ev.v)) this.err('Event "' + ev.v + '" is already declared', ev);
      tgt.set(ev.v, params.length);
    }
    this.kw('end');
    return it;
  }

  algorithm() {
    const tok = this.kw('algorithm');
    const name = this.ident('the algorithm name').v;
    this.kw('implements');
    const implType = this.ident('the name of the implemented interface');
    this.kw('as');
    const implAlias = this.ident('the instance name').v;
    const uses = [];
    while (this.isKw('uses')) {
      this.p++;
      const t = this.ident('the name of the used interface');
      this.kw('as');
      const a = this.ident('the instance name');
      let via = null;
      if (this.isKw('via')) { this.p++; via = this.ident('the name of the algorithm to use'); }
      uses.push({ type: t.v, alias: a.v, tok: t, via: via ? via.v : null, viaTok: via });
    }
    const params = [], state = [];
    if (this.isKw('params')) {
      this.p++;
      while (this.is('id') && this.peek().t === 'op' && this.peek().v === ':=') {
        const id = this.ident(); this.op(':=');
        params.push({ name: id.v, expr: this.expr(), tok: id });
        this.skipSemis();
      }
    }
    if (this.isKw('state')) {
      this.p++;
      while ((this.is('id') && this.peek().t === 'op' && this.peek().v === ':=') || this.isKw('stable')) {
        let stable = false;
        if (this.isKw('stable')) { stable = true; this.p++; }
        const id = this.ident(); this.op(':=');
        state.push({ name: id.v, expr: this.expr(), stable, tok: id });
        this.skipSemis();
      }
    }
    const handlers = [], functions = [];
    while (this.isKw('upon') || this.isKw('function')) {
      if (this.isKw('upon')) handlers.push(this.handler());
      else functions.push(this.functionDecl());
    }
    this.kw('end');
    return { name, tok, implType: implType.v, implTok: implType, implAlias, uses, params, state, handlers, functions };
  }

  functionDecl() {
    const tok = this.kw('function');
    const name = this.ident('the function name');
    this.op('(');
    const params = [];
    if (!this.isOp(')')) { params.push(this.ident().v); while (this.isOp(',')) { this.p++; params.push(this.ident().v); } }
    this.op(')');
    const body = this.block();
    this.kw('end');
    return { name: name.v, tok: name, params, body, line: tok.line };
  }

  handler() {
    const tok = this.kw('upon');
    let h;
    if (this.isKw('event')) {
      this.p++;
      this.lang();
      const inst = this.ident('the instance name');
      let ev, pats = [];
      if (this.isOp(',')) {
        this.p++;
        ev = this.ident('the event name');
        if (this.isOp('|')) {
          this.p++;
          pats.push(this.pattern());
          while (this.isOp(',')) { this.p++; pats.push(this.pattern()); }
        }
      } else {
        // the short form ⟨Timeout⟩ is not supported: an instance is required
        this.err('Expected "," after the instance name (form: ⟨instance, Event | args⟩)');
      }
      this.rang();
      let where = null;
      if (this.isKw('where')) { this.p++; where = this.expr(); }
      h = { kind: 'event', inst: inst.v, instTok: inst, ev: ev.v, evTok: ev, pats, where };
    } else if (this.isKw('condition')) {
      this.p++;
      h = { kind: 'cond', expr: this.expr() };
    } else if (this.isKw('exists')) {
      this.p++;
      const v = this.ident().v;
      this.kw('in');
      const set = this.expr();
      this.kw('where');
      h = { kind: 'exists', var: v, set, where: this.expr() };
    } else this.err('"upon" must be followed by "event", "condition" or "exists"');
    this.kw('do');
    h.body = this.block();
    this.kw('end');
    h.tok = tok; h.line = tok.line;
    return h;
  }

  pattern() {
    const tok = this.tok;
    if (this.is('id')) { this.p++; return { k: tok.v === '_' ? 'wild' : 'id', name: tok.v, tok }; }
    if (this.isOp('[')) {
      this.p++;
      const items = [];
      if (!this.isOp(']')) { items.push(this.pattern()); while (this.isOp(',')) { this.p++; items.push(this.pattern()); } }
      this.op(']');
      return { k: 'tup', items, tok };
    }
    if (this.is('num')) { this.p++; return { k: 'lit', value: tok.v, tok }; }
    if (this.is('str')) { this.p++; return { k: 'lit', value: tok.v, tok }; }
    if (this.isKw('true') || this.isKw('false')) { this.p++; return { k: 'lit', value: tok.v === 'true', tok }; }
    if (this.isKw('nil')) { this.p++; return { k: 'lit', value: null, tok }; }
    if (this.isOp('-') && this.peek().t === 'num') { this.p += 2; return { k: 'lit', value: -this.toks[this.p - 1].v, tok }; }
    this.err('Invalid pattern: ' + this.desc(tok));
  }

  block() {
    const stmts = [];
    for (;;) {
      this.skipSemis();
      const k = this.tok;
      if (k.t === 'eof' || (k.t === 'kw' && ['end', 'elif', 'else'].includes(k.v))) break;
      stmts.push(this.stmt());
    }
    return stmts;
  }

  stmt() {
    const tok = this.tok;
    const line = tok.line;
    if (tok.t === 'id') {
      const target = this.ident();
      const idx = [];
      while (this.isOp('[')) { this.p++; idx.push(this.withAngles(() => this.expr())); this.op(']'); }
      if (!this.isOp(':=')) this.err('Expected ":=" (statements start with a keyword or an assignment)');
      this.p++;
      return { s: 'assign', name: target.v, idx, expr: this.expr(), line, tok: target };
    }
    if (tok.t !== 'kw') this.err('Invalid statement: ' + this.desc(tok));
    switch (tok.v) {
      case 'trigger': {
        this.p++;
        this.lang();
        const inst = this.ident('the instance name');
        this.op(',');
        const ev = this.ident('the event name');
        const args = [];
        if (this.isOp('|')) {
          this.p++;
          const saved = this.noAngle; this.noAngle = true;
          args.push(this.expr());
          while (this.isOp(',')) { this.p++; args.push(this.expr()); }
          this.noAngle = saved;
        }
        this.rang();
        return { s: 'trigger', inst: inst.v, instTok: inst, ev: ev.v, evTok: ev, args, line };
      }
      case 'if': {
        this.p++;
        const branches = [];
        const c = this.expr(); this.kw('then');
        branches.push({ cond: c, body: this.block() });
        let els = null;
        while (this.isKw('elif')) { this.p++; const c2 = this.expr(); this.kw('then'); branches.push({ cond: c2, body: this.block() }); }
        if (this.isKw('else')) { this.p++; els = this.block(); }
        this.kw('end');
        return { s: 'if', branches, els, line };
      }
      case 'forall': {
        this.p++;
        const v = this.ident().v;
        this.kw('in');
        const set = this.expr();
        let where = null;
        if (this.isKw('where')) { this.p++; where = this.expr(); }
        this.kw('do');
        const body = this.block();
        this.kw('end');
        return { s: 'forall', var: v, set, where, body, line };
      }
      case 'while': {
        this.p++;
        const cond = this.expr();
        this.kw('do');
        const body = this.block();
        this.kw('end');
        return { s: 'while', cond, body, line };
      }
      case 'starttimer': {
        this.p++; this.op('(');
        const id = this.ident('the timer name');
        this.op(',');
        const d = this.withAngles(() => this.expr());
        this.op(')');
        return { s: 'starttimer', id: id.v, dur: d, line, tok: id };
      }
      case 'canceltimer': {
        this.p++; this.op('(');
        const id = this.ident('the timer name');
        this.op(')');
        return { s: 'canceltimer', id: id.v, line, tok: id };
      }
      case 'assert': {
        this.p++;
        const e = this.expr();
        let msg = null;
        if (this.isOp(',')) { this.p++; msg = this.expr(); }
        return { s: 'assert', expr: e, msg, line };
      }
      case 'log': {
        this.p++;
        const args = [this.expr()];
        while (this.isOp(',')) { this.p++; args.push(this.expr()); }
        return { s: 'log', args, line };
      }
      case 'skip': this.p++; return { s: 'skip', line };
      case 'return': {
        this.p++;
        const k = this.tok;
        const bare = k.t === 'eof' || (k.t === 'op' && k.v === ';') ||
          (k.t === 'kw' && ['end', 'elif', 'else', 'if', 'forall', 'while', 'trigger', 'starttimer', 'canceltimer',
            'assert', 'log', 'skip', 'return', 'call'].includes(k.v));
        return { s: 'return', expr: bare ? null : this.expr(), line, tok };
      }
      case 'call': {
        this.p++;
        const name = this.ident('the function name');
        this.op('(');
        const args = [];
        this.withAngles(() => {
          if (!this.isOp(')')) { args.push(this.expr()); while (this.isOp(',')) { this.p++; args.push(this.expr()); } }
        });
        this.op(')');
        return { s: 'call', name: name.v, args, line, tok: name };
      }
    }
    this.err('Invalid statement: ' + this.desc(tok));
  }

  withAngles(fn) { const s = this.noAngle; this.noAngle = false; try { return fn(); } finally { this.noAngle = s; } }

  // ----- espressioni -----
  expr() { return this.orExpr(); }
  orExpr() {
    let l = this.andExpr();
    while (this.isKw('or')) { const t = this.tok; this.p++; l = { e: 'bin', op: 'or', l, r: this.andExpr(), tok: t }; }
    return l;
  }
  andExpr() {
    let l = this.notExpr();
    while (this.isKw('and')) { const t = this.tok; this.p++; l = { e: 'bin', op: 'and', l, r: this.notExpr(), tok: t }; }
    return l;
  }
  notExpr() {
    if (this.isKw('not')) { const t = this.tok; this.p++; return { e: 'un', op: 'not', x: this.notExpr(), tok: t }; }
    return this.cmpExpr();
  }
  cmpExpr() {
    const l = this.setExpr();
    const k = this.tok;
    let op = null;
    if (k.t === 'op' && ['=', '!=', '<=', '>='].includes(k.v)) op = k.v;
    else if (k.t === 'op' && (k.v === '<' || k.v === '>') && !this.noAngle) op = k.v;
    else if (k.t === 'kw' && ['in', 'notin', 'subseteq'].includes(k.v)) op = k.v;
    if (!op) return l;
    this.p++;
    return { e: 'bin', op, l, r: this.setExpr(), tok: k };
  }
  setExpr() {
    let l = this.addExpr();
    while (this.isKw('union') || this.isKw('inter') || this.isKw('minus')) {
      const t = this.tok; this.p++;
      l = { e: 'bin', op: t.v, l, r: this.addExpr(), tok: t };
    }
    return l;
  }
  addExpr() {
    let l = this.mulExpr();
    while (this.isOp('+') || this.isOp('-')) { const t = this.tok; this.p++; l = { e: 'bin', op: t.v, l, r: this.mulExpr(), tok: t }; }
    return l;
  }
  mulExpr() {
    let l = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { const t = this.tok; this.p++; l = { e: 'bin', op: t.v, l, r: this.unary(), tok: t }; }
    return l;
  }
  unary() {
    if (this.isOp('-')) { const t = this.tok; this.p++; return { e: 'un', op: 'neg', x: this.unary(), tok: t }; }
    if (this.isOp('#')) { const t = this.tok; this.p++; return { e: 'un', op: 'card', x: this.unary(), tok: t }; }
    return this.postfix();
  }
  postfix() {
    let x = this.primary();
    for (;;) {
      if (this.isOp('[')) {
        const t = this.tok; this.p++;
        const i = this.withAngles(() => this.expr());
        this.op(']');
        x = { e: 'index', x, i, tok: t };
      } else if (this.isOp('(')) {
        const t = this.tok;
        if (x.e !== 'var') this.err('Only built-in functions can be called', t);
        this.p++;
        const args = [];
        this.withAngles(() => {
          if (!this.isOp(')')) { args.push(this.expr()); while (this.isOp(',')) { this.p++; args.push(this.expr()); } }
        });
        this.op(')');
        x = { e: 'call', name: x.name, args, tok: x.tok };
      } else break;
    }
    return x;
  }
  primary() {
    const t = this.tok;
    if (t.t === 'num') { this.p++; return { e: 'lit', v: t.v, tok: t }; }
    if (t.t === 'str') { this.p++; return { e: 'lit', v: t.v, tok: t }; }
    if (t.t === 'kw' && (t.v === 'true' || t.v === 'false')) { this.p++; return { e: 'lit', v: t.v === 'true', tok: t }; }
    if (t.t === 'kw' && t.v === 'nil') { this.p++; return { e: 'lit', v: null, tok: t }; }
    if (t.t === 'op' && t.v === 'EMPTY') { this.p++; return { e: 'setlit', items: [], tok: t }; }
    if (t.t === 'id') { this.p++; return { e: 'var', name: t.v, tok: t }; }
    if (t.t === 'op' && t.v === '(') {
      this.p++;
      const x = this.withAngles(() => this.expr());
      this.op(')');
      return x;
    }
    if (t.t === 'op' && t.v === '[') {
      this.p++;
      const items = [];
      this.withAngles(() => {
        if (!this.isOp(']')) { items.push(this.expr()); while (this.isOp(',')) { this.p++; items.push(this.expr()); } }
      });
      this.op(']');
      return { e: 'tuplit', items, tok: t };
    }
    if (t.t === 'op' && t.v === '{') {
      this.p++;
      return this.withAngles(() => {
        if (this.is('id') && this.peek().t === 'kw' && this.peek().v === 'in') {
          const v = this.ident().v; this.kw('in');
          const set = this.expr();
          this.kw('where', 'in a comprehension "{x in S where condition}"');
          const where = this.expr();
          this.op('}');
          return { e: 'compr', var: v, set, where, tok: t };
        }
        const items = [];
        if (!this.isOp('}')) { items.push(this.expr()); while (this.isOp(',')) { this.p++; items.push(this.expr()); } }
        this.op('}');
        return { e: 'setlit', items, tok: t };
      });
    }
    this.err('Expected an expression, found ' + this.desc(t));
  }
}

function parseProgram(src) { return new Parser(src).program(); }

function parseExprOnly(src) {
  const p = new Parser(src);
  const e = p.expr();
  if (!p.is('eof')) p.err('Unexpected text after the expression: ' + p.desc(p.tok));
  return e;
}

// ============================================================
// Built-in interfaces
// ============================================================
function builtinIfaces() {
  const m = new Map();
  m.set('Net', { name: 'Net', builtin: true, requests: new Map([['Send', 2]]), indications: new Map([['Deliver', 2]]) });
  m.set('Rounds', { name: 'Rounds', builtin: true, requests: new Map([['Send', 2]]),
    indications: new Map([['RoundStart', 1], ['Deliver', 2], ['RoundEnd', 1]]) });
  return m;
}

const BUILTIN_VARS = new Set(['self', 'Procs', 'neighbors', 'N', 'DELTA', 'PHI', 'RHO', 'round']);
const BUILTIN_FUNS = {
  min: [1, 1], max: [1, 1], choose: [1, 1], size: [1, 1], keys: [1, 1], values: [1, 1],
  map: [0, 0], random: [2, 2], now: [0, 0], abs: [1, 1], append: [2, 2], toset: [1, 1], str: [1, 1],
  head: [1, 1], tail: [1, 1], last: [1, 1], sort: [1, 1], reverse: [1, 1], slice: [3, 3], range: [2, 2],
  remove: [2, 2], get: [3, 3], sum: [1, 1], mean: [1, 1], argmin: [1, 1], argmax: [1, 1], pick: [1, 1],
  sqrt: [1, 1], ln: [1, 1], exp: [1, 1], pow: [2, 2], floor: [1, 1], ceil: [1, 1], round: [1, 1]
};

// ============================================================
// Static checks
// ============================================================
// ctx: { timing, roundMode, known: {DELTA,PHI,RHO} }
function check(prog, ctx) {
  const errors = [], warnings = [];
  const E = (msg, tok) => errors.push({ msg, line: tok ? tok.line : 0, col: tok ? tok.col : 0 });
  const W = (msg, tok) => warnings.push({ msg, line: tok ? tok.line : 0, col: tok ? tok.col : 0 });
  const ifaces = new Map([...builtinIfaces(), ...prog.interfaces]);
  const rounds = ctx.timing === 'synchronous-rounds';
  const lockstep = rounds && ctx.roundMode === 'lockstep';

  const names = new Set();
  for (const a of prog.algorithms) {
    if (names.has(a.name)) E('Algorithm "' + a.name + '" is already defined', a.tok);
    names.add(a.name);
    const impl = ifaces.get(a.implType);
    if (!impl) { E('Interface "' + a.implType + '" is not declared', a.implTok); continue; }
    if (impl.builtin) E('The built-in interface "' + a.implType + '" cannot be implemented', a.implTok);
    const aliases = new Map();
    aliases.set(a.implAlias, { role: 'impl', iface: impl });
    for (const u of a.uses) {
      const it = ifaces.get(u.type);
      if (!it) { E('Interface "' + u.type + '" is not declared', u.tok); continue; }
      if (u.type === 'Rounds' && !rounds)
        E('"Rounds" is only available when the assumed model is "synchronous rounds". Use "Net".', u.tok);
      if (u.type === 'Net' && rounds)
        E('With the "synchronous rounds" assumed model, messages go through "Rounds", not "Net".', u.tok);
      if (aliases.has(u.alias)) E('Duplicate instance name "' + u.alias + '"', u.tok);
      aliases.set(u.alias, { role: 'use', iface: it });
    }
    // user functions
    const funcs = new Map();
    for (const f of a.functions || []) {
      if (funcs.has(f.name)) E('Function "' + f.name + '" is already defined', f.tok);
      else if (BUILTIN_FUNS[f.name]) E('"' + f.name + '" is a built-in function', f.tok);
      funcs.set(f.name, f);
      if (new Set(f.params).size !== f.params.length) E('Repeated parameter in "' + f.name + '"', f.tok);
    }
    a.funcs = funcs;
    for (const u of a.uses) {
      if (!u.via) continue;
      if (u.type === 'Net' || u.type === 'Rounds') { E('"via" cannot be used with the provided module ' + u.type, u.viaTok); continue; }
      const target = prog.algorithms.find(x => x.name === u.via);
      if (!target) E('Algorithm "' + u.via + '" is not defined', u.viaTok);
      else if (target.implType !== u.type) E('"' + u.via + '" implements ' + target.implType + ', not ' + u.type, u.viaTok);
    }
    // timers used
    const timers = new Set();
    walkStmts(a.handlers.flatMap(h => h.body).concat((a.functions || []).flatMap(f => f.body)), s => {
      if (s.s === 'starttimer' || s.s === 'canceltimer') timers.add(s.id);
    });
    a.timers = timers;
    if (timers.size && lockstep) W('Timers in lockstep mode: time does not flow inside a round, use RoundStart/RoundEnd instead.', a.tok);

    const stateNames = new Set(a.state.map(s => s.name));
    const paramNames = new Set(a.params.map(p => p.name));
    for (const p of a.params) if (BUILTIN_VARS.has(p.name)) E('"' + p.name + '" is a built-in name', p.tok);
    for (const s of a.state) {
      if (BUILTIN_VARS.has(s.name)) E('"' + s.name + '" is a built-in name', s.tok);
      if (paramNames.has(s.name)) E('"' + s.name + '" is already a parameter', s.tok);
    }

    const checkVar = (name, tok, scope) => {
      if (scope.has(name) || stateNames.has(name) || paramNames.has(name)) return;
      if (BUILTIN_VARS.has(name)) {
        if (['DELTA', 'PHI', 'RHO'].includes(name) && ctx.known[name] === null)
          E('"' + name + '" is not available: its value is unknown in the assumed model' +
            (ctx.timing === 'asynchronous' ? ' (asynchronous system)' : ''), tok);
        if (name === 'round' && !rounds) E('"round" only exists in the synchronous rounds model', tok);
        return;
      }
      if (isAtomName(name)) return;
      E('Variable "' + name + '" is not declared', tok);
    };
    const checkExpr = (e, scope) => {
      if (!e) return;
      switch (e.e) {
        case 'lit': return;
        case 'var': return checkVar(e.name, e.tok, scope);
        case 'bin': checkExpr(e.l, scope); checkExpr(e.r, scope); return;
        case 'un': return checkExpr(e.x, scope);
        case 'index': checkExpr(e.x, scope); checkExpr(e.i, scope); return;
        case 'tuplit': case 'setlit': e.items.forEach(x => checkExpr(x, scope)); return;
        case 'compr': {
          checkExpr(e.set, scope);
          const s2 = new Set(scope); s2.add(e.var);
          checkExpr(e.where, s2); return;
        }
        case 'call': {
          if (funcs.has(e.name)) {
            const fd = funcs.get(e.name);
            if (e.args.length !== fd.params.length) E('"' + e.name + '" takes ' + fd.params.length + ' argument(s)', e.tok);
            e.args.forEach(x => checkExpr(x, scope));
            return;
          }
          const f = BUILTIN_FUNS[e.name];
          if (!f) { E('Unknown function "' + e.name + '"', e.tok); return; }
          if (e.args.length < f[0] || e.args.length > f[1])
            E('"' + e.name + '" takes ' + f[0] + (f[1] !== f[0] ? '–' + f[1] : '') + ' argument(s)', e.tok);
          if (e.name === 'now' && lockstep) E('"now()" is not available in lockstep mode', e.tok);
          e.args.forEach(x => checkExpr(x, scope));
          return;
        }
      }
    };
    const patVars = (p, scope, out) => {
      if (p.k === 'id') {
        if (scope.has(p.name) || stateNames.has(p.name) || paramNames.has(p.name) || BUILTIN_VARS.has(p.name)) return;
        if (isAtomName(p.name)) return;
        out.add(p.name);
      } else if (p.k === 'tup') p.items.forEach(x => patVars(x, scope, out));
    };
    const collectAssigned = (stmts, out) => walkStmts(stmts, s => {
      if (s.s === 'assign' && !stateNames.has(s.name)) out.add(s.name);
    });
    const checkBlock = (stmts, scope) => {
      for (const s of stmts) {
        switch (s.s) {
          case 'assign':
            if (paramNames.has(s.name)) E('Parameter "' + s.name + '" cannot be modified', s.tok);
            if (BUILTIN_VARS.has(s.name)) E('"' + s.name + '" is built-in and cannot be modified', s.tok);
            if (s.idx.length && !stateNames.has(s.name) && !scope.has(s.name))
              E('"' + s.name + '" is not declared', s.tok);
            s.idx.forEach(x => checkExpr(x, scope));
            checkExpr(s.expr, scope); break;
          case 'trigger': {
            const al = aliases.get(s.inst);
            if (!al) { E('Unknown instance "' + s.inst + '" in this algorithm', s.instTok); break; }
            if (al.role === 'impl') {
              if (!al.iface.indications.has(s.ev))
                E('"' + s.ev + '" is not an indication of ' + al.iface.name + ' (only indications can be emitted upwards)', s.evTok);
              else if (al.iface.indications.get(s.ev) !== s.args.length)
                E('"' + s.ev + '" takes ' + al.iface.indications.get(s.ev) + ' argument(s)', s.evTok);
            } else {
              if (!al.iface.requests.has(s.ev))
                E('"' + s.ev + '" is not a request of ' + al.iface.name + ' (only requests can be sent downwards)', s.evTok);
              else if (al.iface.requests.get(s.ev) !== s.args.length)
                E('"' + s.ev + '" takes ' + al.iface.requests.get(s.ev) + ' argument(s)', s.evTok);
            }
            s.args.forEach(x => checkExpr(x, scope));
            break;
          }
          case 'if':
            s.branches.forEach(b => { checkExpr(b.cond, scope); checkBlock(b.body, scope); });
            if (s.els) checkBlock(s.els, scope);
            break;
          case 'forall': {
            checkExpr(s.set, scope);
            const s2 = new Set(scope); s2.add(s.var);
            checkExpr(s.where, s2); checkBlock(s.body, s2); break;
          }
          case 'while': checkExpr(s.cond, scope); checkBlock(s.body, scope); break;
          case 'starttimer':
            if (rounds && lockstep) E('Timers are not available in lockstep mode', s.tok);
            checkExpr(s.dur, scope); break;
          case 'canceltimer': break;
          case 'assert': checkExpr(s.expr, scope); checkExpr(s.msg, scope); break;
          case 'log': s.args.forEach(x => checkExpr(x, scope)); break;
          case 'return':
            if (!scope.has('#function')) E('"return" can only be used inside a function', s.tok);
            checkExpr(s.expr, scope); break;
          case 'call':
            if (!funcs.has(s.name)) E(BUILTIN_FUNS[s.name] ? '"call" is for your own functions; use "' + s.name + '(…)" in an expression'
              : 'Unknown function "' + s.name + '"', s.tok);
            else if (funcs.get(s.name).params.length !== s.args.length) E('"' + s.name + '" takes ' + funcs.get(s.name).params.length + ' argument(s)', s.tok);
            s.args.forEach(x => checkExpr(x, scope)); break;
        }
      }
    };

    const seenEv = new Set();
    for (const h of a.handlers) {
      const scope = new Set();
      if (h.kind === 'event') {
        if (h.inst === 'timer') {
          if (h.ev !== 'Timeout') E('The "timer" instance only produces the "Timeout" event', h.evTok);
          else if (h.pats.length !== 1) E('"Timeout" has one argument (the timer name)', h.evTok);
          else if (h.pats[0].k === 'id' && !timers.has(h.pats[0].name))
            W('Timer "' + h.pats[0].name + '" is never started in this algorithm', h.pats[0].tok);
          if (h.pats[0] && h.pats[0].k === 'id') h.pats[0].k = 'timer';
        } else {
          const al = aliases.get(h.inst);
          if (!al) E('Unknown instance "' + h.inst + '" in this algorithm', h.instTok);
          else if (al.role === 'impl') {
            if (h.ev === 'Init' || h.ev === 'Recovery') {
              if (h.pats.length) E('"' + h.ev + '" has no arguments', h.evTok);
            } else if (!al.iface.requests.has(h.ev))
              E('"' + h.ev + '" is not a request of ' + al.iface.name + ' (only requests arrive from above)', h.evTok);
            else if (al.iface.requests.get(h.ev) !== h.pats.length)
              E('"' + h.ev + '" has ' + al.iface.requests.get(h.ev) + ' argument(s)', h.evTok);
          } else {
            if (!al.iface.indications.has(h.ev))
              E('"' + h.ev + '" is not an indication of ' + al.iface.name + ' (only indications arrive from below)', h.evTok);
            else if (al.iface.indications.get(h.ev) !== h.pats.length)
              E('"' + h.ev + '" has ' + al.iface.indications.get(h.ev) + ' argument(s)', h.evTok);
          }
        }
        seenEv.add(h.inst + '.' + h.ev);
        const pv = new Set();
        h.pats.forEach(p => patVars(p, scope, pv));
        pv.forEach(v => scope.add(v));
        h.binds = pv;
        checkExpr(h.where, scope);
      } else if (h.kind === 'cond') {
        checkExpr(h.expr, scope);
      } else {
        checkExpr(h.set, scope);
        scope.add(h.var);
        checkExpr(h.where, scope);
      }
      collectAssigned(h.body, scope);
      checkBlock(h.body, scope);
    }
    for (const f of a.functions || []) {
      const scope = new Set(f.params);
      scope.add('#function');
      collectAssigned(f.body, scope);
      checkBlock(f.body, scope);
    }
    // indications from lower layers that are never handled
    for (const u of a.uses) {
      const it = ifaces.get(u.type);
      if (!it) continue;
      for (const ev of it.indications.keys())
        if (!seenEv.has(u.alias + '.' + ev) && !(u.type === 'Rounds' && ev !== 'Deliver'))
          W('No handler for ⟨' + u.alias + ', ' + ev + '⟩: these events will be ignored', u.tok);
    }
    // initializers
    for (const p of a.params) checkExpr(p.expr, new Set());
    for (const s of a.state) checkExpr(s.expr, new Set());
  }
  return { errors, warnings, ifaces };
}

function walkStmts(stmts, fn) {
  for (const s of stmts) {
    fn(s);
    if (s.s === 'if') { s.branches.forEach(b => walkStmts(b.body, fn)); if (s.els) walkStmts(s.els, fn); }
    else if (s.s === 'forall' || s.s === 'while') walkStmts(s.body, fn);
  }
}

// ============================================================
// Instance stack resolution
// ============================================================
function resolveStack(prog, topName) {
  const byName = new Map(prog.algorithms.map(a => [a.name, a]));
  const top = byName.get(topName);
  if (!top) throw new Error('Main algorithm "' + topName + '" not found');
  const byIface = new Map();
  for (const a of prog.algorithms) {
    if (!byIface.has(a.implType)) byIface.set(a.implType, []);
    byIface.get(a.implType).push(a);
  }
  const warnings = [];
  const specs = [];
  function build(algo, path, parent, aliasInParent, chain) {
    if (chain.includes(algo.name)) throw new Error('Circular dependency: ' + chain.concat(algo.name).join(' → '));
    const spec = { id: specs.length, algo, path, parent, aliasInParent, bind: {} };
    specs.push(spec);
    for (const u of algo.uses) {
      if (u.type === 'Net' || u.type === 'Rounds') { spec.bind[u.alias] = { builtin: u.type }; continue; }
      let chosen;
      if (u.via) {
        chosen = byName.get(u.via);
        if (!chosen || chosen.implType !== u.type) throw new Error('"' + u.via + '" does not implement ' + u.type);
      } else {
        const cands = byIface.get(u.type) || [];
        if (!cands.length) throw new Error('No algorithm implements "' + u.type + '" (required by ' + algo.name + ')');
        if (cands.length > 1) warnings.push('Several algorithms implement ' + u.type + ': ' + algo.name + ' uses ' + cands[0].name +
          ' (write "uses ' + u.type + ' as ' + u.alias + ' via …" to choose)');
        chosen = cands[0];
      }
      const child = build(chosen, path + '/' + u.alias, spec.id, u.alias, chain.concat(algo.name));
      spec.bind[u.alias] = { inst: child.id };
    }
    return spec;
  }
  build(top, top.implAlias, null, null, []);
  return { specs, warnings };
}

// ============================================================
// Interpreter
// ============================================================
class RtError extends Error { constructor(msg, line) { super(msg); this.line = line; } }
class HaltSignal extends Error { constructor(msg) { super(msg); } }
class ReturnSignal { constructor(value) { this.value = value; } }
const MAX_CALL_DEPTH = 200;
function callUser(fd, args, env, line) {
  const depth = (env.depth || 0) + 1;
  if (depth > MAX_CALL_DEPTH) throw new RtError('Function calls nested deeper than ' + MAX_CALL_DEPTH + ' (infinite recursion?)', line);
  const locals = new Map();
  fd.params.forEach((p, i) => locals.set(p, args[i]));
  const fenv = { node: env.node, inst: env.inst, locals, sim: env.sim, rng: env.rng, time: env.time, depth, origin: env.origin };
  try { execBlock(fd.body, fenv); }
  catch (e) { if (e instanceof ReturnSignal) return e.value; throw e; }
  return null;
}

function needType(v, pred, what, line) {
  if (!pred(v)) throw new RtError('Expected ' + what + ', found ' + typeName(v) + ' (' + fmt(v) + ')', line);
  return v;
}
const isNum = v => typeof v === 'number';
const isBool = v => typeof v === 'boolean';
const isSet = v => v instanceof VSet;

function elems(v, line) {
  if (v instanceof VSet) return v.sorted();
  if (v instanceof Tup) return v.items;
  if (v instanceof VMap) return v.sorted().map(e => e[0]);
  throw new RtError('Cannot iterate over a ' + typeName(v), line);
}

// env: { node, inst, locals(Map), sim }
function evalExpr(e, env) {
  const line = e.tok ? e.tok.line : 0;
  switch (e.e) {
    case 'lit': return e.v;
    case 'var': return lookup(e.name, env, line);
    case 'tuplit': return new Tup(e.items.map(x => evalExpr(x, env)));
    case 'setlit': return VSet.of(e.items.map(x => evalExpr(x, env)));
    case 'compr': {
      const s = evalExpr(e.set, env);
      const out = [];
      for (const x of elems(s, line)) {
        env.locals.set(e.var, x);
        if (needType(evalExpr(e.where, env), isBool, 'a boolean in the comprehension', line)) out.push(x);
      }
      env.locals.delete(e.var);
      return VSet.of(out);
    }
    case 'un': {
      const x = evalExpr(e.x, env);
      if (e.op === 'not') return !needType(x, isBool, 'a boolean', line);
      if (e.op === 'neg') return -needType(x, isNum, 'a number', line);
      if (e.op === 'card') {
        if (x instanceof VSet || x instanceof VMap) return x.size;
        if (x instanceof Tup) return x.items.length;
        if (typeof x === 'string') return x.length;
        throw new RtError('# does not apply to a ' + typeName(x), line);
      }
      break;
    }
    case 'bin': {
      if (e.op === 'and') {
        if (!needType(evalExpr(e.l, env), isBool, 'a boolean', line)) return false;
        return needType(evalExpr(e.r, env), isBool, 'a boolean', line);
      }
      if (e.op === 'or') {
        if (needType(evalExpr(e.l, env), isBool, 'a boolean', line)) return true;
        return needType(evalExpr(e.r, env), isBool, 'a boolean', line);
      }
      const a = evalExpr(e.l, env), b = evalExpr(e.r, env);
      return binop(e.op, a, b, line);
    }
    case 'index': {
      const x = evalExpr(e.x, env), i = evalExpr(e.i, env);
      if (x instanceof Tup) {
        needType(i, isNum, 'a numeric index', line);
        if (i < 0 || i >= x.items.length || i !== Math.floor(i)) throw new RtError('Index ' + i + ' is out of range for tuple ' + fmt(x), line);
        return x.items[i];
      }
      if (x instanceof VMap) { const en = x.m.get(key(i)); return en ? en[1] : null; }
      throw new RtError('Cannot index a ' + typeName(x), line);
    }
    case 'call': {
      const fd = env.inst.algo.funcs && env.inst.algo.funcs.get(e.name);
      const args = e.args.map(a => evalExpr(a, env));
      return fd ? callUser(fd, args, env, line) : callBuiltin(e.name, args, env, line);
    }
  }
  throw new RtError('Unsupported expression', line);
}

function binop(op, a, b, line) {
  switch (op) {
    case '=': return eq(a, b);
    case '!=': return !eq(a, b);
    case '<': return compare(a, b) < 0;
    case '>': return compare(a, b) > 0;
    case '<=': return compare(a, b) <= 0;
    case '>=': return compare(a, b) >= 0;
    case 'in':
      if (b instanceof VSet) return b.m.has(key(a));
      if (b instanceof VMap) return b.m.has(key(a));
      if (b instanceof Tup) return b.items.some(x => eq(x, a));
      throw new RtError('"in" requires a set, a tuple or a map, found ' + typeName(b), line);
    case 'notin': return !binop('in', a, b, line);
    case 'subseteq':
      needType(a, isSet, 'a set', line); needType(b, isSet, 'a set', line);
      for (const k of a.m.keys()) if (!b.m.has(k)) return false;
      return true;
    case 'union': {
      needType(a, isSet, 'a set on the left of ∪', line); needType(b, isSet, 'a set on the right of ∪', line);
      if (b.size === 0) return a;
      const m = new Map(a.m); for (const [k, v] of b.m) m.set(k, v); return new VSet(m);
    }
    case 'inter': {
      needType(a, isSet, 'a set', line); needType(b, isSet, 'a set', line);
      const m = new Map(); for (const [k, v] of a.m) if (b.m.has(k)) m.set(k, v); return new VSet(m);
    }
    case 'minus': {
      needType(a, isSet, 'a set', line); needType(b, isSet, 'a set', line);
      const m = new Map(); for (const [k, v] of a.m) if (!b.m.has(k)) m.set(k, v); return new VSet(m);
    }
    case '+':
      if (isNum(a) && isNum(b)) return a + b;
      if (typeof a === 'string' || typeof b === 'string') return (typeof a === 'string' ? a : fmt(a)) + (typeof b === 'string' ? b : fmt(b));
      if (a instanceof Tup && b instanceof Tup) return new Tup(a.items.concat(b.items));
      throw new RtError('"+" does not apply to ' + typeName(a) + ' and ' + typeName(b), line);
    case '-': case '*': case '/': case '%':
      needType(a, isNum, 'a number', line); needType(b, isNum, 'a number', line);
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (b === 0) throw new RtError('Division by zero', line);
      if (op === '/') return Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b;
      return a % b;
  }
  throw new RtError('Unknown operator ' + op, line);
}

function lookup(name, env, line) {
  if (env.locals.has(name)) return env.locals.get(name);
  const inst = env.inst;
  if (name in inst.state) return inst.state[name];
  if (name in inst.params) return inst.params[name];
  const sim = env.sim, node = env.node;
  switch (name) {
    case 'self': return node.id;
    case 'Procs': return sim.procSet;
    case 'N': return sim.nodes.length;
    case 'neighbors': return node.neighborSet;
    case 'DELTA': case 'PHI': case 'RHO': return sim.known[name];
    case 'round': return node.round;
  }
  if (isAtomName(name)) return atom(name);
  if (env.assignedLocals && env.assignedLocals.has(name))
    throw new RtError('Local variable "' + name + '" read before assignment', line);
  throw new RtError('Variable "' + name + '" is not defined', line);
}

function seqOf(a, name, line) {
  if (a instanceof Tup) return a.items;
  if (a instanceof VSet) return a.sorted();
  throw new RtError(name + ' requires a tuple or a set, found ' + typeName(a), line);
}
function callBuiltin(name, args, env, line) {
  const a = args[0];
  switch (name) {
    case 'min': case 'max': {
      const xs = elems(a, line);
      if (!xs.length) throw new RtError(name + ' of an empty set', line);
      let best = xs[0];
      for (const x of xs) if (name === 'min' ? compare(x, best) < 0 : compare(x, best) > 0) best = x;
      return best;
    }
    case 'choose': {
      const xs = elems(a, line);
      if (!xs.length) throw new RtError('choose of an empty set', line);
      return xs[0];
    }
    case 'size':
      if (a instanceof VSet || a instanceof VMap) return a.size;
      if (a instanceof Tup) return a.items.length;
      if (typeof a === 'string') return a.length;
      throw new RtError('size does not apply to a ' + typeName(a), line);
    case 'keys': needType(a, v => v instanceof VMap, 'a map', line); return VSet.of(a.sorted().map(e => e[0]));
    case 'values': needType(a, v => v instanceof VMap, 'a map', line); return VSet.of(a.sorted().map(e => e[1]));
    case 'map': return new VMap();
    case 'random': {
      needType(args[0], isNum, 'a number', line); needType(args[1], isNum, 'a number', line);
      return env.rng.int(Math.ceil(args[0]), Math.floor(args[1]));
    }
    case 'now': return env.sim.localClock(env.node, env.time);
    case 'abs': return Math.abs(needType(a, isNum, 'a number', line));
    case 'append': needType(a, v => v instanceof Tup, 'a tuple', line); return new Tup(a.items.concat([args[1]]));
    case 'toset': return VSet.of(elems(a, line));
    case 'str': return typeof a === 'string' ? a : fmt(a);
    case 'head': case 'last': {
      const xs = seqOf(a, name, line);
      if (!xs.length) throw new RtError(name + ' of an empty ' + typeName(a), line);
      return name === 'head' ? xs[0] : xs[xs.length - 1];
    }
    case 'tail': return new Tup(seqOf(a, name, line).slice(1));
    case 'sort': return new Tup(elems(a, line).slice().sort(compare));
    case 'reverse': return new Tup(seqOf(a, name, line).slice().reverse());
    case 'slice': {
      needType(args[1], isNum, 'a number', line); needType(args[2], isNum, 'a number', line);
      return new Tup(seqOf(a, name, line).slice(args[1], args[2]));
    }
    case 'range': {
      needType(args[0], isNum, 'a number', line); needType(args[1], isNum, 'a number', line);
      if (args[1] - args[0] > 100000) throw new RtError('range is too large', line);
      const out = [];
      for (let i = Math.ceil(args[0]); i < args[1]; i++) out.push(i);
      return new Tup(out);
    }
    case 'remove': {
      const x = args[1];
      if (a instanceof VSet) { const m = new Map(a.m); m.delete(key(x)); return new VSet(m); }
      if (a instanceof VMap) { const m = new Map(a.m); m.delete(key(x)); return new VMap(m); }
      if (a instanceof Tup) { const i = a.items.findIndex(v => eq(v, x)); return i < 0 ? a : new Tup(a.items.slice(0, i).concat(a.items.slice(i + 1))); }
      throw new RtError('remove does not apply to a ' + typeName(a), line);
    }
    case 'get': {
      if (a instanceof VMap) { const en = a.m.get(key(args[1])); return en ? en[1] : args[2]; }
      if (a instanceof Tup) { const i = args[1]; return (isNum(i) && i >= 0 && i < a.items.length) ? a.items[i] : args[2]; }
      if (a === null) return args[2];
      throw new RtError('get does not apply to a ' + typeName(a), line);
    }
    case 'sum': case 'mean': {
      const xs = a instanceof VMap ? a.sorted().map(e => e[1]) : elems(a, line);
      let t = 0;
      for (const x of xs) t += needType(x, isNum, 'numbers in ' + name, line);
      if (name === 'sum') return t;
      if (!xs.length) throw new RtError('mean of an empty collection', line);
      return t / xs.length;
    }
    case 'argmin': case 'argmax': {
      needType(a, v => v instanceof VMap, 'a map', line);
      const es = a.sorted();
      if (!es.length) throw new RtError(name + ' of an empty map', line);
      let best = es[0];
      for (const e of es) if (name === 'argmin' ? compare(e[1], best[1]) < 0 : compare(e[1], best[1]) > 0) best = e;
      return best[0];
    }
    case 'pick': {
      const xs = elems(a, line);
      if (!xs.length) throw new RtError('pick of an empty collection', line);
      return xs[Math.floor(env.rng.next() * xs.length)];
    }
    case 'sqrt': case 'ln': case 'exp': case 'floor': case 'ceil': case 'round': {
      const x = needType(a, isNum, 'a number', line);
      if (name === 'sqrt') { if (x < 0) throw new RtError('sqrt of a negative number', line); return Math.sqrt(x); }
      if (name === 'ln') { if (x <= 0) throw new RtError('ln of a number ≤ 0', line); return Math.log(x); }
      return Math[name](x);
    }
    case 'pow': return Math.pow(needType(a, isNum, 'a number', line), needType(args[1], isNum, 'a number', line));
  }
  throw new RtError('Unknown function ' + name, line);
}

function matchPat(p, v, env, binds) {
  switch (p.k) {
    case 'wild': return true;
    case 'lit': return eq(p.value, v);
    case 'timer': return v === p.name;
    case 'id': {
      if (binds.has(p.name)) {
        if (env.locals.has(p.name)) return eq(env.locals.get(p.name), v);
        env.locals.set(p.name, v); return true;
      }
      return eq(lookup(p.name, env, p.tok.line), v);
    }
    case 'tup':
      if (!(v instanceof Tup) || v.items.length !== p.items.length) return false;
      for (let i = 0; i < p.items.length; i++) if (!matchPat(p.items[i], v.items[i], env, binds)) return false;
      return true;
  }
  return false;
}

function assignIdx(base, idx, val, line) {
  if (!idx.length) return val;
  const [i, ...rest] = idx;
  if (base instanceof VMap) {
    const cur = base.m.get(key(i));
    const nv = assignIdx(cur ? cur[1] : null, rest, val, line);
    const m = new Map(base.m); m.set(key(i), [i, nv]); return new VMap(m);
  }
  if (base instanceof Tup) {
    needType(i, isNum, 'a numeric index', line);
    if (i < 0 || i >= base.items.length) throw new RtError('Index ' + i + ' is out of range for the tuple', line);
    const items = base.items.slice(); items[i] = assignIdx(items[i], rest, val, line);
    return new Tup(items);
  }
  if (base === null && rest.length === 0) {
    const m = new Map(); m.set(key(i), [i, val]); return new VMap(m);
  }
  throw new RtError('Indexed assignment on a ' + typeName(base), line);
}

const LOOP_CAP = 100000;
function execBlock(stmts, env) {
  for (const s of stmts) {
    env.sim.stepBudget--;
    if (env.sim.stepBudget < 0) throw new RtError('Too many statements in a single step (infinite loop?)', s.line);
    switch (s.s) {
      case 'assign': {
        const v = evalExpr(s.expr, env);
        const inst = env.inst;
        if (s.name in inst.state) {
          inst.state[s.name] = s.idx.length ? assignIdx(inst.state[s.name], s.idx.map(x => evalExpr(x, env)), v, s.line) : v;
          inst.dirty = true;
        } else {
          const cur = env.locals.has(s.name) ? env.locals.get(s.name) : null;
          env.locals.set(s.name, s.idx.length ? assignIdx(cur, s.idx.map(x => evalExpr(x, env)), v, s.line) : v);
        }
        break;
      }
      case 'trigger':
        env.sim.emit(env, s.inst, s.ev, s.args.map(x => evalExpr(x, env)), s.line);
        break;
      case 'if': {
        let done = false;
        for (const b of s.branches) {
          if (needType(evalExpr(b.cond, env), isBool, 'a boolean in the condition', s.line)) { execBlock(b.body, env); done = true; break; }
        }
        if (!done && s.els) execBlock(s.els, env);
        break;
      }
      case 'forall': {
        const xs = elems(evalExpr(s.set, env), s.line);
        const had = env.locals.has(s.var), old = env.locals.get(s.var);
        for (const x of xs) {
          env.locals.set(s.var, x);
          if (s.where && !needType(evalExpr(s.where, env), isBool, 'a boolean', s.line)) continue;
          execBlock(s.body, env);
        }
        if (had) env.locals.set(s.var, old); else env.locals.delete(s.var);
        break;
      }
      case 'while': {
        let k = 0;
        while (needType(evalExpr(s.cond, env), isBool, 'a boolean', s.line)) {
          if (++k > LOOP_CAP) throw new RtError('while loop exceeded ' + LOOP_CAP + ' iterations', s.line);
          execBlock(s.body, env);
        }
        break;
      }
      case 'starttimer': {
        const d = needType(evalExpr(s.dur, env), isNum, 'a duration', s.line);
        if (d < 0) throw new RtError('Negative timer duration', s.line);
        env.sim.startTimer(env, s.id, d);
        break;
      }
      case 'canceltimer': env.sim.cancelTimer(env, s.id); break;
      case 'assert': {
        const ok = needType(evalExpr(s.expr, env), isBool, 'a boolean', s.line);
        if (!ok) {
          const msg = s.msg ? evalExpr(s.msg, env) : 'assertion failed';
          env.sim.assertFail(env, typeof msg === 'string' ? msg : fmt(msg), s.line);
        }
        break;
      }
      case 'log':
        env.sim.userLog(env, s.args.map(x => { const v = evalExpr(x, env); return typeof v === 'string' ? v : fmt(v); }).join(' '), s.line);
        break;
      case 'skip': break;
      case 'return': throw new ReturnSignal(s.expr ? evalExpr(s.expr, env) : null);
      case 'call': callUser(env.inst.algo.funcs.get(s.name), s.args.map(x => evalExpr(x, env)), env, s.line); break;
    }
  }
}

// ============================================================
// Priority queue
// ============================================================
class Heap {
  constructor(cmp) { this.a = []; this.cmp = cmp; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(a[i], a[p]) >= 0) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

// ============================================================
// Simulation engine
// ============================================================
const CLS = { crash: 0, input: 1, roundStart: 2, deliver: 3, timer: 3, roundEnd: 4 };
const MAX_EVENTS = 150000;

function runSimulation(scn) {
  const out = {
    ok: false, error: null, errorLine: 0, compile: null, msgs: [], log: [], outputs: [],
    snaps: {}, endT: 0, violations: 0, stopReason: '', nodeInfo: {},
    rounds: null, specs: [], warnings: [], handlerCount: 0, activity: [], localEvents: [], localTruncated: false, downs: {}, netFaults: { links: [], partitions: [] }
  };
  // ---- configuration ----
  let cfg;
  try { cfg = normalizeScenario(scn); }
  catch (e) { out.error = e.message; return out; }

  // ---- compilation ----
  let prog;
  try { prog = parseProgram(scn.code); }
  catch (e) {
    if (e instanceof DslError) { out.compile = { errors: [{ msg: e.message, line: e.line, col: e.col }], warnings: [] }; out.error = 'Syntax error'; out.errorLine = e.line; return out; }
    throw e;
  }
  const chk = check(prog, { timing: cfg.timing, roundMode: cfg.roundMode, known: cfg.known });
  out.compile = { errors: chk.errors, warnings: chk.warnings, algorithms: prog.algorithms.map(a => a.name) };
  if (chk.errors.length) { out.error = 'The code contains errors'; out.errorLine = chk.errors[0].line; return out; }
  if (!prog.algorithms.length) { out.error = 'No algorithm is defined'; return out; }
  const topName = scn.top && prog.algorithms.some(a => a.name === scn.top) ? scn.top : prog.algorithms[0].name;
  out.top = topName;
  let stack;
  try { stack = resolveStack(prog, topName); }
  catch (e) { out.error = e.message; return out; }
  out.warnings.push(...stack.warnings);
  out.specs = stack.specs.map(s => ({
    id: s.id, path: s.path, algo: s.algo.name, iface: s.algo.implType, alias: s.algo.implAlias,
    parent: s.parent, aliasInParent: s.aliasInParent, depth: s.path.split('/').length - 1,
    builtins: Object.keys(s.bind).filter(k => s.bind[k].builtin).map(k => s.bind[k].builtin)
  }));
  const topSpec = stack.specs[0];
  const topIface = chk.ifaces.get(topSpec.algo.implType);

  const streams = new Streams(cfg.seed);
  const nodes = cfg.nodes.map((n, idx) => ({
    id: n.id, idx, crashed: false, busyUntil: 0, round: 0, insts: [], out: new Set(),
    neighborSet: null, offset: 0, rho: 0
  }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const linkMap = new Map(); // "a>b" -> link cfg
  for (const l of cfg.links) {
    if (!byId.has(l.a) || !byId.has(l.b)) continue;
    const info = { enabled: l.enabled, loss: l.loss, delay: l.delay, key: l.a + '>' + l.b };
    linkMap.set(l.a + '>' + l.b, info);
    if (!l.directed) linkMap.set(l.b + '>' + l.a, Object.assign({}, info, { key: l.b + '>' + l.a }));
  }
  for (const n of nodes) {
    const out2 = [];
    for (const m of nodes) if (m !== n && linkMap.has(n.id + '>' + m.id)) out2.push(m.id);
    n.neighborSet = VSet.of(out2);
    const cr = streams.get('clock:' + n.id);
    n.offset = Math.round(sampleDist(cfg.offset, cr));
    n.rho = sampleDist(cfg.rho, cr);
    if (n.rho <= -0.5) n.rho = -0.5;
    out.nodeInfo[n.id] = { offset: n.offset, rho: n.rho };
    out.snaps[n.id] = [];
  }

  const sim = {
    nodes, procSet: VSet.of(nodes.map(n => n.id)), known: cfg.known, stepBudget: 0,
    localClock(node, t) { return Math.round(node.offset + (1 + node.rho) * t); }
  };

  let seq = 0;
  const tieRng = streams.get('tiebreak');
  const heap = new Heap((x, y) =>
    (x.t - y.t) || (x.cls - y.cls) || (x.tb - y.tb) || (x.node - y.node) || (x.seq - y.seq));
  const push = (ev) => {
    ev.seq = ev.seq !== undefined ? ev.seq : seq++;
    ev.tb = cfg.tieBreak === 'shuffle' ? (ev.tb !== undefined ? ev.tb : tieRng.u32()) : 0;
    heap.push(ev);
  };
  const logE = (t, node, kind, text, line) => out.log.push({ t, node, kind, text, line: line || 0 });

  let halted = null;
  let msgSeq = 0;
  const lockstep = cfg.timing === 'synchronous-rounds' && cfg.roundMode === 'lockstep';
  const emulated = cfg.timing === 'synchronous-rounds' && cfg.roundMode === 'emulated';
  const R = cfg.timing === 'synchronous-rounds'
    ? (lockstep ? cfg.roundLen : (cfg.known.DELTA || 0) + (cfg.known.PHI || 0))
    : 0;
  if (emulated && !(R > 0)) { out.error = 'Emulated rounds need known DELTA and PHI in the assumed model (round length = DELTA + PHI)'; return out; }
  if (cfg.timing === 'synchronous-rounds') out.rounds = { R, lockstep, starts: {} };

  const l2g = (node, L) => Math.max(0, Math.round((L - node.offset) / (1 + node.rho)));
  const roundStartG = (node, r) => lockstep ? (r - 1) * R : l2g(node, r * R);
  const roundEndG = (node, r) => lockstep ? (r - 1) * R + Math.round(R * 0.9) : l2g(node, (r + 1) * R) - 1;

  // ---- instances ----
  const unhandledSeen = new Set();
  function makeInst(node, spec) {
    const inst = { spec, algo: spec.algo, params: {}, state: {}, timers: {}, dirty: true, rr: 0 };
    const env = { node, inst, locals: new Map(), sim, rng: streams.get('node:' + node.id), time: 0 };
    for (const p of spec.algo.params) {
      const ov = cfg.paramOverrides[spec.algo.name + '.' + p.name];
      inst.params[p.name] = ov !== undefined ? ov : evalExpr(p.expr, env);
    }
    for (const s of spec.algo.state) inst.state[s.name] = evalExpr(s.expr, env);
    return inst;
  }

  // local queue for events internal to a node
  let localQ = [];
  let curTime = 0;
  let curEnd = 0;

  const LOCAL_MAX = 200000;
  const trace = (node, from, to, ev, args) => {
    if (out.localEvents.length >= LOCAL_MAX) { out.localTruncated = true; return; }
    let a = args.map(fmt).join(', ');
    if (a.length > 80) a = a.slice(0, 79) + '…';
    out.localEvents.push({ t: curEnd, node: node.id, from, to, ev, args: a });
  };
  sim.emit = function (env, alias, ev, args, line) {
    const inst = env.inst, node = env.node, spec = inst.spec;
    if (alias === spec.algo.implAlias) {
      // indication going up
      trace(node, spec.id, spec.parent === null ? 'app' : spec.parent, ev, args);
      if (spec.parent === null) {
        const text = ev + (args.length ? ' | ' + args.map(fmt).join(', ') : '');
        out.outputs.push({ t: curEnd, node: node.id, ev, args: args.map(fmt), text });
        logE(curEnd, node.id, 'output', text, line);
      } else {
        localQ.push({ inst: spec.parent, alias: spec.aliasInParent, ev, args, from: spec.id });
      }
      return;
    }
    const b = spec.bind[alias];
    if (b.inst !== undefined) {
      trace(node, spec.id, b.inst, ev, args);
      localQ.push({ inst: b.inst, alias: stack.specs[b.inst].algo.implAlias, ev, args, origin: env.origin !== undefined ? env.origin : spec.id });
      return;
    }
    trace(node, spec.id, 'net', ev, args);
    // built-in module: network send
    const q = args[0];
    netSend(node, q, args[1], spec.id, alias, line, env.origin !== undefined ? env.origin : spec.id);
  };
  let timerSeq = 0;
  sim.startTimer = function (env, id, d) {
    const inst = env.inst, node = env.node;
    const gen = ++timerSeq;
    inst.timers[id] = gen;
    const g = Math.max(1, Math.round(d / (1 + node.rho)));
    push({ t: curEnd + g, cls: CLS.timer, node: node.idx, type: 'timer', inst: inst.spec.id, id, gen });
  };
  sim.cancelTimer = function (env, id) { env.inst.timers[id] = ++timerSeq; };
  sim.assertFail = function (env, msg, line) {
    logE(curEnd, env.node.id, 'assert', msg, line);
    if (cfg.haltOnAssert) throw new HaltSignal('Assertion failed on p' + env.node.id + ': ' + msg);
  };
  sim.userLog = function (env, text, line) { logE(curEnd, env.node.id, 'log', text, line); };

  function violation(t, nodeId, text) {
    out.violations++;
    logE(t, nodeId, 'violation', text);
  }

  function netSend(node, q, payload, specId, alias, line, origin) {
    const ts = curEnd;
    const id = msgSeq++;
    const rec = { id, from: node.id, to: q, payload: fmt(payload), sendT: ts, recvT: null, status: 'pending', violation: false, dup: false, round: null, spec: specId, origin };
    out.msgs.push(rec);
    if (!byId.has(q)) {
      rec.status = 'dropped-link'; rec.recvT = ts;
      logE(ts, node.id, 'drop', 'recipient ' + fmt(q) + ' does not exist', line);
      return;
    }
    const self = q === node.id;
    const lk = self ? null : linkMap.get(node.id + '>' + q);
    if (!self && (!lk || !lk.enabled)) {
      rec.status = 'dropped-link'; rec.recvT = ts;
      logE(ts, node.id, 'drop', 'no link to p' + q + (lk ? ' (link disabled)' : ''), line);
      return;
    }
    const rng = streams.get('link:' + node.id + '>' + q);
    const loss = lk && lk.loss !== null ? lk.loss : cfg.loss;
    const lost = !self && rng.next() < loss;
    const sampleDelay = () => {
      if (self) return 0;
      let dist = lk && lk.delay ? lk.delay : cfg.delay;
      if (cfg.gst !== null && ts < cfg.gst && cfg.preGstDelay) dist = cfg.preGstDelay;
      let d = sampleDist(dist, rng);
      if (cfg.spikeProb > 0 && rng.next() < cfg.spikeProb) d += cfg.spikeExtra;
      if (cfg.bound !== null && !(cfg.gst !== null && ts < cfg.gst)) d = Math.min(d, cfg.bound);
      // DLS model: messages sent before GST arrive by GST + bound
      if (cfg.bound !== null && cfg.gst !== null && ts < cfg.gst) d = Math.min(d, cfg.gst + cfg.bound - ts);
      return Math.max(0, Math.round(d));
    };

    if (cfg.timing === 'synchronous-rounds') {
      const r = node.round;
      rec.round = r;
      if (lockstep) {
        const Ts = (r - 1) * R;
        let rr = r;
        if (ts >= Ts + Math.round(R * 0.2)) rr = r + 1; // sent after the delivery window opened
        const off = self ? Math.round(R * 0.25) : Math.round(R * (0.25 + 0.5 * rng.next()));
        const arr = (rr - 1) * R + off;
        if (lost) { rec.status = 'dropped-loss'; rec.recvT = arr; logE(ts, node.id, 'drop', 'message to p' + q + ' lost (omission)', line); return; }
        if (cutDrop(rec, node.id, q, ts, arr, line)) return;
        scheduleDeliver(rec, node, q, payload, arr, alias);
        return;
      }
      // emulated
      const qn = byId.get(q);
      let arr = ts + sampleDelay();
      if (lost) { rec.status = 'dropped-loss'; rec.recvT = arr; logE(ts, node.id, 'drop', 'message to p' + q + ' lost', line); return; }
      if (cutDrop(rec, node.id, q, ts, arr, line)) return;
      const qs = roundStartG(qn, r), qe = roundEndG(qn, r);
      if (arr < qs) arr = qs; // the recipient has not opened the round yet: the message waits
      if (arr > qe) {
        rec.violation = true;
        violation(arr, q, 'round ' + r + ' message from p' + node.id + ' arrived after the round ended on p' + q +
          ' (delay ' + fmtDuration(arr - ts) + ')');
        if (cfg.policy === 'drop') { rec.status = 'dropped-late'; rec.recvT = arr; return; }
        if (cfg.policy === 'halt') { rec.status = 'dropped-late'; rec.recvT = arr; halted = 'Timing violation (policy: halt)'; return; }
      }
      scheduleDeliver(rec, node, q, payload, arr, alias);
      return;
    }

    const d = sampleDelay();
    // drawn for every message, so that the random stream of the channel does not depend on the fate of the message
    const dupDraw = (!self && cfg.dup > 0) ? rng.next() : 1;
    const arr0 = ts + d;
    if (lost) { rec.status = 'dropped-loss'; rec.recvT = arr0; logE(ts, node.id, 'drop', 'message to p' + q + ' lost', line); return; }
    // The order below keeps everything that happens before a fault independent of that fault:
    // a cut at send time only concerns messages sent after the fault starts; FIFO state is updated by every
    // message that enters the channel, including those a fault will drop on arrival.
    if (cutAtSend(rec, node.id, q, ts, line)) return;
    const assumeBound = cfg.known.DELTA !== null &&
      (cfg.timing === 'synchronous-timed' || (cfg.timing === 'partial' && cfg.gst !== null && ts >= cfg.gst) ||
       (cfg.timing === 'partial' && cfg.gst === null));
    if (assumeBound && d > cfg.known.DELTA) {
      rec.violation = true;
      violation(arr0, q, 'delay ' + fmtDuration(d) + ' exceeds DELTA = ' + fmtDuration(cfg.known.DELTA) + ' (p' + node.id + ' → p' + q + ')');
      if (cfg.policy === 'drop') { rec.status = 'dropped-late'; rec.recvT = arr0; return; }
      if (cfg.policy === 'halt') { rec.status = 'dropped-late'; rec.recvT = arr0; halted = 'Timing violation (policy: halt)'; return; }
    }
    let arr = arr0;
    const fifoKey = node.id + '>' + q;
    if (cfg.fifo) { arr = Math.max(arr, fifoLast.get(fifoKey) || 0); fifoLast.set(fifoKey, arr); }
    if (!cutAtArrival(rec, node.id, q, arr)) scheduleDeliver(rec, node, q, payload, arr, alias);
    if (dupDraw < cfg.dup) {
      const d2 = sampleDelay();
      let arr2 = ts + d2;
      if (cfg.fifo) { arr2 = Math.max(arr2, fifoLast.get(fifoKey) || 0); fifoLast.set(fifoKey, arr2); }
      const rec2 = Object.assign({}, rec, { id: msgSeq++, dup: true, violation: false, status: 'pending', recvT: null });
      out.msgs.push(rec2);
      if (!cutAtArrival(rec2, node.id, q, arr2)) scheduleDeliver(rec2, node, q, payload, arr2, alias);
    }
  }
  const fifoLast = new Map();

  const linkCuts = cfg.faults.filter(f => f.type === 'link');
  const partitions = cfg.faults.filter(f => f.type === 'partition').map(p => {
    const groupOf = new Map();
    p.groups.forEach((g, i) => g.forEach(id => groupOf.set(id, i)));
    return Object.assign({}, p, { groupOf });
  });
  out.netFaults = {
    links: linkCuts.map(l => ({ a: l.a, b: l.b, from: l.from, to: l.to })),
    partitions: partitions.map(p => ({ groups: p.groups, from: p.from, to: p.to }))
  };
  // is the channel between a and b interrupted at time t? (processes not listed in a partition form one more group)
  function cutAt(a, b, t) {
    for (const l of linkCuts)
      if (((l.a === a && l.b === b) || (l.a === b && l.b === a)) && t >= l.from && (l.to === null || t < l.to)) return 'link down';
    for (const p of partitions) {
      if (t < p.from || (p.to !== null && t >= p.to)) continue;
      const ga = p.groupOf.has(a) ? p.groupOf.get(a) : -1;
      const gb = p.groupOf.has(b) ? p.groupOf.get(b) : -1;
      if (ga !== gb) return 'network partition';
    }
    return null;
  }
  // drops a message sent into an interrupted channel
  function cutAtSend(rec, from, q, ts, line) {
    if (from === q || (!linkCuts.length && !partitions.length)) return false;
    const why = cutAt(from, q, ts);
    if (!why) return false;
    rec.status = 'dropped-cut'; rec.recvT = ts;
    logE(ts, from, 'drop', 'message to p' + q + ' dropped: ' + why, line);
    return true;
  }
  // drops a message whose channel is interrupted when it arrives
  function cutAtArrival(rec, from, q, arr) {
    if (from === q || (!linkCuts.length && !partitions.length)) return false;
    const why = cutAt(from, q, arr);
    if (!why) return false;
    rec.status = 'dropped-cut'; rec.recvT = arr;
    logE(arr, q, 'drop', 'message from p' + from + ' dropped in transit: ' + why);
    return true;
  }
  function cutDrop(rec, from, q, ts, arr, line) {
    return cutAtSend(rec, from, q, ts, line) || cutAtArrival(rec, from, q, arr);
  }

  function scheduleDeliver(rec, node, q, payload, arr, alias) {
    rec.recvT = arr;
    push({ t: arr, cls: CLS.deliver, node: byId.get(q).idx, type: 'deliver', rec, from: node.id, payload, alias });
  }

  // dispatch an event to an instance
  // origin: the module that started the chain of requests this event belongs to. A module handling a
  // request from above keeps the origin; one reacting to an indication, a timer or an input starts its own.
  function dispatch(node, specId, alias, ev, args, origin) {
    const inst = node.insts[specId];
    const algo = inst.algo;
    const fromAbove = alias === algo.implAlias && ev !== 'Init' && ev !== 'Recovery' && origin !== undefined;
    const org = fromAbove ? origin : specId;
    let handled = false;
    for (const h of algo.handlers) {
      if (h.kind !== 'event' || h.inst !== alias || h.ev !== ev) continue;
      const env = { node, inst, locals: new Map(), sim, rng: streams.get('node:' + node.id), time: curTime, origin: org };
      let ok = true;
      for (let i = 0; i < h.pats.length && ok; i++) ok = matchPat(h.pats[i], args[i], env, h.binds);
      if (!ok) continue;
      if (h.where) {
        try {
          const w = evalExpr(h.where, env);
          if (w !== true) { if (w !== false) throw new RtError('The "where" clause must be boolean', h.line); continue; }
        } catch (e) { throw e; }
      }
      out.handlerCount++;
      execBlock(h.body, env);
      handled = true;
      break;
    }
    if (!handled && ev !== 'Init' && ev !== 'Recovery' && ev !== 'RoundStart' && ev !== 'RoundEnd') {
      const k = node.id + ':' + specId + ':' + alias + '.' + ev;
      if (!unhandledSeen.has(k)) {
        unhandledSeen.add(k);
        logE(curTime, node.id, 'warn', 'event ⟨' + alias + ', ' + ev + (args.length ? ' | ' + args.map(fmt).join(', ') : '') +
          '⟩ has no handler in ' + algo.name + ' (shown once)');
      }
    }
  }

  function drain(node) {
    let guard = 0;
    for (;;) {
      while (localQ.length) {
        if (++guard > 20000) throw new RtError('Too many internal events in a single step', 0);
        const e = localQ.shift();
        dispatch(node, e.inst, e.alias, e.ev, e.args, e.origin);
      }
      // guards
      let fired = false;
      for (const inst of node.insts) {
        const hs = inst.algo.handlers;
        const gs = hs.filter(h => h.kind !== 'event');
        if (!gs.length) continue;
        for (let k = 0; k < gs.length; k++) {
          const h = gs[(inst.rr + k) % gs.length];
          const env = { node, inst, locals: new Map(), sim, rng: streams.get('node:' + node.id), time: curTime };
          let en = false;
          if (h.kind === 'cond') {
            en = needType(evalExpr(h.expr, env), isBool, 'a boolean in the guard', h.line);
          } else {
            for (const x of elems(evalExpr(h.set, env), h.line)) {
              env.locals.set(h.var, x);
              if (needType(evalExpr(h.where, env), isBool, 'a boolean', h.line)) { en = true; break; }
            }
          }
          if (en) {
            inst.rr = (inst.rr + k + 1) % gs.length;
            if (++guard > 20000) throw new RtError('A guard stays true forever: its handler must make it false', h.line);
            execBlock(h.body, env);
            fired = true;
            break;
          }
        }
        if (fired) break;
      }
      if (!fired && !localQ.length) break;
    }
  }

  function snapshot(node, t) {
    const states = {};
    let changed = false;
    for (const inst of node.insts) { if (inst.dirty) changed = true; inst.dirty = false; states[inst.spec.path] = Object.assign({}, inst.state); }
    const arr = out.snaps[node.id];
    if (changed || !arr.length || arr[arr.length - 1].round !== node.round) arr.push({ t, states, round: node.round });
  }

  // ---- initialization ----
  try {
    for (const n of nodes) {
      n.insts = stack.specs.map(s => makeInst(n, s));
      if (cfg.known.RHO !== null && Math.abs(n.rho) > cfg.known.RHO)
        violation(0, n.id, 'clock drift ' + n.rho.toExponential(2) + ' exceeds RHO = ' + cfg.known.RHO);
    }
  } catch (e) {
    if (e instanceof RtError) { out.error = 'Initialization error: ' + e.message; out.errorLine = e.line; return out; }
    throw e;
  }
  for (const n of nodes) {
    // Init from the bottom up
    push({ t: 0, cls: CLS.input - 0.5, node: n.idx, type: 'init' });
  }
  const groupsText = g => g.map(x => '{' + x.map(id => 'p' + id).join(', ') + '}').join(' | ');
  for (const f of cfg.faults) {
    if (f.type === 'crash' || f.type === 'recover') {
      const n = byId.get(f.node);
      if (!n) { out.warnings.push('Fault on missing process p' + f.node); continue; }
      push({ t: f.at, cls: CLS.crash, node: n.idx, type: f.type });
    } else if (f.type === 'link') {
      if (!byId.has(f.a) || !byId.has(f.b)) { out.warnings.push('Link fault on missing process p' + f.a + ' or p' + f.b); continue; }
      push({ t: f.from, cls: CLS.crash, node: 0, type: 'netlog', text: 'link p' + f.a + '–p' + f.b + ' goes down' });
      if (f.to !== null) push({ t: f.to, cls: CLS.crash, node: 0, type: 'netlog', text: 'link p' + f.a + '–p' + f.b + ' is back up' });
    } else if (f.type === 'partition') {
      const missing = f.groups.flat().filter(id => !byId.has(id));
      if (missing.length) out.warnings.push('Partition lists missing processes: ' + missing.map(id => 'p' + id).join(', '));
      const listed = new Set(f.groups.flat());
      const rest = nodes.filter(n => !listed.has(n.id)).map(n => n.id);
      const shown = rest.length ? f.groups.concat([rest]) : f.groups;
      push({ t: f.from, cls: CLS.crash, node: 0, type: 'netlog', text: 'network partition: ' + groupsText(shown) });
      if (f.to !== null) push({ t: f.to, cls: CLS.crash, node: 0, type: 'netlog', text: 'partition healed: ' + groupsText(shown) });
    }
  }
  for (const inp of cfg.inputs) {
    const targets = inp.node === '*' ? nodes : [byId.get(inp.node)].filter(Boolean);
    if (!targets.length) { out.warnings.push('Input on line ' + inp.line + ': process p' + inp.node + ' does not exist'); continue; }
    if (!topIface.requests.has(inp.ev)) {
      out.error = 'Input on line ' + inp.line + ': "' + inp.ev + '" is not a request of ' + topIface.name +
        ' (available: ' + ([...topIface.requests.keys()].join(', ') || 'none') + ')';
      return out;
    }
    if (topIface.requests.get(inp.ev) !== inp.args.length) {
      out.error = 'Input on line ' + inp.line + ': "' + inp.ev + '" takes ' + topIface.requests.get(inp.ev) + ' argument(s)';
      return out;
    }
    for (const n of targets) push({ t: inp.at, cls: CLS.input, node: n.idx, type: 'input', inp });
  }
  if (cfg.timing === 'synchronous-rounds') {
    const maxR = Math.max(1, Math.floor(cfg.stopAt / R) + 1);
    for (const n of nodes) {
      out.rounds.starts[n.id] = [];
      for (let r = 1; r <= maxR; r++) {
        const s = roundStartG(n, r);
        if (s > cfg.stopAt) break;
        out.rounds.starts[n.id].push(s);
        push({ t: s, cls: CLS.roundStart, node: n.idx, type: 'roundStart', r });
        push({ t: roundEndG(n, r), cls: CLS.roundEnd, node: n.idx, type: 'roundEnd', r });
      }
    }
  }

  // restart a crashed process: volatile state and timers are reset, stable variables are kept,
  // and each instance receives Recovery if it handles it, Init otherwise (bottom-up)
  function recoverNode(node, t) {
    node.crashed = false;
    const d = out.downs[node.id];
    d[d.length - 1].to = t;
    node.busyUntil = t;
    curTime = t; curEnd = t; localQ = []; sim.stepBudget = 200000;
    for (const inst of node.insts) {
      const env = { node, inst, locals: new Map(), sim, rng: streams.get('node:' + node.id), time: t };
      for (const st of inst.algo.state) if (!st.stable) inst.state[st.name] = evalExpr(st.expr, env);
      inst.timers = {};
      inst.dirty = true;
    }
    logE(t, node.id, 'fault', 'p' + node.id + ' recovers (volatile state reset)');
    for (let i = stack.specs.length - 1; i >= 0; i--) {
      const a = stack.specs[i].algo;
      const hasRecovery = a.handlers.some(h => h.kind === 'event' && h.inst === a.implAlias && h.ev === 'Recovery');
      dispatch(node, i, a.implAlias, hasRecovery ? 'Recovery' : 'Init', []);
    }
    drain(node);
    snapshot(node, t);
    out.activity.push({ t, end: t, node: node.id, type: 'recover', msg: null });
  }

  // ---- main loop ----
  let count = 0;
  let curNode = nodes[0];
  const inputRng = streams.get('input');
  try {
    while (heap.size && !halted) {
      const ev = heap.pop();
      if (ev.t > cfg.stopAt) { out.stopReason = 'Time limit reached'; break; }
      if (++count > MAX_EVENTS) { out.stopReason = 'Limit of ' + MAX_EVENTS + ' events reached'; break; }
      const node = nodes[ev.node];
      curNode = node;
      out.endT = Math.max(out.endT, ev.t);
      if (ev.type === 'netlog') { logE(ev.t, null, 'fault', ev.text); continue; }
      if (ev.type === 'crash') {
        if (!node.crashed) {
          node.crashed = true;
          (out.downs[node.id] = out.downs[node.id] || []).push({ from: ev.t, to: null });
          logE(ev.t, node.id, 'fault', 'p' + node.id + ' crashes');
        }
        continue;
      }
      if (ev.type === 'recover') {
        if (!node.crashed) { logE(ev.t, node.id, 'warn', 'p' + node.id + ' is running: recovery ignored'); continue; }
        recoverNode(node, ev.t);
        continue;
      }
      // input arguments are evaluated once, when the input first comes up, whatever the state of the target,
      // so that the shared input stream gives every process the same values with or without faults
      if (ev.type === 'input' && ev.args === undefined) {
        const ienv = { node, inst: node.insts[0], locals: new Map(), sim, rng: inputRng, time: ev.t };
        ev.args = ev.inp.args.map(a => evalExpr(a, ienv));
      }
      if (node.crashed) {
        if (ev.type === 'deliver') { ev.rec.status = 'lost-crash'; }
        if (ev.type === 'input') logE(ev.t, node.id, 'warn', 'input ' + ev.inp.ev + ' ignored: p' + node.id + ' is down');
        continue;
      }
      if (ev.t < node.busyUntil) { ev.t = node.busyUntil; push(ev); continue; }
      if (ev.type === 'timer') {
        const inst = node.insts[ev.inst];
        if (inst.timers[ev.id] !== ev.gen) continue; // cancelled or restarted
      }
      const step = lockstep ? 0 : Math.max(0, Math.round(sampleDist(cfg.step, streams.get('step:' + node.id))));
      curTime = ev.t;
      curEnd = ev.t + step;
      if (cfg.known.PHI !== null && !lockstep && step > cfg.known.PHI)
        violation(ev.t, node.id, 'processing step of ' + fmtDuration(step) + ' exceeds PHI = ' + fmtDuration(cfg.known.PHI));
      sim.stepBudget = 200000;
      localQ = [];
      switch (ev.type) {
        case 'init':
          for (let i = stack.specs.length - 1; i >= 0; i--) dispatch(node, i, stack.specs[i].algo.implAlias, 'Init', []);
          break;
        case 'input': {
          const args = ev.args;
          logE(ev.t, node.id, 'input', ev.inp.ev + (args.length ? ' | ' + args.map(fmt).join(', ') : ''));
          trace(node, 'app', 0, ev.inp.ev, args);
          dispatch(node, 0, topSpec.algo.implAlias, ev.inp.ev, args);
          break;
        }
        case 'deliver': {
          ev.rec.status = 'delivered';
          // the sending instance receives under the same alias on the destination node
          trace(node, 'net', ev.rec.spec, 'Deliver', [ev.from, ev.payload]);
          dispatch(node, ev.rec.spec, ev.alias, 'Deliver', [ev.from, ev.payload]);
          break;
        }
        case 'timer':
          trace(node, 'timer', ev.inst, 'Timeout', [ev.id]);
          dispatch(node, ev.inst, 'timer', 'Timeout', [ev.id]);
          break;
        case 'roundStart':
          node.round = ev.r;
          for (const s of stack.specs) for (const a in s.bind) if (s.bind[a].builtin === 'Rounds') dispatch(node, s.id, a, 'RoundStart', [ev.r]);
          break;
        case 'roundEnd':
          for (const s of stack.specs) for (const a in s.bind) if (s.bind[a].builtin === 'Rounds') dispatch(node, s.id, a, 'RoundEnd', [ev.r]);
          break;
      }
      drain(node);
      node.busyUntil = curEnd;
      // processing activity, used by the UI to animate nodes
      if (ev.type !== 'init') out.activity.push({ t: ev.t, end: curEnd, node: node.id, type: ev.type, msg: ev.type === 'deliver' ? ev.rec.id : null });
      snapshot(node, ev.t);
    }
    if (halted) out.stopReason = halted;
    else if (!out.stopReason) out.stopReason = 'No more events in the queue';
    out.ok = true;
  } catch (e) {
    if (e instanceof RtError) { out.error = 'Runtime error on p' + (curNode ? curNode.id : '?') + ': ' + e.message; out.errorLine = e.line; out.ok = true; out.stopReason = 'Runtime error'; logE(curTime, curNode ? curNode.id : null, 'error', e.message + (e.line ? ' (line ' + e.line + ')' : ''), e.line); }
    else if (e instanceof HaltSignal) { out.ok = true; out.stopReason = e.message; }
    else throw e;
  }
  for (const m of out.msgs) if (m.recvT !== null && m.recvT <= cfg.stopAt && m.recvT > out.endT) out.endT = m.recvT;
  if (out.endT < 1) out.endT = 1;
  out.eventCount = count;
  out.cfg = { timing: cfg.timing, roundMode: cfg.roundMode, known: cfg.known, gst: cfg.gst, stopAt: cfg.stopAt };
  return out;
}

// ============================================================
// Scenario normalization
// ============================================================
function normalizeScenario(s) {
  const A = s.assumed || {}, X = s.actual || {};
  const timing = A.timing || 'asynchronous';
  if (!['synchronous-rounds', 'synchronous-timed', 'partial', 'asynchronous'].includes(timing))
    throw new Error('Invalid assumed model: ' + timing);
  const kd = k => (A[k] === undefined || A[k] === null || A[k] === '' || A[k] === 'unknown') ? null : (k === 'RHO' ? parseFloat(A[k]) : parseDuration(A[k]));
  const known = { DELTA: kd('DELTA'), PHI: kd('PHI'), RHO: kd('RHO') };
  if (timing === 'asynchronous') { known.DELTA = null; known.PHI = null; known.RHO = null; }
  const num = (v, d, name) => {
    if (v === undefined || v === null || v === '') return d;
    const x = parseFloat(v);
    if (isNaN(x) || x < 0 || x > 1) throw new Error(name + ' must be a number between 0 and 1');
    return x;
  };
  const inputs = parseInputs(s.inputs || '');
  return {
    seed: (parseInt(s.seed, 10) || 0) >>> 0,
    timing, known,
    roundMode: X.roundMode === 'emulated' ? 'emulated' : 'lockstep',
    roundLen: parseDuration(X.roundLen || '1s') || 1000000,
    nodes: (s.nodes || []).map(n => ({ id: n.id })),
    links: (s.links || []).map(l => ({
      a: l.a, b: l.b, directed: !!l.directed, enabled: l.enabled !== false,
      loss: l.loss === null || l.loss === undefined || l.loss === '' ? null : num(l.loss, 0, 'Link loss'),
      delay: l.delay ? parseDist(l.delay) : null
    })),
    delay: parseDist(X.delay || 'uniform(5ms, 50ms)'),
    bound: X.bound ? parseDuration(X.bound) : null,
    loss: num(X.loss, 0, 'Loss'),
    dup: num(X.dup, 0, 'Duplication'),
    fifo: X.fifo !== false,
    spikeProb: num(X.spikeProb, 0, 'Spike probability'),
    spikeExtra: parseDuration(X.spikeExtra || '0ms') || 0,
    step: parseDist(X.step || 'const(0ms)'),
    offset: parseDist(X.offset || 'const(0ms)'),
    rho: parseDist(X.rho || '0', true),
    gst: X.gst ? parseDuration(X.gst) : null,
    preGstDelay: X.preGstDelay ? parseDist(X.preGstDelay) : null,
    policy: s.violationPolicy || 'deliver-late',
    tieBreak: s.tieBreak === 'shuffle' ? 'shuffle' : 'stable',
    stopAt: parseDuration(s.stopAt || '10s'),
    faults: (s.faults || []).map((f, i) => normalizeFault(f, i + 1)),
    inputs,
    paramOverrides: {},
    haltOnAssert: !!s.haltOnAssert
  };
}

function parseGroups(g) {
  let groups;
  if (Array.isArray(g)) groups = g.map(x => (Array.isArray(x) ? x : [x]).map(Number));
  else groups = String(g || '').split('|').map(part => part.split(/[\s,]+/).filter(Boolean).map(x => parseInt(x.replace(/^p/i, ''), 10)));
  groups = groups.filter(x => x.length);
  if (!groups.length || groups.some(x => x.some(id => !Number.isInteger(id))))
    throw new Error('Partition groups must be process numbers separated by "|", e.g. "1 2 | 3 4"');
  const seen = new Set();
  for (const id of groups.flat()) { if (seen.has(id)) throw new Error('p' + id + ' appears in more than one partition group'); seen.add(id); }
  return groups;
}
// Faults: crash/recover {node, at}, link {a, b, from, to}, partition {groups, from, to}; "to" empty = forever
function normalizeFault(f, n) {
  const where = 'Fault ' + (n || '') + ': ';
  const dur = (v, label, optional) => {
    if (v === undefined || v === null || String(v).trim() === '' || String(v).trim() === 'forever') {
      if (optional) return null;
      throw new Error(where + label + ' is required');
    }
    let d;
    try { d = parseDuration(v); } catch (e) { throw new Error(where + e.message); }
    if (d === null || d < 0) throw new Error(where + label + ' must be a duration ≥ 0');
    return d;
  };
  const pid = (v, label) => {
    const x = parseInt(v, 10);
    if (!Number.isInteger(x)) throw new Error(where + label + ' must be a process number');
    return x;
  };
  const type = f.type || 'crash';
  switch (type) {
    case 'crash': case 'recover':
      return { type, node: pid(f.node, 'process'), at: dur(f.at, 'time') };
    case 'link': {
      const a = pid(f.a, 'first process'), b = pid(f.b, 'second process');
      if (a === b) throw new Error(where + 'a link needs two different processes');
      const from = dur(f.from, 'start'), to = dur(f.to, 'end', true);
      if (to !== null && to <= from) throw new Error(where + 'the end must come after the start');
      return { type, a, b, from, to };
    }
    case 'partition': {
      let groups;
      try { groups = parseGroups(f.groups); } catch (e) { throw new Error(where + e.message); }
      const from = dur(f.from, 'start'), to = dur(f.to, 'end', true);
      if (to !== null && to <= from) throw new Error(where + 'the end must come after the start');
      return { type, groups, from, to };
    }
  }
  throw new Error(where + 'unknown type "' + type + '"');
}

// Format: TIME NODE Event | arg1, arg2     (NODE = number or *)
function parseInputs(text) {
  const res = [];
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) return;
    const m = /^(\S+)\s+(\*|p?\d+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*(.*))?$/.exec(line);
    if (!m) throw new Error('Input line ' + (i + 1) + ': expected "TIME NODE Event | arguments", e.g. "0ms 1 Broadcast | \\"hello\\""');
    let at;
    try { at = parseDuration(m[1]); } catch (e) { throw new Error('Input line ' + (i + 1) + ': ' + e.message); }
    const node = m[2] === '*' ? '*' : parseInt(m[2].replace('p', ''), 10);
    let args = [];
    if (m[4] !== undefined && m[4].trim() !== '') {
      try {
        const p = new Parser(m[4]);
        args.push(p.expr());
        while (p.isOp(',')) { p.p++; args.push(p.expr()); }
        if (!p.is('eof')) p.err('Unexpected text: ' + p.desc(p.tok));
      } catch (e) { throw new Error('Input line ' + (i + 1) + ': ' + e.message); }
    }
    res.push({ at: at || 0, node, ev: m[3], args, line: i + 1 });
  });
  return res;
}

// sampling for the distribution preview
function previewDist(str, n, seed) {
  const d = parseDist(str);
  const rng = new Rng(seed || 1, 'preview:' + str);
  const xs = [];
  for (let i = 0; i < (n || 2000); i++) xs.push(Math.max(0, sampleDist(d, rng)));
  return xs;
}

// delay samples with spikes and truncation, for the Timing panel preview
function previewDelay(distStr, spikeProb, spikeExtraStr, boundStr, n) {
  const d = parseDist(distStr);
  const sp = parseFloat(spikeProb) || 0;
  const ex = parseDuration(spikeExtraStr || '0ms') || 0;
  const bound = boundStr ? parseDuration(boundStr) : null;
  const rng = new Rng(12345, 'preview:' + distStr);
  const xs = [];
  for (let i = 0; i < (n || 4000); i++) {
    let v = sampleDist(d, rng);
    if (sp > 0 && rng.next() < sp) v += ex;
    if (bound !== null) v = Math.min(v, bound);
    xs.push(Math.max(0, v));
  }
  return xs;
}

function isAtomNamePublic(n) { return isAtomName(n); }

// Causal cone of the event of process `node` at time `t` (Lamport's happened-before relation).
// past[q]: every event of q at or before past[q] may have influenced the origin (-Infinity: none).
// future[q]: every event of q at or after future[q] may be influenced by the origin (Infinity: none).
function causalCone(res, node, t) {
  const ids = Object.keys(res.nodeInfo).map(Number);
  const past = {}, future = {};
  for (const q of ids) { past[q] = -Infinity; future[q] = Infinity; }
  past[node] = t; future[node] = t;
  const msgs = res.msgs.filter(m => m.status === 'delivered' && m.from !== m.to);
  const byRecv = msgs.slice().sort((a, b) => b.recvT - a.recvT);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of byRecv) {
      if (m.recvT <= past[m.to] && m.sendT > past[m.from]) { past[m.from] = m.sendT; changed = true; }
    }
  }
  const bySend = msgs.slice().sort((a, b) => a.sendT - b.sendT);
  changed = true;
  while (changed) {
    changed = false;
    for (const m of bySend) {
      if (m.sendT >= future[m.from] && m.recvT < future[m.to]) { future[m.to] = m.recvT; changed = true; }
    }
  }
  const counts = { past: 0, future: 0, concurrent: 0 };
  for (const a of res.activity) {
    if (a.node === node && a.t === t) continue;
    if (a.t <= past[a.node]) counts.past++;
    else if (a.t >= future[a.node]) counts.future++;
    else counts.concurrent++;
  }
  return { node, t, past, future, counts };
}

const SimCore = {
  runSimulation, parseProgram, check, lex, parseDuration, fmtDuration, parseDist, previewDist, previewDelay,
  isAtomName: isAtomNamePublic, BUILTIN_VARS, BUILTIN_FUNS, parseInputs, normalizeFault, parseGroups, causalCone,
  DslError, fmt, KEYWORDS
};
if (typeof module !== 'undefined' && module.exports) module.exports = SimCore;
else root.SimCore = SimCore;
})(typeof self !== 'undefined' ? self : this);
