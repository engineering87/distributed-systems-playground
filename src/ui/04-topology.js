// 04-topology.js — the graph: editing, rendering, animation and the properties bar

// ============================================================ topology
const svg = () => $('#topo');
function nodeById(id) {
  if (!S.nodeMap || S.nodeMapVer !== S.topoVer) { S.nodeMap = new Map(S.scn.nodes.map(n => [n.id, n])); S.nodeMapVer = S.topoVer; }
  return S.nodeMap.get(id);
}
function nextId() { return S.scn.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1; }
function neighborsOf(id) {
  const out = new Set();
  for (const l of S.scn.links) {
    if (l.a === id) out.add(l.b);
    else if (!l.directed && l.b === id) out.add(l.a);
  }
  return [...out].sort((a, b) => a - b);
}
function svgPoint(evt) {
  const s = svg(); const pt = s.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(s.getScreenCTM().inverse());
}
function fitView() {
  const ns = S.scn.nodes, s = svg();
  const fx = $('#topo-fx');
  if (!ns.length) { s.setAttribute('viewBox', '0 0 700 460'); fx.setAttribute('viewBox', '0 0 700 460'); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const pad = 80;
  const w = Math.max(x1 - x0 + 2 * pad, 420), h = Math.max(y1 - y0 + 2 * pad, 300);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = (cx - w / 2) + ' ' + (cy - h / 2) + ' ' + w + ' ' + h;
  s.setAttribute('viewBox', vb);
  fx.setAttribute('viewBox', vb);
}
function unit(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
function linkGeom(a, b, curved) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const [ux, uy] = unit(dx, dy);
  let cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  if (curved) { cx += -uy * 24; cy += ux * 24; }
  const sa = unit(cx - a.x, cy - a.y), sb = unit(cx - b.x, cy - b.y);
  return { x1: a.x + sa[0] * R_NODE, y1: a.y + sa[1] * R_NODE, x2: b.x + sb[0] * (R_NODE + 2), y2: b.y + sb[1] * (R_NODE + 2), cx, cy };
}
function geomPath(g) { return 'M' + g.x1 + ' ' + g.y1 + ' Q' + g.cx + ' ' + g.cy + ' ' + g.x2 + ' ' + g.y2; }
function geomAt(g, f) { const u = 1 - f; return [u * u * g.x1 + 2 * u * f * g.cx + f * f * g.x2, u * u * g.y1 + 2 * u * f * g.cy + f * f * g.y2]; }
// first part of the quadratic curve, up to parameter f (de Casteljau)
function geomPrefix(g, f) {
  const qx = g.x1 + (g.cx - g.x1) * f, qy = g.y1 + (g.cy - g.y1) * f;
  const [px, py] = geomAt(g, f);
  return 'M' + g.x1.toFixed(1) + ' ' + g.y1.toFixed(1) + ' Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + px.toFixed(1) + ' ' + py.toFixed(1);
}
function dirSet() {
  if (!V.dirSet || V.dirVer !== S.topoVer) {
    V.dirSet = new Set(S.scn.links.filter(l => l.directed).map(l => l.a + '>' + l.b));
    V.dirVer = S.topoVer;
  }
  return V.dirSet;
}
function isCurved(a, b) { const d = dirSet(); return d.has(a + '>' + b) && d.has(b + '>' + a); }
function msgGeom(m) {
  const a = nodeById(m.from), b = nodeById(m.to);
  if (!a || !b || m.from === m.to) return null;
  return linkGeom(a, b, isCurved(m.from, m.to));
}
// is process id down at time t in the last run?
function pausedAt(id, t) {
  const ps = S.res && S.res.pauses ? S.res.pauses[id] : null;
  if (!ps) return null;
  for (const p of ps) if (t >= p.from && t < p.to) return p;
  return null;
}
function downAt(id, t) {
  const d = S.res && S.res.downs[id];
  if (!d) return null;
  for (const x of d) if (t >= x.from && (x.to === null || t < x.to)) return x;
  return null;
}
// is the channel between a and b interrupted at time t in the last run?
// what is cut between a and b at time t: both directions, or only one of them
function cutAtUI(a, b, t) {
  const nf = S.res && S.res.netFaults;
  if (!nf) return null;
  let ab = false, ba = false;
  for (const l of nf.links) {
    if (t < l.from || (l.to !== null && t >= l.to)) continue;
    if (l.a === a && l.b === b) { ab = true; if (!l.oneWay) ba = true; }
    else if (l.a === b && l.b === a) { ba = true; if (!l.oneWay) ab = true; }
  }
  if (ab && ba) return 'link down';
  if (ab) return 'link down p' + a + ' → p' + b;
  if (ba) return 'link down p' + b + ' → p' + a;
  for (const p of nf.partitions) {
    if (t < p.from || (p.to !== null && t >= p.to)) continue;
    if (!p.groupOf) { p.groupOf = new Map(); p.groups.forEach((g, i) => g.forEach(id => p.groupOf.set(id, i))); }
    const ga = p.groupOf.has(a) ? p.groupOf.get(a) : -1, gb = p.groupOf.has(b) ? p.groupOf.get(b) : -1;
    if (ga !== gb) return 'partition';
  }
  return null;
}
function lastOutput(id, t) { return lastAtOrBefore(S.outIdx[id] || [], t, o => o.t); }
function snapAt(id, t) { return S.res ? lastAtOrBefore(S.res.snaps[id] || [], t, s => s.t) : null; }
function packetLabel(m) {
  const mm = /^\[([A-Z][A-Z0-9_]+)/.exec(m.payload);
  return mm ? mm[1] : truncate(m.payload, 14);
}

// ---- topology rendering
// The static part (links and process nodes) is rebuilt only when the topology, the selection or the run
// changes; on every frame the existing elements are updated in place, and the animation layers reuse
// pooled elements. This keeps playback smooth on large graphs.
const V = { key: '', nodes: new Map(), links: [], dir: new Set(), pools: {} };
function topoChanged() { S.topoVer = (S.topoVer || 0) + 1; }
function staticKey() { return String(S.topoVer || 0); }
function buildStatic() {
  const gL = $('#g-links'), gN = $('#g-nodes');
  gL.textContent = ''; gN.textContent = '';
  S.nodeMap = new Map(S.scn.nodes.map(n => [n.id, n]));
  V.dir = new Set(S.scn.links.filter(l => l.directed).map(l => l.a + '>' + l.b));
  V.links = [];
  S.scn.links.forEach((l, i) => {
    const a = nodeById(l.a), b = nodeById(l.b);
    if (!a || !b) return;
    const g = linkGeom(a, b, l.directed && isCurved(l.a, l.b));
    const d = geomPath(g);
    const path = sv('path', { d, class: 'lk' });
    const hit = sv('path', { d, class: 'lk-hit', 'data-link': i });
    const title = sv('title', {});
    hit.append(title);
    const [mx, my] = geomAt(g, 0.5);
    const mark = sv('text', { x: mx, y: my, class: 'cut-mark', display: 'none' }, '✂');
    gL.append(path, hit, mark);
    V.links.push({ l, i, path, hit, title, mark, cut: undefined, state: {} });
  });
  V.nodes = new Map();
  for (const n of S.scn.nodes) {
    const g = sv('g', { class: 'nd', 'data-node': n.id, transform: 'translate(' + n.x + ' ' + n.y + ')', tabindex: 0, role: 'button', 'aria-label': 'Process p' + n.id });
    const glow = sv('circle', { r: R_NODE + 6, class: 'glow', display: 'none' });
    const cross = sv('path', { class: 'cross', d: 'M-10 -10L10 10M10 -10L-10 10', display: 'none' });
    const icon = sv('text', { class: 'icon', x: -R_NODE - 4, y: -R_NODE + 2, display: 'none' }, '⏱');
    const pause = sv('text', { class: 'icon pause', x: R_NODE - 2, y: R_NODE + 2, display: 'none' }, '⏸');
    const out = sv('text', { class: 'out', y: R_NODE + 14, display: 'none' });
    const badge = sv('text', { class: 'badge', x: R_NODE + 3, y: -R_NODE + 2, display: 'none' });
    badge.style.textAnchor = 'start';
    g.append(glow, sv('circle', { r: R_NODE, class: 'body' }), sv('text', { class: 'name' }, 'p' + n.id), cross, icon, pause, out, badge);
    gN.append(g);
    V.nodes.set(n.id, { g, glow, cross, icon, pause, out, badge, state: {} });
  }
  V.key = staticKey();
}
// move a process and its links in place while dragging (no rebuild, so the dragged element survives)
function moveNodeDOM(n) {
  const R = V.nodes.get(n.id);
  if (R) R.g.setAttribute('transform', 'translate(' + n.x + ' ' + n.y + ')');
  for (const L of V.links) {
    if (L.l.a !== n.id && L.l.b !== n.id) continue;
    const a = nodeById(L.l.a), b = nodeById(L.l.b);
    if (!a || !b) continue;
    const g = linkGeom(a, b, L.l.directed && isCurved(L.l.a, L.l.b));
    const d = geomPath(g);
    L.path.setAttribute('d', d); L.hit.setAttribute('d', d);
    const [mx, my] = geomAt(g, 0.5);
    L.mark.setAttribute('x', mx); L.mark.setAttribute('y', my);
  }
}
// set an attribute or text only when it changes
function setIf(rec, k, el, attr, v) {
  if (rec.state[k] === v) return;
  rec.state[k] = v;
  if (attr === 'text') el.textContent = v;
  else if (attr === 'class') el.setAttribute('class', v);
  else el.setAttribute(attr, v);
}
function renderTopo() {
  if (!S.scn) return;
  if (V.key !== staticKey()) buildStatic();
  const t = S.cursor;
  for (const L of V.links) {
    const cut = S.res ? cutAtUI(L.l.a, L.l.b, t) : null;
    const sel = !!(S.selected && S.selected.type === 'link' && S.selected.idx === L.i);
    const oneWayCut = !!cut && cut !== 'link down' && cut !== 'partition';
    setIf(L, 'cls', L.path, 'class', 'lk' + (L.l.enabled ? '' : ' off') + (cut ? (oneWayCut ? ' cut half' : ' cut') : '') + (sel ? ' sel' : ''));
    if (L.l.directed) setIf(L, 'mk', L.path, 'marker-end', sel ? 'url(#arrow-sel)' : 'url(#arrow)');
    if (cut === L.cut) continue;
    L.cut = cut;
    L.mark.setAttribute('display', cut ? 'inline' : 'none');
    L.title.textContent = 'p' + L.l.a + (L.l.directed ? ' → ' : ' — ') + 'p' + L.l.b + (L.l.enabled ? '' : ' (disabled)') + (cut ? ' (' + cut + ')' : '');
  }
  const busy = busyAt(t);
  for (const [id, R] of V.nodes) {
    const crashed = !!downAt(id, t);
    const b = crashed ? null : busy.get(id);
    const base = 'nd' + (S.selected && S.selected.type === 'node' && S.selected.id === id ? ' sel' : '') + (S.linkFrom === id ? ' from' : '');
    let coneCls = '';
    if (S.cone) {
      if (id === S.cone.node) coneCls = ' origin';
      else if (t >= S.cone.future[id]) coneCls = ' influenced';
      else if (t <= S.cone.past[id]) coneCls = ' cause';
    }
    const paused = !crashed && !!pausedAt(id, t);
    setIf(R, 'cls', R.g, 'class', base + (crashed ? ' crashed' : '') + (paused ? ' paused' : '') + (b ? ' busy' : '') + coneCls);
    setIf(R, 'pause', R.pause, 'display', paused ? 'inline' : 'none');
    setIf(R, 'cross', R.cross, 'display', crashed ? 'inline' : 'none');
    if (b) {
      setIf(R, 'glow', R.glow, 'display', 'inline');
      R.glow.setAttribute('r', (R_NODE + 6 + 3 * b.strength).toFixed(1));
      R.glow.setAttribute('opacity', (0.25 + 0.55 * b.strength).toFixed(2));
    } else setIf(R, 'glow', R.glow, 'display', 'none');
    setIf(R, 'icon', R.icon, 'display', b && b.timer ? 'inline' : 'none');
    const o = S.res ? lastOutput(id, t) : null;
    setIf(R, 'outd', R.out, 'display', o ? 'inline' : 'none');
    if (o) setIf(R, 'outt', R.out, 'text', truncate(o.text, 26));
    const sn = S.res && S.res.rounds ? snapAt(id, t) : null;
    const showBadge = !!(sn && sn.round > 0);
    setIf(R, 'bd', R.badge, 'display', showBadge ? 'inline' : 'none');
    if (showBadge) {
      setIf(R, 'bdt', R.badge, 'text', 'r' + sn.round);
      setIf(R, 'bdc', R.badge, 'class', 'badge' + (b && b.round ? ' flash' : ''));
    }
  }
  renderAnim();
}

// which nodes are processing an event at time t (with a fading tail after the step ends)
function busyAt(t) {
  const out = new Map();
  if (!S.res || !S.activity.length) return out;
  const W = S.pulse;
  const lo = lowerBound(S.activity, t - S.maxBusy - W, a => a.t);
  const hi = upperBound(S.activity, t, a => a.t);
  for (let i = lo; i < hi; i++) {
    const a = S.activity[i];
    const until = Math.max(a.end, a.t + W);
    if (t > until) continue;
    const strength = t <= a.end ? 1 : 1 - (t - a.end) / Math.max(1, until - a.end);
    const cur = out.get(a.node) || { strength: 0, timer: false, round: false };
    cur.strength = Math.max(cur.strength, strength);
    if (a.type === 'timer') cur.timer = true;
    if (a.type === 'roundStart') cur.round = true;
    out.set(a.node, cur);
  }
  return out;
}

// a pool of SVG elements in one layer: take() hands out an element, finish() hides the unused ones
function pool(layerId, make) {
  let P = V.pools[layerId + ':' + make.name];
  if (!P) {
    P = V.pools[layerId + ':' + make.name] = { items: [], used: 0, layer: $(layerId) };
  }
  return {
    take() {
      let it = P.items[P.used];
      if (!it) { it = make(); P.items.push(it); P.layer.append(it.root); }
      else if (it.hidden) { it.root.removeAttribute('display'); it.hidden = false; }
      P.used++;
      return it;
    },
    finish() {
      for (let i = P.used; i < P.items.length; i++) {
        const it = P.items[i];
        if (!it.hidden) { it.root.setAttribute('display', 'none'); it.hidden = true; }
      }
      P.used = 0;
    }
  };
}
function resetPools() {
  for (const k in V.pools) { const P = V.pools[k]; P.items.forEach(it => it.root.remove()); }
  V.pools = {};
}
function mkTrail() { const root = sv('path', {}); return { root }; }
function mkPacket() {
  const root = sv('g', {});
  const rect = sv('rect', { y: -8.5, height: 17, rx: 8.5 });
  const dot = sv('circle', { r: 5.5 });
  const text = sv('text', {});
  const title = sv('title', {});
  root.append(rect, dot, text, title);
  return { root, rect, dot, text, title, s: {} };
}
function mkRing() { const root = sv('circle', {}); return { root }; }
function mkBurst() { const root = sv('path', {}); return { root }; }
function mkBubble() {
  const root = sv('g', { class: 'bubble' });
  const path = sv('path', {});
  const text = sv('text', { y: -12 });
  root.append(path, text);
  return { root, path, text, s: {} };
}

// packets in flight, trails, arrival ripples, loss marks, output bubbles, crash and recovery flashes
function renderAnim() {
  const trails = pool('#g-fx', mkTrail), rings = pool('#g-fx', mkRing);
  const packets = pool('#g-msgs', mkPacket);
  const bursts = pool('#g-top', mkBurst), bubbles = pool('#g-top', mkBubble);
  if (S.res) {
    const t = S.cursor, W = S.pulse;
    // with many packets on screen, labels and trails only add clutter and cost
    const crowd = S.lastInFlight || 0;
    const labels = $('#labels').checked && crowd <= 120;
    const layers = layersOn();
    const withTrails = crowd <= 200;
    const sel = S.selected && S.selected.type === 'msg' ? S.selected.id : null;
    const hi = upperBound(S.msgsBySend, t, m => m.sendT);
    const lo = lowerBound(S.msgsBySend, t - S.maxLat - W, m => m.sendT);
    let count = 0;
    for (let i = lo; i < hi; i++) {
      const m = S.msgsBySend[i];
      if (m.status === 'dropped-link' || m.recvT === null) continue;
      if (m.status === 'dropped-cut' && m.recvT === m.sendT) continue;
      const self = m.from === m.to;
      const inFlight = m.recvT > t && m.recvT > m.sendT;
      if (inFlight) {
        if (self || count >= 400) continue;
        const g = msgGeom(m);
        if (!g) continue;
        let f = (t - m.sendT) / (m.recvT - m.sendT);
        f = 1 - Math.pow(1 - f, 1.6);
        if (m.status === 'dropped-loss') f *= 0.5;
        if (labels) f = 0.14 + 0.72 * f;
        const cls = m.violation ? 'late' : (m.status === 'dropped-loss' || m.status === 'dropped-cut' || m.status === 'dropped-omission') ? 'lossy' : m.status === 'lost-crash' ? 'doomed' : 'ok';
        const tint = layers && cls === 'ok' ? layerColor(m.origin) : '';
        if (withTrails) {
          const tr = trails.take();
          tr.root.setAttribute('d', geomPrefix(g, f));
          tr.root.setAttribute('class', 'trail ' + cls);
          tr.root.style.stroke = tint;
        }
        const [x, y] = geomAt(g, f);
        const P = packets.take();
        P.root.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
        const pcls = 'pk ' + cls + (m.dup ? ' dup' : '') + (sel === m.id ? ' sel' : '');
        if (P.s.cls !== pcls) { P.root.setAttribute('class', pcls); P.s.cls = pcls; }
        if (P.s.tint !== tint) { P.s.tint = tint; P.rect.style.fill = tint; P.rect.style.stroke = tint; P.dot.style.fill = tint; P.dot.style.stroke = tint; }
        if (P.s.id !== m.id || P.s.labels !== labels) {
          P.s.id = m.id; P.s.labels = labels;
          P.root.setAttribute('data-msg', m.id);
          P.title.textContent = 'p' + m.from + ' → p' + m.to + ': ' + m.payload;
          if (labels) {
            const txt = packetLabel(m);
            const w = Math.max(18, txt.length * 6.7 + 12);
            P.rect.setAttribute('x', -w / 2); P.rect.setAttribute('width', w);
            P.rect.removeAttribute('display'); P.text.removeAttribute('display');
            P.dot.setAttribute('display', 'none');
            P.text.textContent = txt;
          } else {
            P.rect.setAttribute('display', 'none'); P.text.setAttribute('display', 'none');
            P.dot.removeAttribute('display');
          }
        }
        count++;
        continue;
      }
      // arrival effects within the pulse window
      const age = t - m.recvT;
      if (age < 0 || age > W) continue;
      const k = age / Math.max(1, W);
      const to = nodeById(m.to);
      if (!to) continue;
      if (m.status === 'delivered') {
        const r = rings.take().root;
        r.setAttribute('cx', to.x); r.setAttribute('cy', to.y);
        r.setAttribute('r', (R_NODE + 4 + 16 * k).toFixed(1));
        r.setAttribute('class', 'ripple' + (m.violation ? ' late' : ''));
        r.setAttribute('opacity', (1 - k).toFixed(2));
      } else {
        let x, y;
        const g = msgGeom(m);
        if (m.status === 'dropped-loss' && g) [x, y] = geomAt(g, 0.5);
        else if (g) [x, y] = geomAt(g, 1);
        else { x = to.x; y = to.y; }
        const cls = (m.status === 'dropped-loss' || m.status === 'dropped-cut' || m.status === 'dropped-omission') ? 'lossy' : m.status === 'lost-crash' ? 'doomed' : 'late';
        const sz = 5 + 4 * k;
        const b = bursts.take().root;
        b.setAttribute('d', `M${x - sz} ${y - sz}L${x + sz} ${y + sz}M${x + sz} ${y - sz}L${x - sz} ${y + sz}`);
        b.setAttribute('class', 'burst ' + cls);
        b.setAttribute('opacity', (1 - k).toFixed(2));
      }
    }
    S.lastInFlight = count;
    // output bubbles
    for (const id in S.outIdx) {
      const n = nodeById(+id);
      if (!n) continue;
      const arr = S.outIdx[id];
      const i = upperBound(arr, t, o => o.t) - 1;
      if (i < 0) continue;
      const o = arr[i];
      const age = t - o.t;
      if (age > 2.5 * W) continue;
      const k = age / Math.max(1, 2.5 * W);
      const B = bubbles.take();
      B.root.setAttribute('transform', 'translate(' + n.x + ' ' + (n.y - R_NODE - 16) + ')');
      B.root.setAttribute('opacity', (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3).toFixed(2));
      const txt = truncate(o.text, 30);
      if (B.s.txt !== txt) {
        B.s.txt = txt;
        const w = txt.length * 6.6 + 16;
        B.path.setAttribute('d', `M${-w / 2} -22 h${w} a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h${-w / 2 + 6} l-6 6 l-6 -6 h${-w / 2 + 6} a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4z`);
        B.text.textContent = txt;
      }
    }
    // crash and recovery flashes
    for (const id in S.res.downs) {
      const n = nodeById(+id);
      if (!n) continue;
      for (const d of S.res.downs[id]) {
        for (const [at, cls] of [[d.from, 'crashring'], [d.to, 'recoverring']]) {
          if (at === null) continue;
          const age = t - at;
          if (age < 0 || age > 2 * W) continue;
          const k = age / Math.max(1, 2 * W);
          const r = rings.take().root;
          r.setAttribute('cx', n.x); r.setAttribute('cy', n.y);
          r.setAttribute('r', (R_NODE + 6 + 22 * k).toFixed(1));
          r.setAttribute('class', cls);
          r.setAttribute('opacity', (1 - k).toFixed(2));
        }
      }
    }
  }
  trails.finish(); rings.finish(); packets.finish(); bursts.finish(); bubbles.finish();
}

function select(sel) {
  S.selected = sel;
  renderTopo(); renderProps();
  if (S.tab === 'state') renderInspector();
  if (S.tab === 'stack') renderStack(true);
}
function setMode(m) {
  S.mode = m; S.linkFrom = null;
  $$('.seg [data-mode]').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  syncBodyAttrs(); renderTopo(); renderProps();
}
function bindTopo() {
  const s = svg();
  let drag = null;
  // Touch: SVG children ignore touch-action, so dragging a process uses touch events, which can be
  // cancelled reliably; a swipe on the empty graph still scrolls the page.
  let tdrag = null;
  const touchPoint = t => svgPoint({ clientX: t.clientX, clientY: t.clientY });
  s.addEventListener('touchstart', e => {
    const nEl = e.target.closest('[data-node]');
    if (S.mode !== 'move' || nEl) e.preventDefault();
    if (S.mode === 'move' && nEl && e.touches.length === 1) {
      const n = nodeById(+nEl.dataset.node);
      const p = touchPoint(e.touches[0]);
      if (n) tdrag = { id: n.id, dx: n.x - p.x, dy: n.y - p.y, moved: false };
    }
  }, { passive: false });
  s.addEventListener('touchmove', e => {
    if (!tdrag) return;
    e.preventDefault();
    const n = nodeById(tdrag.id);
    if (!n) return;
    const p = touchPoint(e.touches[0]);
    n.x = Math.round(p.x + tdrag.dx); n.y = Math.round(p.y + tdrag.dy);
    tdrag.moved = true;
    moveNodeDOM(n);
    renderAnim();
  }, { passive: false });
  const tend = () => { if (tdrag && tdrag.moved) scheduleSave(); tdrag = null; };
  s.addEventListener('touchend', tend);
  s.addEventListener('touchcancel', tend);
  $('#topo-fx').addEventListener('pointerdown', e => {
    const pEl = e.target.closest('[data-msg]');
    if (!pEl) return;
    e.stopPropagation();
    // a process under the pointer wins over a packet drawn on top of it
    const pt = svgPoint(e);
    const hit = S.scn.nodes.find(n => Math.hypot(n.x - pt.x, n.y - pt.y) <= R_NODE + 2);
    if (hit) { select({ type: 'node', id: hit.id }); return; }
    stopPlay();
    select({ type: 'msg', id: +pEl.dataset.msg });
  });
  s.addEventListener('pointerdown', e => {
    const nEl = e.target.closest('[data-node]'), lEl = e.target.closest('[data-link]');
    const id = nEl ? +nEl.dataset.node : null;
    const li = lEl ? +lEl.dataset.link : null;
    if (S.mode === 'move') {
      if (id !== null) {
        select({ type: 'node', id });
        if (e.pointerType !== 'touch') {
          const p = svgPoint(e), n = nodeById(id);
          drag = { id, dx: n.x - p.x, dy: n.y - p.y, moved: false };
          s.setPointerCapture(e.pointerId);
        }
      } else if (li !== null) select({ type: 'link', idx: li });
      else select(null);
    } else if (S.mode === 'add') {
      if (id === null && li === null) { const p = svgPoint(e); addNode(Math.round(p.x), Math.round(p.y)); }
      else if (id !== null) select({ type: 'node', id });
    } else if (S.mode === 'link') {
      if (id !== null && S.linkFrom === null) S.linkFrom = id;
      else if (id !== null && S.linkFrom !== id) { const a = S.linkFrom; S.linkFrom = null; addLink(a, id); return; }
      else S.linkFrom = null;
      renderTopo(); renderProps();
    } else if (S.mode === 'delete') {
      if (id !== null) deleteNode(id);
      else if (li !== null) deleteLink(li);
    }
  });
  s.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = svgPoint(e), n = nodeById(drag.id);
    if (!n) return;
    n.x = Math.round(p.x + drag.dx); n.y = Math.round(p.y + drag.dy);
    drag.moved = true;
    moveNodeDOM(n);
    renderAnim();
  });
  const end = () => { if (drag && drag.moved) scheduleSave(); drag = null; };
  s.addEventListener('pointerup', end);
  s.addEventListener('pointercancel', end);
  s.addEventListener('keydown', e => {
    const nEl = e.target.closest && e.target.closest('[data-node]');
    if (nEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); select({ type: 'node', id: +nEl.dataset.node }); }
  });
  $$('.seg [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#btn-gen').addEventListener('click', () => generate($('#gen').value, parseInt($('#gen-n').value, 10) || 6));
  $('#btn-fit').addEventListener('click', fitView);
  $('#labels').addEventListener('change', renderAnim);
}
function topologyChanged() {
  topoChanged();
  clearResults('Topology changed: press Run to simulate again.');
  renderTopo(); renderProps(); scheduleSave();
}
function addNode(x, y) {
  const id = nextId();
  S.scn.nodes.push({ id, x, y });
  S.selected = { type: 'node', id };
  topologyChanged();
}
function addLink(a, b) {
  const directed = $('#directed').checked;
  const dup = S.scn.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a && (!l.directed || !directed)));
  if (dup) { toast('That link already exists.'); renderTopo(); renderProps(); return; }
  S.scn.links.push({ a, b, directed, enabled: true, loss: '', delay: '' });
  S.selected = { type: 'link', idx: S.scn.links.length - 1 };
  topologyChanged();
}
function deleteNode(id) {
  S.scn.nodes = S.scn.nodes.filter(n => n.id !== id);
  S.scn.links = S.scn.links.filter(l => l.a !== id && l.b !== id);
  S.scn.faults = S.scn.faults.filter(f => !faultMentions(f, id)).concat(
    S.scn.faults.filter(f => f.type === 'partition' && faultMentions(f, id)).map(f => withoutFromPartition(f, id)).filter(Boolean));
  S.selected = null;
  renderFaults();
  topologyChanged();
}
function deleteLink(i) { S.scn.links.splice(i, 1); S.selected = null; topologyChanged(); }
function groupsOf(f) { try { return C.parseGroups(f.groups); } catch (e) { return []; } }
function faultMentions(f, id) {
  if (f.type === 'link') return f.a === id || f.b === id;
  if (f.type === 'partition') return groupsOf(f).some(g => g.includes(id));
  return f.node === id;
}
function withoutFromPartition(f, id) {
  const groups = groupsOf(f).map(g => g.filter(x => x !== id)).filter(g => g.length);
  return groups.length ? Object.assign({}, f, { groups: groups.map(g => g.join(' ')).join(' | ') }) : null;
}
function describeFault(f) {
  if (f.when) {
    const lasts = f.for || f.hold ? ' for ' + (f.for || C.fmtDuration(f.hold)) : '';
    const what = f.type === 'crash' ? 'p' + f.node + ' crashes'
      : f.type === 'recover' ? 'p' + f.node + ' recovers'
        : f.type === 'pause' ? 'p' + f.node + ' pauses'
          : f.type === 'omission' ? 'p' + f.node + ' omits its ' + (f.direction || 'both')
            : f.type === 'link' ? (f.oneWay ? 'one-way link p' + f.a + ' → p' + f.b : 'link p' + f.a + '–p' + f.b) + ' goes down'
              : (f.oneWay ? 'one-way partition ' : 'partition ') + f.groups;
    return what + lasts + ' when ' + f.when;
  }
  const until = f.to ? ' until ' + f.to : ' onwards';
  switch (f.type) {
    case 'crash': return 'p' + f.node + ' crashes at ' + f.at;
    case 'recover': return 'p' + f.node + ' recovers at ' + f.at;
    case 'link': return (f.oneWay ? 'one-way link p' + f.a + ' → p' + f.b : 'link p' + f.a + '–p' + f.b) + ' down from ' + f.from + until;
    case 'pause': return 'p' + f.node + ' paused from ' + f.from + ' until ' + f.to;
    case 'omission': {
      const what = f.direction === 'send' ? 'sends' : f.direction === 'receive' ? 'receives' : 'sends and receives';
      const how = (f.prob === undefined || +f.prob >= 1) ? 'all' : Math.round(+f.prob * 100) + '% of';
      return 'p' + f.node + ' omits ' + how + ' its ' + what + ' from ' + f.from + until;
    }
    case 'partition': {
      const groups = groupsOf(f);
      const listed = new Set(groups.flat());
      const rest = S.scn.nodes.map(n => n.id).filter(id => !listed.has(id));
      const all = rest.length ? groups.concat([rest]) : groups;
      return 'partition ' + all.map(g => '{' + g.map(id => 'p' + id).join(', ') + '}').join(' | ') + ' from ' + f.from + until;
    }
  }
  return f.type;
}
// validate and add a fault; returns true on success
function addFault(f) {
  try { C.normalizeFault(f); }
  catch (e) { const m = e.message.replace(/^Fault \d*: /, ''); toast(m.charAt(0).toUpperCase() + m.slice(1) + '.'); return false; }
  const ids = f.type === 'link' ? [f.a, f.b] : f.type === 'partition' ? groupsOf(f).flat() : [f.node];
  const missing = ids.filter(id => !nodeById(id));
  if (missing.length) { toast('No such process: ' + missing.map(id => 'p' + id).join(', ')); return false; }
  S.scn.faults.push(f);
  renderFaults();
  markStale();
  return true;
}
// add a fault that starts at the cursor and continue the run from there
// build receives the cursor time as text; the cursor is rounded up to a whole microsecond
// so that, after the re-run, the fault is already in effect at the cursor
function faultHere(build, describe) {
  const resume = S.playing;
  S.cursor = Math.ceil(S.cursor);
  const f = build(fmtDurInput(S.cursor));
  if (!addFault(f)) return;
  run(true, resume);
  toast(describe + ' at ' + C.fmtDuration(S.cursor) + '.');
}
// a pause needs an end: the duration field is read as a length, one second by default
function pauseEndFrom(at, input) {
  const v = String(input.value || '').trim();
  let len = 1000000;
  if (v) { try { len = C.parseDuration(v); } catch (e) { len = 1000000; } }
  return C.fmtDuration(C.parseDuration(at) + Math.max(1, len));
}
function untilFrom(input) {
  const v = input.value.trim();
  if (!v || v === 'forever') return '';
  const d = C.parseDuration(v);
  return d === null ? '' : fmtDurInput(S.cursor + d);
}
// add an external event at the cursor and re-run, keeping the cursor (what-if)
function injectEvent(id, ev, args) {
  S.cursor = Math.ceil(S.cursor);
  const line = fmtDurInput(S.cursor) + ' ' + id + ' ' + ev + (args ? ' | ' + args : '');
  try { C.parseInputs(line); } catch (e) { toast(e.message.replace(/^Input line 1: /, '')); return; }
  const text = S.scn.inputs.replace(/\s+$/, '');
  S.scn.inputs = (text ? text + '\n' : '') + line;
  $('#inputs').value = S.scn.inputs;
  const resume = S.playing;
  run(true, resume);
  toast('Injected ' + ev + ' on p' + id + ' at ' + C.fmtDuration(S.cursor) + '.');
}
function renderProps() {
  if (!S.scn) return;
  const box = $('#props'); box.textContent = '';
  const sel = S.selected;
  if (S.mode === 'link') {
    box.append(S.linkFrom === null ? 'Click the source process, then the destination.' : 'Source: p' + S.linkFrom + '. Now click the destination (Esc to cancel).');
    return;
  }
  if (S.mode === 'add') { box.append('Click an empty spot to add a process.'); return; }
  if (S.mode === 'delete') { box.append('Click a process or a link to delete it.'); return; }
  if (!sel) {
    box.append(S.scn.nodes.length
      ? S.scn.nodes.length + ' processes, ' + S.scn.links.length + ' links. Select an element to edit it, drag processes to move them, click a message in flight to inspect it.'
      : 'No processes yet: use the Node tool or a generator.');
    return;
  }
  if (sel.type === 'msg') { renderMsgProps(box, sel.id); return; }
  if (sel.type === 'node') {
    const n = nodeById(sel.id);
    if (!n) return;
    const nb = neighborsOf(n.id);
    const own = S.scn.faults.filter(f => faultMentions(f, n.id));
    box.append(
      el('b', {}, 'p' + n.id),
      el('span', {}, nb.length ? 'neighbors: ' + nb.map(x => 'p' + x).join(', ') : 'no neighbors'),
      el('span', { class: 'hint', style: 'margin:0' }, own.length ? own.length + (own.length === 1 ? ' fault' : ' faults') + ' scheduled' : 'no faults scheduled'),
      el('button', { type: 'button', class: 'ghost', onclick: () => deleteNode(n.id) }, 'Delete')
    );
    if (S.res) {
      const row = el('div', { class: 'inject' });
      row.append(el('span', { class: 'lbl' }, 'At ' + C.fmtDuration(S.cursor) + ':'));
      if (S.topReqs.length) {
        const evSel = el('select', { 'aria-label': 'Event to inject' });
        for (const r of S.topReqs) evSel.append(el('option', { value: r.name }, r.name + (r.arity ? '(' + r.arity + ')' : '')));
        const args = el('input', { placeholder: 'arguments, e.g. "hello"', 'aria-label': 'Event arguments', style: 'width:170px' });
        const sync = () => { const r = S.topReqs.find(x => x.name === evSel.value); args.disabled = !r || r.arity === 0; };
        evSel.addEventListener('change', sync); sync();
        const go = () => injectEvent(n.id, evSel.value, args.disabled ? '' : args.value.trim());
        args.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        row.append(evSel, args, el('button', { type: 'button', class: 'primary small', onclick: go }, 'Inject event'));
      }
      if (downAt(n.id, S.cursor)) {
        row.append(el('button', { type: 'button', class: 'ghost small', 'data-down': '1',
          onclick: () => faultHere(at => ({ type: 'recover', node: n.id, at }), 'p' + n.id + ' recovers') }, 'Recover here'));
      } else {
        row.append(el('button', { type: 'button', class: 'ghost small', 'data-down': '0',
          onclick: () => faultHere(at => ({ type: 'crash', node: n.id, at }), 'p' + n.id + ' crashes') }, 'Crash here'));
      }
      const iso = el('input', { class: 'narrow', value: '2s', placeholder: 'forever', 'aria-label': 'Isolation duration', title: 'Duration, empty for forever' });
      row.append(el('span', { class: 'sep' }), iso, el('button', { type: 'button', class: 'ghost small',
        onclick: () => faultHere(at => ({ type: 'partition', groups: String(n.id), from: at, to: untilFrom(iso) }),
          'p' + n.id + ' is isolated') }, 'Isolate here'),
        el('button', { type: 'button', class: 'ghost small', title: 'Stop processing for that long, without losing anything',
          onclick: () => faultHere(at => ({ type: 'pause', node: n.id, from: at, to: pauseEndFrom(at, iso) }), 'p' + n.id + ' pauses') }, 'Pause here'));
      box.append(row);
    }
    return;
  }
  const l = S.scn.links[sel.idx];
  if (!l) return;
  const en = el('input', { type: 'checkbox' }); en.checked = l.enabled;
  en.addEventListener('change', () => { l.enabled = en.checked; topoChanged(); renderTopo(); markStale(); });
  const dir = el('input', { type: 'checkbox' }); dir.checked = l.directed;
  dir.addEventListener('change', () => { l.directed = dir.checked; topologyChanged(); });
  const loss = el('input', { class: 'narrow', value: l.loss || '', placeholder: 'global', 'aria-label': 'Link loss' });
  loss.addEventListener('input', () => {
    const v = loss.value.trim();
    const err = v === '' ? null : validate('prob', v);
    loss.setAttribute('aria-invalid', err ? 'true' : 'false'); loss.title = err || '';
    if (!err) { l.loss = v; markStale(); }
  });
  const delay = el('input', { value: l.delay || '', placeholder: 'global', style: 'width:160px', 'aria-label': 'Link delay' });
  delay.addEventListener('input', () => {
    const v = delay.value.trim();
    const err = v === '' ? null : validate('dist', v);
    delay.setAttribute('aria-invalid', err ? 'true' : 'false'); delay.title = err || '';
    if (!err) { l.delay = v; markStale(); }
  });
  let cutRow = null;
  if (S.res) {
    const dur = el('input', { class: 'narrow', value: '1s', placeholder: 'forever', 'aria-label': 'Link failure duration', title: 'Duration, empty for forever' });
    cutRow = el('div', { class: 'inject' },
      el('span', { class: 'lbl' }, 'At ' + C.fmtDuration(S.cursor) + ':'),
      el('span', {}, 'take the link down for'), dur,
      el('button', { type: 'button', class: 'ghost small',
        onclick: () => faultHere(at => ({ type: 'link', a: l.a, b: l.b, from: at, to: untilFrom(dur) }),
          'Link p' + l.a + '–p' + l.b + ' goes down') }, 'Cut here'));
  }
  box.append(
    el('b', {}, 'p' + l.a + (l.directed ? ' → ' : ' — ') + 'p' + l.b),
    el('label', { class: 'check', title: 'Unchecked: the link is down for the whole run' }, en, 'Enabled'),
    el('label', { class: 'check' }, dir, 'Directed'),
    el('label', { class: 'field' }, el('span', {}, 'Loss'), loss),
    el('label', { class: 'field' }, el('span', {}, 'Delay'), delay),
    el('button', { type: 'button', class: 'ghost', onclick: () => deleteLink(sel.idx) }, 'Delete'),
    cutRow
  );
}
function renderMsgProps(box, id) {
  const m = S.msgById.get(id);
  if (!m) { box.append('This message is not part of the current run.'); return; }
  const extra = [];
  if (m.violation) extra.push('violates the assumed model');
  if (m.dup) extra.push('duplicate');
  box.append(
    el('b', {}, 'p' + m.from + ' → p' + m.to),
    el('code', { class: 'payload' }, m.payload),
    el('span', {}, STATUS_TEXT[m.status] + (extra.length ? ', ' + extra.join(', ') : '')),
    el('span', { class: 'hint', style: 'margin:0' }, 'sent ' + C.fmtDuration(m.sendT) +
      (m.recvT !== null ? ', arrives ' + C.fmtDuration(m.recvT) + ' (delay ' + C.fmtDuration(m.recvT - m.sendT) + ')' : '') +
      (m.round ? ', round ' + m.round : '')),
    el('button', { type: 'button', class: 'ghost small', onclick: () => { stopPlay(); setCursor(m.sendT); } }, 'Go to send'),
    m.recvT !== null ? el('button', { type: 'button', class: 'ghost small', onclick: () => { stopPlay(); setCursor(m.recvT); } }, 'Go to arrival') : null
  );
}
function generate(kind, n) {
  n = Math.max(2, Math.min(40, n | 0));
  const directed = $('#directed').checked;
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const links = [];
  const L = (a, b, d) => links.push({ a, b, directed: !!d, enabled: true, loss: '', delay: '' });
  const cx = 350, cy = 240, rad = Math.max(130, n * 17);
  let nodes;
  switch (kind) {
    case 'ring':
      nodes = EX.ringLayout(ids, cx, cy, rad);
      ids.forEach((id, i) => L(id, ids[(i + 1) % n], directed));
      if (n === 2) links.pop();
      break;
    case 'complete':
      nodes = EX.ringLayout(ids, cx, cy, rad);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) L(ids[i], ids[j], false);
      break;
    case 'star':
      nodes = [{ id: 1, x: cx, y: cy }].concat(EX.ringLayout(ids.slice(1), cx, cy, Math.max(140, n * 15)));
      ids.slice(1).forEach(id => L(1, id, directed));
      break;
    case 'line':
      nodes = ids.map((id, i) => ({ id, x: 80 + i * 110, y: cy }));
      ids.slice(1).forEach((id, i) => L(ids[i], id, directed));
      break;
    case 'grid': {
      const w = Math.ceil(Math.sqrt(n));
      nodes = ids.map((id, i) => ({ id, x: 90 + (i % w) * 130, y: 80 + Math.floor(i / w) * 120 }));
      ids.forEach((id, i) => {
        if ((i + 1) % w !== 0 && i + 1 < n) L(id, id + 1, false);
        if (i + w < n) L(id, id + w, false);
      });
      break;
    }
    case 'tree': {
      const levels = Math.floor(Math.log2(n)) + 1;
      const width = Math.max(600, Math.pow(2, levels - 1) * 80);
      nodes = ids.map((id, i) => {
        const lv = Math.floor(Math.log2(i + 1));
        const first = Math.pow(2, lv) - 1, cnt = Math.pow(2, lv);
        return { id, x: Math.round(60 + (i - first + 0.5) * width / cnt), y: 70 + lv * 100 };
      });
      ids.slice(1).forEach(id => L(Math.floor((id - 2) / 2) + 1, id, directed));
      break;
    }
    default: { // connected random graph
      let st = ((S.scn.seed >>> 0) || 1) % 233280;
      const rnd = () => (st = (st * 9301 + 49297) % 233280) / 233280;
      nodes = EX.ringLayout(ids, cx, cy, rad);
      for (let i = 1; i < n; i++) L(ids[Math.floor(rnd() * i)], ids[i], false);
      const p = Math.min(0.35, 2.5 / n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (links.some(l => (l.a === ids[i] && l.b === ids[j]) || (l.a === ids[j] && l.b === ids[i]))) continue;
        if (rnd() < p) L(ids[i], ids[j], false);
      }
    }
  }
  S.scn.nodes = nodes; S.scn.links = links;
  const valid = new Set(ids);
  S.scn.faults = S.scn.faults.filter(f =>
    f.type === 'link' ? valid.has(f.a) && valid.has(f.b)
    : f.type === 'partition' ? groupsOf(f).flat().every(id => valid.has(id))
    : valid.has(f.node));
  S.selected = null;
  renderFaults(); fitView(); topologyChanged();
}
function renderFaults() {
  const ul = $('#faults'); ul.textContent = '';
  if (!S.scn.faults.length) ul.append(el('li', {}, el('span', { class: 'hint' }, 'No faults scheduled.')));
  S.scn.faults.forEach((f, i) => ul.append(el('li', {},
    el('span', { class: 'ft-' + f.type }, describeFault(f)),
    el('button', { type: 'button', class: 'ghost small', onclick: () => { S.scn.faults.splice(i, 1); renderFaults(); markStale(); renderProps(); } }, 'Remove'))));
}
