// 06-diagram.js — the space-time diagram, its interaction and the causal cone

// ============================================================ space-time diagram
let ROW = 26, TOP = 26;
const LEFT = 52, RIGHT = 14;
let PathCtor = window.Path2D;
// font helper: sizes grow in presentation mode
function fnt(size, family, weight) { return (weight ? weight + ' ' : '') + Math.round(size * (S.fontScale || 1)) + 'px ' + family; }
const T = s => (window.SimI18n ? window.SimI18n.t(s) : s);
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['paper', 'surface', 'grid', 'grid-strong', 'rule', 'ink', 'muted', 'blue', 'red', 'amber', 'green', 'violet'])
    S.colors[k] = cs.getPropertyValue('--' + k).trim();
  S.colors.layers = [0, 1, 2, 3, 4, 5].map(i => cs.getPropertyValue('--layer-' + i).trim());
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
function plotWidth(W) { return Math.max(10, W - LEFT - RIGHT); }
function xToT(x, W) { return S.view.start + (x - LEFT) / plotWidth(W) * S.view.span; }

// target (optional): { ctx, W, Path2D } to draw somewhere else than the on-screen canvas
function diagramHeight() { return Math.max(120, TOP + S.scn.nodes.length * ROW + 14); }
function drawDiagram(target) {
  if (!S.scn) return;
  // event handlers and observers pass their own arguments: only an object with a context is a target
  if (!(target && target.ctx)) target = null;
  const wrap = $('#st-wrap'), cv = $('#st');
  const nodes = S.scn.nodes.slice().sort((a, b) => a.id - b.id);
  const W = target ? target.W : (wrap.clientWidth || 600);
  const H = diagramHeight();
  let ctx;
  const savedSegs = S.segs;
  if (target) {
    ctx = target.ctx;
    PathCtor = target.Path2D || window.Path2D;
  } else {
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
    }
    ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  try { drawDiagramInto(ctx, nodes, W, H); }
  finally {
    PathCtor = window.Path2D;
    if (target) S.segs = savedSegs;
  }
}
function drawDiagramInto(ctx, nodes, W, H) {
  const col = S.colors;
  ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
  const rowY = new Map(nodes.map((n, i) => [n.id, TOP + i * ROW + ROW / 2]));
  const v = S.view, pw = plotWidth(W);
  const X = t => LEFT + (t - v.start) / v.span * pw;
  S.segs = [];

  // time grid
  const step = niceStep(v.span / Math.max(2, pw / 95));
  ctx.lineWidth = 1; ctx.strokeStyle = col.grid; ctx.fillStyle = col.muted;
  ctx.font = fnt(11, MONO); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let t = Math.max(0, Math.ceil(v.start / step) * step); t <= v.start + v.span; t += step) {
    const x = Math.round(X(t)) + 0.5;
    if (x < LEFT + 12) continue;
    ctx.beginPath(); ctx.moveTo(x, TOP - 8); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillText(C.fmtDuration(t), x, 10);
  }
  const r = S.res, t = S.cursor, ghost = $('#ghost').checked;

  ctx.save();
  ctx.beginPath(); ctx.rect(LEFT, 0, pw + RIGHT, H); ctx.clip();
  if (r) {
    if (r.cfg && r.cfg.gst !== null && r.cfg.gst !== undefined) {
      const x = X(r.cfg.gst);
      ctx.strokeStyle = col.amber; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, TOP - 8); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col.amber; ctx.textAlign = 'left'; ctx.font = fnt(11, UIF, 700);
      ctx.fillText(T('GST'), x + 4, TOP - 4);
    }
    if (r.rounds) {
      const R = r.rounds.R;
      if (r.rounds.lockstep) {
        ctx.strokeStyle = col.rule; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.fillStyle = col.muted; ctx.font = fnt(11, UIF); ctx.textAlign = 'left';
        for (let k = Math.max(0, Math.floor(v.start / R)); k * R <= v.start + v.span; k++) {
          const x = X(k * R);
          ctx.beginPath(); ctx.moveTo(x, TOP - 8); ctx.lineTo(x, H); ctx.stroke();
          if (X((k + 1) * R) - x > 30) ctx.fillText('r' + (k + 1), x + 4, TOP - 4);
        }
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = col.muted; ctx.lineWidth = 1;
        for (const n of nodes) {
          const y = rowY.get(n.id);
          for (const s of (r.rounds.starts[n.id] || [])) {
            if (s < v.start || s > v.start + v.span) continue;
            const x = X(s);
            ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
          }
        }
      }
    }
  }
  // network faults: partitions shade the whole diagram, link failures shade the rows between the two processes
  if (r && r.netFaults) {
    const horizon = ghost ? Infinity : t;
    const band = (from, to, y1, y2, label) => {
      if (from > horizon) return;
      const x1 = X(from), x2 = X(Math.min(to === null ? Infinity : to, horizon, v.start + v.span));
      if (x2 <= x1) return;
      ctx.fillStyle = col.red; ctx.globalAlpha = 0.08;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.red; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); ctx.stroke(); ctx.setLineDash([]);
      if (label && x2 - x1 > 60) { ctx.fillStyle = col.red; ctx.font = fnt(11, UIF, 700); ctx.textAlign = 'left'; ctx.fillText(label, x1 + 4, y1 + 9); }
    };
    for (const p of r.netFaults.partitions) band(p.from, p.to, TOP - 8, H, T('partition'));
    for (const l of r.netFaults.links) {
      const ya = rowY.get(l.a), yb = rowY.get(l.b);
      if (ya === undefined || yb === undefined) continue;
      band(l.from, l.to, Math.min(ya, yb) - 6, Math.max(ya, yb) + 6, 'p' + l.a + '–p' + l.b + ' ' + T('down'));
    }
  }
  // process pauses: the process is alive but handles nothing until the pause ends
  if (r && r.pauses) {
    ctx.fillStyle = col.amber;
    for (const id in r.pauses) {
      const y = rowY.get(+id);
      if (y === undefined) continue;
      for (const p of r.pauses[id]) {
        const x1 = Math.max(X(p.from), LEFT), x2 = Math.min(X(Math.min(p.to, t)), W);
        if (x2 <= x1) continue;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x1, y - 7, x2 - x1, 14);
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x1, y - 7, 2, 14);
        if (p.to <= t) ctx.fillRect(x2 - 2, y - 7, 2, 14);
      }
    }
    ctx.globalAlpha = 1;
  }
  // causal cone: the part of each process line that can affect the origin, and the part it can affect
  if (r && S.cone) {
    const c = S.cone;
    for (const n of nodes) {
      const y = rowY.get(n.id);
      const pst = c.past[n.id], fut = c.future[n.id];
      if (pst > -Infinity) {
        ctx.fillStyle = col.blue; ctx.globalAlpha = 0.13;
        const x2 = Math.min(X(pst), W);
        ctx.fillRect(LEFT, y - 9, Math.max(0, x2 - LEFT), 18);
      }
      if (fut < Infinity) {
        ctx.fillStyle = col.amber; ctx.globalAlpha = 0.16;
        const x1 = Math.max(X(fut), LEFT);
        ctx.fillRect(x1, y - 9, Math.max(0, W - x1), 18);
      }
      ctx.globalAlpha = 1;
    }
  }
  // process lines: solid while running, dashed from a crash to the recovery (or to the end)
  for (const n of nodes) {
    const y = rowY.get(n.id);
    const downs = r ? (r.downs[n.id] || []) : [];
    const seg = (xa, xb, down) => {
      xa = Math.max(xa, LEFT); xb = Math.min(xb, W);
      if (xb <= xa) return;
      ctx.strokeStyle = down ? col.violet : col.ink; ctx.lineWidth = 1.4;
      ctx.setLineDash(down ? [2, 4] : []);
      ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke();
      ctx.setLineDash([]);
    };
    let from = X(0);
    for (const d of downs) {
      if (d.from > t && !ghost) break;               // later crashes are not shown yet
      const xa = X(d.from);
      seg(from, xa, false);
      const recoveryShown = d.to !== null && (d.to <= t || ghost);
      const xb = recoveryShown ? X(d.to) : W;
      seg(xa, xb, true);
      ctx.strokeStyle = col.violet; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(xa - 6, y - 6); ctx.lineTo(xa + 6, y + 6); ctx.moveTo(xa + 6, y - 6); ctx.lineTo(xa - 6, y + 6); ctx.stroke();
      if (!recoveryShown) { from = W; break; }
      ctx.strokeStyle = col.green; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(xb, y, 5, 0, Math.PI * 2); ctx.stroke();
      from = xb;
    }
    seg(from, W, false);
  }
  if (r) {
    // processing steps as short bars on the process lines
    const aHi = upperBound(S.activity, Math.min(t, v.start + v.span), a => a.t);
    const aLo = lowerBound(S.activity, v.start - S.maxBusy, a => a.t);
    const bars = new PathCtor();
    let lastX = {};
    for (let i = aLo; i < aHi; i++) {
      const a = S.activity[i];
      const y = rowY.get(a.node);
      if (y === undefined) continue;
      const x1 = X(a.t), x2 = Math.max(x1 + 2, X(Math.min(a.end, t)));
      if (lastX[a.node] !== undefined && x2 <= lastX[a.node]) continue;  // hidden under the previous bar
      lastX[a.node] = x2;
      bars.rect(x1, y - 3, x2 - x1, 6);
    }
    ctx.fillStyle = col.blue; ctx.globalAlpha = 0.35;
    ctx.fill(bars);
    ctx.globalAlpha = 1;
    // messages
    const hi = upperBound(S.msgsBySend, v.start + v.span, m => m.sendT);
    const lo = lowerBound(S.msgsBySend, v.start - S.maxLat, m => m.sendT);
    let drawn = 0;
    const selId = S.selected && S.selected.type === 'msg' ? S.selected.id : null;
    const batches = msgBatches();
    const layers = layersOn();
    const last = ghost ? hi : Math.min(hi, upperBound(S.msgsBySend, t, m => m.sendT));
    for (let i = lo; i < last && drawn < 30000; i++) {
      const m = S.msgsBySend[i];
      if (m.sendT > t) { drawMsg(batches, m, 0.16, Infinity, X, rowY, false, layers); continue; }
      drawMsg(batches, m, inCone(m) ? 1 : 0.25, t, X, rowY, m.id === selId, layers);
      drawn++;
    }
    batches.flush(ctx);
    if (S.cone) {
      const c = S.cone, y = rowY.get(c.node);
      if (y !== undefined) {
        ctx.strokeStyle = col.ink; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(X(c.t), y, 7, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // violations, assertions, errors
    const logHi = upperBound(S.logSorted, ghost ? v.start + v.span : Math.min(t, v.start + v.span), e => e.t);
    const logLo = lowerBound(S.logSorted, v.start, e => e.t);
    for (let i = logLo; i < logHi; i++) {
      const e = S.logSorted[i];
      const y = rowY.get(e.node);
      if (y === undefined) continue;
      const x = X(e.t);
      ctx.globalAlpha = e.t > t ? 0.3 : 1;
      if (e.kind === 'violation') {
        ctx.strokeStyle = col.red; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      } else if (e.kind === 'assert' || e.kind === 'error') {
        ctx.fillStyle = col.red; ctx.fillRect(x - 4, y - 4, 8, 8);
      }
      ctx.globalAlpha = 1;
    }
    // outputs
    ctx.font = fnt(11, UIF); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const lastLabel = {};
    for (const o of r.outputs) {
      if (o.t < v.start || o.t > v.start + v.span) continue;
      if (o.t > t && !ghost) continue;
      const y = rowY.get(o.node);
      if (y === undefined) continue;
      const x = X(o.t);
      ctx.globalAlpha = o.t > t ? 0.3 : 1;
      ctx.fillStyle = col.green;
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
      const label = truncate(o.text, 22);
      const wTxt = ctx.measureText(label).width;
      if (lastLabel[o.node] === undefined || x - lastLabel[o.node] > 8) {
        ctx.fillText(label, x + 6, y - 6);
        lastLabel[o.node] = x + 6 + wTxt;
      }
      ctx.globalAlpha = 1;
    }
    // cursor
    const xc = X(t);
    ctx.strokeStyle = col.blue; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xc, TOP - 10); ctx.lineTo(xc, H); ctx.stroke();
  }
  ctx.restore();

  // label column
  ctx.fillStyle = col.surface; ctx.fillRect(0, 0, LEFT, H);
  ctx.strokeStyle = col.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LEFT - 0.5, 0); ctx.lineTo(LEFT - 0.5, H); ctx.stroke();
  ctx.font = fnt(12, UIF, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const n of nodes) {
    ctx.fillStyle = r && downAt(n.id, t) ? col.muted : col.ink;
    ctx.fillText('p' + n.id, 10, rowY.get(n.id));
  }
  if (!r) {
    ctx.fillStyle = col.muted; ctx.font = fnt(13, UIF); ctx.textAlign = 'center';
    ctx.fillText(T(nodes.length ? 'Press Run to see the space-time diagram.' : 'Add some processes to get started.'), LEFT + pw / 2, Math.min(H - 20, TOP + 30));
  }
}

