// 13-init.js — startup

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
