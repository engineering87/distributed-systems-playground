// 02-forms.js — field validation and the forms bound to the scenario

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
