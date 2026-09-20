// 11-images.js — exporting the diagram and the graph as images

// ============================================================ images
// A recorder with the subset of the Canvas 2D API used by the diagram, producing SVG.
class SvgPath {
  constructor() { this.d = ''; }
  moveTo(x, y) { this.d += 'M' + r2(x) + ' ' + r2(y); }
  lineTo(x, y) { this.d += 'L' + r2(x) + ' ' + r2(y); }
  quadraticCurveTo(cx, cy, x, y) { this.d += 'Q' + r2(cx) + ' ' + r2(cy) + ' ' + r2(x) + ' ' + r2(y); }
  closePath() { this.d += 'Z'; }
  rect(x, y, w, h) { this.d += 'M' + r2(x) + ' ' + r2(y) + 'h' + r2(w) + 'v' + r2(h) + 'h' + r2(-w) + 'Z'; }
  arc(x, y, r) { this.d += 'M' + r2(x + r) + ' ' + r2(y) + 'A' + r2(r) + ' ' + r2(r) + ' 0 1 0 ' + r2(x - r) + ' ' + r2(y) + 'A' + r2(r) + ' ' + r2(r) + ' 0 1 0 ' + r2(x + r) + ' ' + r2(y); }
}
function r2(v) { return Math.round(v * 100) / 100; }
function xmlEsc(v) { return String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
class SvgCtx {
  constructor() {
    this.out = []; this.path = new SvgPath(); this.stack = []; this.clipN = 0; this.open = 0;
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.globalAlpha = 1;
    this.font = '11px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.dash = [];
    this.measure = document.createElement('canvas').getContext('2d');
  }
  setTransform() {}
  setLineDash(d) { this.dash = d.slice(); }
  save() { this.stack.push({ f: this.fillStyle, s: this.strokeStyle, w: this.lineWidth, a: this.globalAlpha, font: this.font, ta: this.textAlign, tb: this.textBaseline, d: this.dash, open: this.open }); }
  restore() {
    const st = this.stack.pop();
    if (!st) return;
    while (this.open > st.open) { this.out.push('</g>'); this.open--; }
    this.fillStyle = st.f; this.strokeStyle = st.s; this.lineWidth = st.w; this.globalAlpha = st.a;
    this.font = st.font; this.textAlign = st.ta; this.textBaseline = st.tb; this.dash = st.d;
  }
  beginPath() { this.path = new SvgPath(); }
  moveTo(x, y) { this.path.moveTo(x, y); }
  lineTo(x, y) { this.path.lineTo(x, y); }
  quadraticCurveTo(a, b, c, d) { this.path.quadraticCurveTo(a, b, c, d); }
  closePath() { this.path.closePath(); }
  rect(x, y, w, h) { this.path.rect(x, y, w, h); }
  arc(x, y, r) { this.path.arc(x, y, r); }
  clip() {
    const id = 'c' + (++this.clipN);
    this.out.push('<clipPath id="' + id + '"><path d="' + xmlEsc(this.path.d) + '"/></clipPath><g clip-path="url(#' + id + ')">');
    this.open++;
  }
  alpha() { return this.globalAlpha < 1 ? ' opacity="' + r2(this.globalAlpha) + '"' : ''; }
  stroke(p) {
    const d = (p || this.path).d;
    if (!d) return;
    this.out.push('<path d="' + xmlEsc(d) + '" fill="none" stroke="' + xmlEsc(this.strokeStyle) + '" stroke-width="' + r2(this.lineWidth) + '"' +
      (this.dash.length ? ' stroke-dasharray="' + this.dash.map(r2).join(' ') + '"' : '') + ' stroke-linecap="round"' + this.alpha() + '/>');
  }
  fill(p) {
    const d = (p || this.path).d;
    if (d) this.out.push('<path d="' + xmlEsc(d) + '" fill="' + xmlEsc(this.fillStyle) + '"' + this.alpha() + '/>');
  }
  fillRect(x, y, w, h) {
    this.out.push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" fill="' + xmlEsc(this.fillStyle) + '"' + this.alpha() + '/>');
  }
  measureText(t) { this.measure.font = this.font; return this.measure.measureText(t); }
  fillText(t, x, y) {
    const m = /^(?:(\d+)\s+)?([\d.]+)px\s+(.*)$/.exec(this.font) || [];
    const anchor = { center: 'middle', right: 'end', end: 'end' }[this.textAlign] || 'start';
    const base = this.textBaseline === 'middle' ? ' dominant-baseline="central"' : '';
    this.out.push('<text x="' + r2(x) + '" y="' + r2(y) + '" fill="' + xmlEsc(this.fillStyle) + '" font-size="' + (Number(m[2]) || 11) + '"' +
      (m[1] ? ' font-weight="' + Number(m[1]) + '"' : '') + ' font-family="' + xmlEsc(m[3] || 'sans-serif') + '" text-anchor="' + anchor + '"' + base + this.alpha() + '>' + xmlEsc(t) + '</text>');
  }
  svg(W, H) {
    while (this.open > 0) { this.out.push('</g>'); this.open--; }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + this.out.join('') + '</svg>';
  }
}
function diagramWidth() { return Math.max(600, $('#st-wrap').clientWidth || 900); }
function exportName(ext, what) {
  const base = (S.scn.top || 'scenario').replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
  return base + '-' + what + '-seed' + S.scn.seed + '.' + ext;
}
function diagramSvg() {
  const W = diagramWidth();
  const c = new SvgCtx();
  drawDiagram({ ctx: c, W, Path2D: SvgPath });
  return c.svg(W, diagramHeight());
}
function diagramPng() {
  const W = diagramWidth(), H = diagramHeight(), k = 2;
  const cv = document.createElement('canvas');
  cv.width = W * k; cv.height = H * k;
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawDiagram({ ctx, W });
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
// Elements and attributes an exported graph may contain. Anything else, including every event handler, is
// dropped while copying, so the result is safe by construction instead of being cleaned up afterwards.
const SVG_TAGS = new Set(['svg', 'g', 'defs', 'marker', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect', 'text', 'tspan', 'clippath']);
const SVG_ATTRS = new Set(['viewbox', 'width', 'height', 'xmlns', 'x', 'y', 'dx', 'dy', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing',
  'id', 'marker-end', 'marker-start', 'markerwidth', 'markerheight', 'refx', 'refy', 'orient', 'markerunits', 'clip-path', 'display']);
// url(...) may only point at a fragment of the same file, never at another document or a script
function safeAttrValue(v) { return !/url\s*\(/i.test(v) || /^url\(\s*['"]?#/i.test(String(v).trim()); }

// the graph: both SVG layers merged, with computed styles written inline
function graphSvg() {
  const src = [$('#topo'), $('#topo-fx')];
  const vb = src[0].getAttribute('viewBox') || '0 0 700 460';
  const [, , w, h] = vb.split(/\s+/).map(Number);
  const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'opacity',
    'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'];
  const out = document.createElementNS(SVGNS, 'svg');
  out.setAttribute('xmlns', SVGNS);
  out.setAttribute('viewBox', vb);
  out.setAttribute('width', Math.round(w));
  out.setAttribute('height', Math.round(h));
  const [vx, vy] = vb.split(/\s+/).map(Number);
  const bg = document.createElementNS(SVGNS, 'rect');
  bg.setAttribute('x', vx); bg.setAttribute('y', vy); bg.setAttribute('width', w); bg.setAttribute('height', h);
  bg.setAttribute('fill', S.colors.paper || '#ffffff');
  out.append(bg);
  const copy = (node, parent) => {
    if (node.nodeType === 3) { parent.append(node.textContent); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (!SVG_TAGS.has(tag)) return;
    if (node.id === 'topo-bg' || node.classList.contains('lk-hit')) return;
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || node.getAttribute('display') === 'none') return;
    const el2 = document.createElementNS(SVGNS, tag);
    for (const a of node.attributes) {
      const n = a.name.toLowerCase();
      if (!SVG_ATTRS.has(n) || !safeAttrValue(a.value)) continue;
      el2.setAttribute(n, a.value);
    }
    if (tag !== 'g' && tag !== 'svg' && tag !== 'defs' && tag !== 'marker') {
      for (const pr of props) {
        const v = cs.getPropertyValue(pr);
        if (!SVG_ATTRS.has(pr) || !safeAttrValue(v)) continue;
        if (v && v !== 'none' || pr === 'fill') el2.setAttribute(pr, v);
      }
    }
    parent.append(el2);
    for (const ch of node.childNodes) copy(ch, el2);
  };
  for (const s of src) for (const ch of s.childNodes) copy(ch, out);
  return new XMLSerializer().serializeToString(out);
}
async function exportImage(kind) {
  const msg = $('#export-msg');
  if (!S.res && kind !== 'graph-svg') { msg.textContent = T('Run the simulation first.'); return; }
  try {
    if (kind === 'diagram-svg') await saveFile(exportName('svg', 'diagram'), diagramSvg(), 'image/svg+xml', msg);
    else if (kind === 'diagram-png') await saveFile(exportName('png', 'diagram'), await diagramPng(), 'image/png', msg);
    else await saveFile(exportName('svg', 'graph'), graphSvg(), 'image/svg+xml', msg);
  } catch (e) { msg.textContent = 'Could not create the image: ' + e.message; }
}
