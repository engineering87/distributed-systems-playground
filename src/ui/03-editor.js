// 03-editor.js — the code editor: highlighting, diagnostics, symbols and the module menu

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
