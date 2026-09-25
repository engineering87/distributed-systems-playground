// 03b-complete.js — writing help: contextual completion and quick fixes, both built from the parse tree

// ---------------------------------------------------------------- symbols in scope
// The suggestions come from the program as parsed, never from guessing: instances of the algorithm the
// caret is in, the events of their interfaces, its state, its parameters and its functions.
function algorithmAt(text, caret) {
  const before = text.slice(0, caret);
  const starts = [...before.matchAll(/(^|\n)[ \t]*algorithm\s+([A-Za-z_][\w]*)/g)];
  if (!starts.length) return null;
  const last = starts[starts.length - 1];
  const parsed = S.prog && S.prog.algorithms.find(a => a.name === last[2]);
  // While the algorithm is being typed it does not parse yet, so the instances are read from its header,
  // which is text the user has already written, not a guess.
  return parsed || { name: last[2], header: before.slice(last.index), state: [], params: [], functions: [] };
}
function instancesOf(algo) {
  if (!algo) return [];
  const out = [];
  if (algo.implAlias) out.push({ name: algo.implAlias, iface: algo.implType, what: 'implements ' + algo.implType });
  for (const u of algo.uses || []) out.push({ name: u.alias, iface: u.type, what: 'uses ' + u.type });
  if (!out.length && algo.header) {
    for (const m of algo.header.matchAll(/\b(implements|uses)\s+([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)/g)) {
      out.push({ name: m[3], iface: m[2], what: m[1] + ' ' + m[2] });
    }
  }
  return out;
}
const BUILTIN_IFACES = C.builtinIfaces();
function eventsOf(ifaceName) {
  const it = (S.ifaces && S.ifaces.get(ifaceName)) || BUILTIN_IFACES.get(ifaceName);
  if (!it) return [];
  const out = [];
  for (const [name, arity] of it.requests) out.push({ name, what: 'request of ' + ifaceName, arity });
  for (const [name, arity] of it.indications) out.push({ name, what: 'indication of ' + ifaceName, arity });
  return out;
}
const COMPLETION_KEYWORDS = ['upon', 'event', 'where', 'do', 'end', 'trigger', 'forall', 'exists', 'while', 'if',
  'then', 'else', 'state', 'params', 'stable', 'function', 'return', 'call', 'via', 'starttimer', 'canceltimer',
  'assert', 'log', 'skip', 'condition', 'property', 'always', 'eventually'];

// what to suggest, given the text before the caret
function completionsAt(text, caret) {
  const line = text.slice(text.lastIndexOf('\n', caret - 1) + 1, caret);
  const algo = algorithmAt(text, caret);
  const word = (/([A-Za-z_][\w]*)$/.exec(line) || ['', ''])[1];
  // ⟨instance, Event | …⟩: the instance comes first, then an event of its interface
  const inTuple = /⟨\s*([A-Za-z_][\w]*)?\s*(,\s*([A-Za-z_][\w]*)?)?$/.exec(line);
  if (inTuple) {
    if (inTuple[2] === undefined) {
      return { word, items: instancesOf(algo).map(i => ({ text: i.name, kind: 'instance', hint: i.what })) };
    }
    const inst = instancesOf(algo).find(i => i.name === inTuple[1]);
    const items = eventsOf(inst ? inst.iface : '').map(e => ({
      text: e.name, kind: 'event', hint: e.what + (e.arity ? ' with ' + e.arity + ' argument(s)' : '')
    }));
    return { word, items };
  }
  if (!word) return { word, items: [] };
  const items = [];
  if (algo) {
    for (const st of algo.state || []) items.push({ text: st.name, kind: 'state', hint: 'state of ' + algo.name });
    for (const p of algo.params || []) items.push({ text: p.name, kind: 'param', hint: 'parameter of ' + algo.name });
    for (const fn of algo.functions || []) items.push({ text: fn.name, kind: 'function', hint: 'function with ' + fn.params.length + ' argument(s)' });
    for (const i of instancesOf(algo)) items.push({ text: i.name, kind: 'instance', hint: i.what });
  }
  for (const v of C.BUILTIN_VARS) items.push({ text: v, kind: 'built-in', hint: 'built-in' });
  for (const f of Object.keys(C.BUILTIN_FUNS)) items.push({ text: f, kind: 'built-in', hint: 'built-in function' });
  for (const k of COMPLETION_KEYWORDS) items.push({ text: k, kind: 'keyword', hint: 'keyword' });
  return { word, items };
}

// ---------------------------------------------------------------- the popup
let comp = { open: false, items: [], index: 0, word: '' };
function completionBox() {
  let box = $('#complete');
  if (!box) {
    box = el('div', { id: 'complete', class: 'complete', role: 'listbox', hidden: true });
    $('.ed-main').append(box);
  }
  return box;
}
// the editor is monospaced, so the caret sits at a whole number of characters
function caretPosition(ta) {
  const before = ta.value.slice(0, ta.selectionStart);
  const row = before.split('\n').length - 1;
  const col = before.length - before.lastIndexOf('\n') - 1;
  const cs = getComputedStyle(ta);
  const cv = caretPosition.canvas || (caretPosition.canvas = document.createElement('canvas'));
  const ctx = cv.getContext('2d');
  ctx.font = cs.fontSize + ' ' + cs.fontFamily;
  const chars = ctx.measureText('M'.repeat(10)).width / 10;
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
  return {
    x: parseFloat(cs.paddingLeft) + col * chars - ta.scrollLeft,
    y: parseFloat(cs.paddingTop) + (row + 1) * lineHeight - ta.scrollTop
  };
}
function closeCompletion() {
  comp.open = false;
  const box = $('#complete');
  if (box) box.hidden = true;
}
function showCompletion(force) {
  const ta = $('#code');
  if (ta.selectionStart !== ta.selectionEnd) return closeCompletion();
  const { word, items } = completionsAt(ta.value, ta.selectionStart);
  const lower = word.toLowerCase();
  let list = items.filter(i => i.text.toLowerCase().startsWith(lower) && i.text !== word);
  // a unique name beats a long list of keywords
  const seen = new Set();
  list = list.filter(i => (seen.has(i.text) ? false : seen.add(i.text)));
  if (!list.length || (!force && !word && !/⟨\s*[A-Za-z_]*$|,\s*[A-Za-z_]*$/.test(ta.value.slice(0, ta.selectionStart).split('\n').pop()))) {
    return closeCompletion();
  }
  list = list.slice(0, 12);
  comp = { open: true, items: list, index: 0, word };
  const box = completionBox();
  box.textContent = '';
  list.forEach((item, i) => {
    box.append(el('div', {
      class: 'ci' + (i === 0 ? ' sel' : ''), role: 'option', 'data-i': i,
      onmousedown: e => { e.preventDefault(); applyCompletion(i); }
    }, el('span', { class: 'ct' }, item.text), el('span', { class: 'ck' }, item.hint)));
  });
  const pos = caretPosition(ta);
  box.hidden = false;
  box.style.left = Math.max(0, Math.min(pos.x, ta.clientWidth - box.offsetWidth - 8)) + 'px';
  box.style.top = pos.y + 'px';
}
function moveCompletion(delta) {
  const box = $('#complete');
  if (!box || !comp.open) return;
  comp.index = (comp.index + delta + comp.items.length) % comp.items.length;
  [...box.children].forEach((c, i) => c.classList.toggle('sel', i === comp.index));
}
function applyCompletion(index) {
  const ta = $('#code');
  const item = comp.items[index === undefined ? comp.index : index];
  if (!item) return closeCompletion();
  const at = ta.selectionStart;
  const start = at - comp.word.length;
  ta.value = ta.value.slice(0, start) + item.text + ta.value.slice(at);
  ta.selectionStart = ta.selectionEnd = start + item.text.length;
  closeCompletion();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------------------------------------------------------------- quick fixes
// A diagnostic that has an obvious repair offers it as a button: the edit is applied to the code, and the
// checker runs again, so nothing is applied that the checker would not accept.
function quickFixFor(d) {
  let m = /^(?:Variable )?"([A-Za-z_]\w*)" is not declared$/.exec(d.msg);
  if (m) return { label: 'declare it in state', apply: () => declareState(m[1], d.line) };
  m = /^Interface "([A-Za-z_]\w*)" is not declared$/.exec(d.msg);
  if (m) {
    const key = LIB.DEFAULT_FOR && LIB.DEFAULT_FOR[m[1]];
    if (key) return { label: 'add a module that implements it', apply: () => insertModule(key) };
    return { label: 'declare the interface', apply: () => declareInterface(m[1]) };
  }
  m = /^No handler for ⟨([A-Za-z_]\w*), ([A-Za-z_]\w*)⟩/.exec(d.msg);
  if (m) return { label: 'add the handler', apply: () => addHandler(m[1], m[2], d.line) };
  return null;
}
// inserts a line into the state block of the algorithm the diagnostic belongs to, creating the block if needed
function declareState(name, line) {
  const lines = S.scn.code.split('\n');
  let start = 0;
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) if (/^\s*algorithm\s/.test(lines[i])) { start = i; break; }
  let stateAt = -1, insertAt = -1;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*state\b/.test(lines[i])) { stateAt = i; break; }
    if (/^\s*upon\b/.test(lines[i]) || /^\s*end\b/.test(lines[i])) { insertAt = i; break; }
  }
  if (stateAt >= 0) {
    const indent = (/^(\s*)/.exec(lines[stateAt + 1] || '') || ['', '    '])[1] || '    ';
    lines.splice(stateAt + 1, 0, indent + name + ' := nil');
  } else {
    const at = insertAt >= 0 ? insertAt : start + 1;
    lines.splice(at, 0, '  state', '    ' + name + ' := nil', '');
  }
  applyCodeEdit(lines.join('\n'), '"' + name + '" declared in state.');
}
function declareInterface(name) {
  const code = 'interface ' + name + '\n  request Do()\n  indication Done(x)\nend\n\n' + S.scn.code;
  applyCodeEdit(code, 'Interface "' + name + '" added: fill in its events.');
}
// argument names for a handler skeleton, as many as the event carries
function handlerArgs(instance, event) {
  const algo = algorithmAt(S.scn.code, S.scn.code.length);
  const inst = instancesOf(algo).find(i => i.name === instance);
  const it = inst ? ((S.ifaces && S.ifaces.get(inst.iface)) || BUILTIN_IFACES.get(inst.iface)) : null;
  const arity = it ? (it.indications.get(event) || it.requests.get(event) || 0) : 0;
  const names = ['p', 'm', 'v', 'w', 'x'];
  return arity ? ' | ' + Array.from({ length: arity }, (_, i) => names[i] || 'a' + i).join(', ') : '';
}
function addHandler(instance, event, line) {
  const lines = S.scn.code.split('\n');
  // the closing "end" of the algorithm is the one at the left margin, not the one of a handler
  let end = lines.length;
  for (let i = Math.max(0, Math.min(line, lines.length) - 1); i < lines.length; i++) if (/^end\s*$/.test(lines[i])) { end = i; break; }
  if (end === lines.length) { for (let i = lines.length - 1; i >= 0; i--) if (/^end\s*$/.test(lines[i])) { end = i; break; } }
  lines.splice(end, 0, '', '  upon event ⟨' + instance + ', ' + event + handlerArgs(instance, event) + '⟩ do', '    skip', '  end');
  applyCodeEdit(lines.join('\n'), 'Handler for ' + event + ' added.');
}
function applyCodeEdit(code, message) {
  S.scn.code = code;
  $('#code').value = code;
  S.runtimeErr = null;
  refreshCode();
  checkCode();
  markStale();
  toast(message);
}
function bindCompletion() {
  const ta = $('#code');
  ta.addEventListener('input', () => showCompletion(false));
  ta.addEventListener('blur', closeCompletion);
  ta.addEventListener('scroll', closeCompletion);
  // capture phase: while the list is open these keys belong to it, not to the editor's own handlers
  ta.addEventListener('keydown', e => {
    if (e.key === ' ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopImmediatePropagation(); showCompletion(true); return; }
    if (!comp.open) return;
    const mine = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key);
    if (!mine) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'ArrowDown') moveCompletion(1);
    else if (e.key === 'ArrowUp') moveCompletion(-1);
    else if (e.key === 'Enter' || e.key === 'Tab') applyCompletion();
    else closeCompletion();
  }, true);
}
