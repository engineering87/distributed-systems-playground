// 10-scenarios.js — export, import, shared links, storage and loading a scenario

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
  fillForms(); fillSuite(); fitView(); checkCode(); renderTopo(); renderProps();
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
  // a field of the form that carries a time: hidden when the fault is armed by a condition instead
  const isTimeField = e => {
    const input = e.querySelector('input');
    return !!input && ['fault-at', 'fault-from', 'fault-to', 'fault-to2'].includes(input.id);
  };
  const syncFaultForm = () => {
    const type = $('#fault-type').value;
    const armed = $('#fault-armed').checked;
    $$('[data-ft]').forEach(e => {
      const kinds = e.dataset.ft.split(' ');
      if (kinds.includes('armed')) e.hidden = !armed;
      else if (kinds.includes('armed-hold')) e.hidden = !armed || type === 'crash' || type === 'recover';
      else e.hidden = !kinds.includes(type) || (armed && isTimeField(e));
    });
  };
  $('#fault-type').addEventListener('change', syncFaultForm);
  $('#fault-armed').addEventListener('change', syncFaultForm);
  syncFaultForm();
  $('#btn-add-fault').addEventListener('click', () => {
    const type = $('#fault-type').value;
    const v = id => $(id).value.trim();
    const armed = $('#fault-armed').checked;
    const when = armed ? { when: v('#fault-when'), for: v('#fault-for') } : {};
    const f = type === 'link' ? Object.assign({ type, a: parseInt(v('#fault-a'), 10), b: parseInt(v('#fault-b'), 10), from: v('#fault-from'), to: v('#fault-to'), oneWay: $('#fault-oneway').checked }, when)
      : type === 'partition' ? Object.assign({ type, groups: v('#fault-groups'), from: v('#fault-from'), to: v('#fault-to'), oneWay: $('#fault-part-oneway').checked }, when)
      : type === 'pause' ? Object.assign({ type, node: parseInt(v('#fault-node2'), 10), from: v('#fault-from'), to: v('#fault-to2') }, when)
        : type === 'omission' ? Object.assign({ type, node: parseInt(v('#fault-node2'), 10), direction: v('#fault-direction'), prob: v('#fault-prob'), from: v('#fault-from'), to: v('#fault-to') }, when)
          : Object.assign({ type, node: parseInt(v('#fault-node'), 10), at: v('#fault-at') }, when);
    if (addFault(f)) { renderProps(); toast('Fault added: ' + describeFault(f) + '.'); }
  });
  $('#btn-rnd-faults').addEventListener('click', () => drawRandomFaults(false));
  $('#btn-rnd-replace').addEventListener('click', () => drawRandomFaults(true));
}

// Draws a schedule of random faults for the scenario in front of you, so that a single run can be watched
// under conditions nobody chose. Every draw is a different one; once added, the faults are ordinary faults
// of the scenario, so the run stays reproducible and the schedule can be edited or exported.
let drawNonce = 0;
function drawRandomFaults(replace) {
  const R = window.SimRunner;
  let faults;
  try {
    const plan = R.parsePlan($('#rnd-faults').value);
    const win = R.parseWindow($('#rnd-window').value);
    drawNonce++;
    faults = R.planFaults(plan, win, S.scn, (S.scn.seed || 1) * 1000 + drawNonce);
  } catch (e) { toast(e.message); return; }
  if (replace) S.scn.faults = [];
  let added = 0;
  for (const f of faults) if (addFault(f)) added++;
  renderProps();
  toast(added ? (replace ? 'Faults replaced: ' : 'Faults drawn: ') + faults.map(f => R.describePlanFault(f)).join('; ') + '.'
    : 'Nothing could be drawn for this topology.');
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