// Messages are collected into batches that share a style and drawn with one stroke and one fill each.
function msgBatches() {
  const map = new Map();
  return {
    get(color, width, dash, alpha) {
      const k = color + '|' + width + '|' + dash.join(',') + '|' + alpha;
      let b = map.get(k);
      if (!b) { b = { color, width, dash, alpha, line: new PathCtor(), mark: new PathCtor(), fill: new PathCtor() }; map.set(k, b); }
      return b;
    },
    flush(ctx) {
      for (const b of map.values()) {
        ctx.globalAlpha = b.alpha;
        ctx.strokeStyle = b.color; ctx.fillStyle = b.color;
        ctx.lineWidth = b.width; ctx.setLineDash(b.dash);
        ctx.stroke(b.line);
        ctx.setLineDash([]); ctx.lineWidth = 1.6;
        ctx.stroke(b.mark);
        ctx.fill(b.fill);
      }
      ctx.globalAlpha = 1;
    }
  };
}
function drawMsg(B, m, alpha, tcut, X, rowY, selected, layers) {
  const col = S.colors;
  const y1 = rowY.get(m.from);
  const y2 = rowY.get(m.to);
  if (y1 === undefined) return;
  const x1 = X(m.sendT);
  if (m.status === 'dropped-link' || y2 === undefined || (m.status === 'dropped-cut' && m.recvT === m.sendT)) {
    const b = B.get(col.amber, 1.5, [], alpha);
    b.mark.moveTo(x1 - 3, y1 - 3); b.mark.lineTo(x1 + 3, y1 + 3); b.mark.moveTo(x1 + 3, y1 - 3); b.mark.lineTo(x1 - 3, y1 + 3);
    return;
  }
  let color = m.violation ? col.red : layers ? layerColor(m.origin) : col.blue;
  let dash = [];
  if (m.status === 'dropped-loss' || m.status === 'dropped-cut' || m.status === 'dropped-omission') { color = col.amber; dash = [4, 3]; }
  else if (m.status === 'lost-crash') { color = col.muted; dash = [2, 3]; }
  else if (m.status === 'dropped-late') dash = [4, 3];
  const lost = m.status === 'dropped-loss' || m.status === 'dropped-late' || m.status === 'lost-crash' || m.status === 'dropped-cut' || m.status === 'dropped-omission';
  let tt = m.recvT, ty = y2;
  if (m.status === 'dropped-loss') { tt = (m.sendT + m.recvT) / 2; ty = (y1 + y2) / 2; }
  else if (m.status === 'dropped-omission' && m.recvT === m.sendT) { tt = m.sendT; ty = y1; }
  let frac = 1;
  if (tcut < tt && tt > m.sendT) frac = Math.max(0, (tcut - m.sendT) / (tt - m.sendT));
  const self = m.from === m.to;
  const xe = x1 + (X(tt) - x1) * frac;
  const ye = self ? y1 : y1 + (ty - y1) * frac;
  const b = B.get(color, selected ? 3 : m.violation ? 1.9 : 1.2, dash, alpha);
  b.line.moveTo(x1, y1);
  if (self) b.line.quadraticCurveTo((x1 + xe) / 2, y1 - 11, xe, y1);
  else b.line.lineTo(xe, ye);
  if (frac >= 1) {
    if (lost) {
      b.mark.moveTo(xe - 3.5, ye - 3.5); b.mark.lineTo(xe + 3.5, ye + 3.5); b.mark.moveTo(xe + 3.5, ye - 3.5); b.mark.lineTo(xe - 3.5, ye + 3.5);
    } else if (!self) {
      const a = Math.atan2(ye - y1, xe - x1);
      b.fill.moveTo(xe, ye);
      b.fill.lineTo(xe - 7 * Math.cos(a - 0.4), ye - 7 * Math.sin(a - 0.4));
      b.fill.lineTo(xe - 7 * Math.cos(a + 0.4), ye - 7 * Math.sin(a + 0.4));
      b.fill.closePath();
    }
  } else {
    b.fill.moveTo(xe + 3.2, ye);
    b.fill.arc(xe, ye, 3.2, 0, Math.PI * 2);
  }
  if (alpha > 0.2) S.segs.push({ x1, y1, x2: xe, y2: ye, m });
}
function inCone(m) {
  const c = S.cone;
  if (!c) return true;
  if (m.status === 'delivered' && m.recvT <= c.past[m.to]) return true;
  return m.sendT >= c.future[m.from];
}
function distSeg(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L2 = dx * dx + dy * dy;
  let u = L2 ? ((px - s.x1) * dx + (py - s.y1) * dy) / L2 : 0;
  u = clamp(u, 0, 1);
  return Math.hypot(px - (s.x1 + u * dx), py - (s.y1 + u * dy));
}
const STATUS_TEXT = {
  delivered: 'delivered', pending: 'still in transit when the run ended', 'dropped-loss': 'lost by the network',
  'dropped-omission': 'omitted by a process',
  'dropped-late': 'discarded because late', 'lost-crash': 'recipient crashed', 'dropped-link': 'no link',
  'dropped-cut': 'dropped by a link failure or a partition'
};
function nearestSeg(x, y) {
  let best = null, bd = 7;
  for (const s of S.segs) { const d = distSeg(x, y, s); if (d < bd) { bd = d; best = s; } }
  return best;
}
function bindDiagram() {
  const cv = $('#st'), tip = $('#tip'), wrap = $('#st-wrap');
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, start: S.view.start, moved: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (drag) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) { drag.moved = true; cv.classList.add('dragging'); }
      if (drag.moved) {
        S.view.start = Math.max(-S.view.span * 0.05, drag.start - dx / plotWidth(rect.width) * S.view.span);
        $('#follow').checked = false;
        drawDiagram();
      }
      tip.hidden = true;
      return;
    }
    const best = nearestSeg(x, y);
    if (!best) { tip.hidden = true; return; }
    const m = best.m;
    tip.textContent = '';
    const extra = [];
    if (m.violation) extra.push('violates the assumed model');
    if (m.dup) extra.push('duplicate');
    tip.append(
      el('div', {}, el('b', {}, 'p' + m.from + ' → p' + m.to), ': ' + STATUS_TEXT[m.status] + (extra.length ? ', ' + extra.join(', ') : '')),
      el('div', {}, el('code', {}, m.payload)),
      el('div', { class: 'hint', style: 'margin:0' },
        'sent at ' + C.fmtDuration(m.sendT) +
        (m.recvT !== null && m.status !== 'dropped-link' ? ', arrives at ' + C.fmtDuration(m.recvT) + ' (delay ' + C.fmtDuration(m.recvT - m.sendT) + ')' : '') +
        (m.round ? ', round ' + m.round : '') + '. Click to select.')
    );
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(x + 14, wrap.clientWidth - tw - 6)) + 'px';
    tip.style.top = (y + 14) + 'px';
  });
  cv.addEventListener('pointerup', e => {
    if (drag && !drag.moved && S.res) {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const best = nearestSeg(x, y);
      stopPlay();
      if ($('#cone-mode').checked && x > LEFT) setCone(y, xToT(x, rect.width));
      else if (best) select({ type: 'msg', id: best.m.id });
      else if (x > LEFT) setCursor(xToT(x, rect.width));
    }
    drag = null; cv.classList.remove('dragging');
  });
  cv.addEventListener('pointercancel', () => { drag = null; cv.classList.remove('dragging'); });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; });
  cv.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    zoomAt(xToT(e.clientX - rect.left, rect.width), e.deltaY > 0 ? 1.25 : 0.8);
  }, { passive: false });
  const center = () => (S.cursor >= S.view.start && S.cursor <= S.view.start + S.view.span) ? S.cursor : S.view.start + S.view.span / 2;
  $('#zoom-in').addEventListener('click', () => zoomAt(center(), 0.5));
  $('#zoom-out').addEventListener('click', () => zoomAt(center(), 2));
  $('#zoom-all').addEventListener('click', () => { S.view = { start: 0, span: (S.res ? S.res.endT : 1e6) * 1.03 }; drawDiagram(); });
  $('#zoom-fit').addEventListener('click', () => { S.view = { start: 0, span: (S.res ? S.playEnd : 1e6) * 1.03 }; drawDiagram(); });
  $('#ghost').addEventListener('change', drawDiagram);
  $('#cone-mode').addEventListener('change', () => {
    document.body.classList.toggle('cone-mode', $('#cone-mode').checked);
    if (!$('#cone-mode').checked) clearCone();
    else toast('Click an event on the diagram to see its causal past and future.');
  });
  $('#layers').addEventListener('change', () => { renderLayerLegend(); renderAnim(); drawDiagram(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawDiagram()).observe(wrap);
  else window.addEventListener('resize', drawDiagram);
}
// pick the event of the clicked process nearest to the clicked time and compute its causal cone
function setCone(y, t) {
  const nodes = S.scn.nodes.slice().sort((a, b) => a.id - b.id);
  const row = Math.floor((y - TOP) / ROW);
  const n = nodes[row];
  if (!n || !S.res) return;
  const acts = S.activity.filter(a => a.node === n.id);
  if (!acts.length) { toast('p' + n.id + ' has no events in this run.'); return; }
  let best = acts[0];
  for (const a of acts) if (Math.abs(a.t - t) < Math.abs(best.t - t)) best = a;
  S.cone = C.causalCone(S.res, n.id, best.t);
  renderConeInfo();
  setCursor(best.t);
}
function clearCone() { S.cone = null; renderConeInfo(); renderTopo(); drawDiagram(); }
function renderConeInfo() {
  const box = $('#cone-info');
  if (!box) return;
  box.textContent = '';
  box.hidden = !S.cone;
  if (!S.cone) return;
  const c = S.cone;
  box.append(
    el('span', {}, 'Event of ', el('b', {}, 'p' + c.node), ' at ' + C.fmtDuration(c.t) + ':'),
    el('span', { class: 'past' }, c.counts.past + ' events could have caused it'),
    el('span', { class: 'future' }, c.counts.future + ' events it could affect'),
    el('span', {}, c.counts.concurrent + ' concurrent'),
    el('button', { type: 'button', class: 'ghost small', onclick: clearCone }, 'Clear'));
}
function zoomAt(tc, factor) {
  const v = S.view;
  const ns = Math.max(1000, v.span * factor);
  const f = (tc - v.start) / v.span;
  v.start = tc - f * ns; v.span = ns;
  drawDiagram();
}
