// 09-preview.js — the delay histogram and the tab switcher

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
