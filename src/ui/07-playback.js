// 07-playback.js — playback: cursor, speeds and transport controls

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
