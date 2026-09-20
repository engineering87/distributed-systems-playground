// 12-settings.js — settings, presentation mode, the welcome tour and the gallery

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
// A browser that exits full screen on its own (Esc is often consumed by the browser) must also leave
// presentation mode, otherwise the page stays without its controls.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('present')) togglePresentation(false);
});
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
