#!/usr/bin/env node
/* Draws the diagrams of the documentation.

     node scripts/make-diagrams.mjs            writes docs/assets/diagram-*.svg
     node scripts/make-diagrams.mjs --check    fails if a file on disk is not what this script draws

   They are generated rather than drawn by hand for the same reason index.html is: one description,
   two themes, and no way for the picture to drift from what it describes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'assets');
const C = require(join(root, 'src', 'core.js'));
const { EXAMPLES } = require(join(root, 'src', 'examples.js'));
const { PROTOCOLS } = require(join(root, 'scripts', 'protocols.cjs'));

// the palette of the application, so a diagram never looks foreign next to a screenshot
const THEMES = {
  light: { bg: '#ffffff', panel: '#f6f9fa', rule: '#c5d1d8', grid: '#dfe7eb', ink: '#17283a', muted: '#56687a',
    blue: '#2350a3', blueSoft: '#e3ebf8', green: '#0c7760', greenSoft: '#dff1ec', amber: '#b36d0b',
    amberSoft: '#fbeed8', red: '#c1283b', redSoft: '#fae1e4', violet: '#6f42c1', violetSoft: '#ece5f8' },
  dark: { bg: '#0f171e', panel: '#151f29', rule: '#3a4f63', grid: '#233140', ink: '#e8eef4', muted: '#9fb0c0',
    blue: '#86aef0', blueSoft: '#1b2a41', green: '#4cc2a5', greenSoft: '#14302b', amber: '#e2a74a',
    amberSoft: '#33260f', red: '#f0808f', redSoft: '#331b20', violet: '#b79bf0', violetSoft: '#241c38' }
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const F = 'ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
const M = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// Every label is recorded as it is drawn, so svg() can refuse a picture whose text runs off the edge.
// A label placed by hand is easy to get wrong; a label that leaves the frame is always wrong.
let drawn = [];
function text(x, y, s, o = {}) {
  const anchor = o.anchor || 'middle';
  const width = String(s).length * (o.size || 13) * 0.55;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  drawn.push({ label: String(s).slice(0, 40), x0, x1: x0 + width, y0: y - (o.size || 13), y1: y + 4 });
  return `<text x="${x}" y="${y}" font-family="${o.mono ? M : F}" font-size="${o.size || 13}"` +
    ` font-weight="${o.weight || 400}" fill="${o.fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}

// a rounded box with a title, optional subtitle and an accent colour
function box(t, x, y, w, h, title, sub, accent, opts = {}) {
  const fill = opts.fill || t.panel;
  const lines = [];
  lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opts.rx || 10}" fill="${fill}" stroke="${accent}" stroke-width="${opts.strong ? 2 : 1.25}"/>`);
  if (accent && !opts.noBar) lines.push(`<rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${accent}"/>`);
  const cx = x + w / 2;
  if (sub) {
    lines.push(text(cx, y + h / 2 - 3, title, { fill: t.ink, size: opts.size || 13.5, weight: 600, mono: opts.mono }));
    lines.push(text(cx, y + h / 2 + 14, sub, { fill: t.muted, size: 11.5 }));
  } else {
    lines.push(text(cx, y + h / 2 + 4.5, title, { fill: t.ink, size: opts.size || 13.5, weight: 600, mono: opts.mono }));
  }
  return lines.join('\n  ');
}

function arrow(t, x1, y1, x2, y2, color, opts = {}) {
  const dash = opts.dash ? ` stroke-dasharray="${opts.dash}"` : '';
  const id = opts.head || 'head';
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="${opts.w || 1.8}" fill="none"${dash} marker-end="url(#${id})"/>`;
}

function defs(t) {
  return `<defs>
    <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${t.muted}"/>
    </marker>
    <marker id="head-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${t.blue}"/>
    </marker>
    <marker id="head-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${t.green}"/>
    </marker>
    <marker id="head-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${t.red}"/>
    </marker>
  </defs>`;
}

function svg(t, w, h, label, body) {
  const out = drawn.filter(d => d.x0 < -1 || d.x1 > w + 1 || d.y0 < -1 || d.y1 > h + 1);
  drawn = [];
  if (out.length) {
    throw new Error(`"${label.slice(0, 40)}…": ${out.length} label(s) outside the frame, first: "${out[0].label}"`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
  <rect width="${w}" height="${h}" rx="14" fill="${t.bg}"/>
  ${defs(t)}
  ${body}
</svg>
`;
}

// ---------------------------------------------------------------- 1. what a run is made of
function pipeline(t) {
  const W = 1180, H = 342;
  const y = 96, h = 62;
  const stages = [
    ['Upon code', 'what you write', t.blue],
    ['lexer, parser', 'tokens, tree', t.blue],
    ['checker', 'errors before running', t.blue],
    ['interpreter', 'one handler, one step', t.violet],
    ['engine', 'events in virtual time', t.violet]
  ];
  const parts = [];
  parts.push(text(40, 44, 'From the code you write to the run you watch', { anchor: 'start', fill: t.ink, size: 17, weight: 700 }));
  parts.push(text(40, 66, 'Everything below the dotted line is data: the run is computed first, then replayed.', { anchor: 'start', fill: t.muted, size: 12.5 }));
  let x = 40;
  const w = 188, gap = 24;
  stages.forEach(([title, sub, accent], i) => {
    parts.push(box(t, x, y, w, h, title, sub, accent));
    if (i < stages.length - 1) parts.push(arrow(t, x + w + 4, y + h / 2, x + w + gap - 6, y + h / 2, t.muted));
    x += w + gap;
  });

  // the two dials that feed the engine
  const dialY = y + h + 44;
  parts.push(box(t, 40, dialY, 396, 52, 'what the algorithm assumes', 'timing model, DELTA, PHI, RHO, rounds', t.green, { fill: t.greenSoft }));
  parts.push(box(t, 456, dialY, 396, 52, 'what the network actually does', 'delays, loss, drift, faults, partitions', t.amber, { fill: t.amberSoft }));
  parts.push(arrow(t, 238, dialY - 4, 238, y + h + 8, t.green, { head: 'head-green' }));
  parts.push(arrow(t, 654, dialY - 4, 654, y + h + 8, t.amber, { head: 'head-red' }));
  parts.push(text(872, dialY + 22, 'where they disagree,', { anchor: 'start', fill: t.red, size: 12.5, weight: 600 }));
  parts.push(text(872, dialY + 38, 'the run records a violation', { anchor: 'start', fill: t.muted, size: 12.5 }));

  // the result and the views built from it
  const resY = dialY + 88;
  parts.push(`<line x1="40" y1="${resY - 16}" x2="${W - 40}" y2="${resY - 16}" stroke="${t.rule}" stroke-width="1" stroke-dasharray="4 5"/>`);
  const results = ['messages', 'event log', 'state per step', 'properties', 'activity'];
  let rx = 40;
  const rw = 152;
  results.forEach(name => {
    parts.push(box(t, rx, resY, rw, 44, name, null, t.rule, { fill: t.bg, size: 12.5, noBar: true, rx: 8 }));
    rx += rw + 16;
  });
  parts.push(text(W - 40, resY + 28, 'graph · diagram · stack · log', { anchor: 'end', fill: t.muted, size: 12.5 }));
  return svg(t, W, H, 'How a run is produced: code becomes tokens, a tree and checks, then the interpreter and the engine turn it into messages, a log, state, properties and activity, with the assumed timing model and the actual network as two separate inputs', parts.join('\n  '));
}

// ---------------------------------------------------------------- 2. the pieces of the project
function architecture(t) {
  const W = 1180, H = 446;
  const parts = [];
  parts.push(text(40, 44, 'One engine, four ways to use it', { anchor: 'start', fill: t.ink, size: 17, weight: 700 }));
  parts.push(text(40, 66, 'No dependencies, no build step to run it: the sources are bundled into a single page and a docs site.', { anchor: 'start', fill: t.muted, size: 12.5 }));

  // core column
  parts.push(box(t, 40, 96, 300, 200, '', null, t.rule, { fill: t.panel, noBar: true, rx: 12 }));
  parts.push(text(190, 120, 'engine and libraries', { fill: t.muted, size: 12, weight: 600 }));
  const core = [['core.js', 'language, engine, causality'], ['runner.js', 'batches, profiles, shrinking'],
    ['library.js', 'communication modules'], ['examples.js', 'scenarios and presets']];
  core.forEach(([name, sub], i) => {
    const y = 136 + i * 40;
    parts.push(`<rect x="58" y="${y}" width="264" height="32" rx="8" fill="${t.bg}" stroke="${t.violet}" stroke-width="1.25"/>`);
    parts.push(text(72, y + 20, name, { anchor: 'start', fill: t.ink, size: 12.5, weight: 600, mono: true }));
    parts.push(text(310, y + 20, sub, { anchor: 'end', fill: t.muted, size: 10.5 }));
  });

  // consumers
  const cons = [
    ['the page', 'src/ui/ · 13 files by area', t.blue, 96],
    ['workers', 'batches and profiles, off the main thread', t.blue, 176],
    ['command line', 'bin/dsp.mjs · npx', t.green, 256],
    ['tests', '102 Node · 298 in the browser', t.amber, 330]
  ];
  cons.forEach(([title, sub, accent, y]) => {
    parts.push(box(t, 470, y, 330, 60, title, sub, accent));
    parts.push(arrow(t, 344, 196, 462, y + 30, t.muted, { w: 1.4 }));
  });

  // build outputs
  parts.push(box(t, 860, 96, 280, 60, 'index.html', 'the whole application, one file', t.blue, { mono: false }));
  parts.push(box(t, 860, 176, 280, 60, 'manual/', 'the documentation site', t.blue));
  parts.push(box(t, 860, 256, 280, 60, 'npm package', 'the command line, published', t.green));
  parts.push(arrow(t, 804, 126, 854, 126, t.muted, { w: 1.4 }));
  parts.push(arrow(t, 804, 206, 854, 206, t.muted, { w: 1.4 }));
  parts.push(arrow(t, 804, 286, 854, 286, t.muted, { w: 1.4 }));
  parts.push(text(1000, 348, 'scripts/build.mjs and build-docs.mjs', { fill: t.muted, size: 11.5, mono: true }));
  parts.push(`<line x1="40" y1="${H - 44}" x2="${W - 40}" y2="${H - 44}" stroke="${t.rule}" stroke-width="1" stroke-dasharray="4 5"/>`);
  parts.push(text(40, H - 26, 'src/ is the source; everything on the right is produced by the build', { anchor: 'start', fill: t.muted, size: 12 }));
  parts.push(text(W - 40, H - 26, 'and committed, so GitHub Pages can serve them', { anchor: 'end', fill: t.muted, size: 12 }));
  return svg(t, W, H, 'The pieces of the project: core, runner, library and examples feed the page, the workers, the command line and the tests, and the build produces index.html, the documentation site and the npm package', parts.join('\n  '));
}

// ---------------------------------------------------------------- 3. the layers a message goes through
function layers(t) {
  const W = 1180, H = 396;
  const parts = [];
  parts.push(text(40, 44, 'A message goes down the stack and up the other side', { anchor: 'start', fill: t.ink, size: 17, weight: 700 }));
  parts.push(text(40, 66, 'Each module trusts the one below and offers a stronger promise to the one above.', { anchor: 'start', fill: t.muted, size: 12.5 }));

  const rows = [
    ['your algorithm', 'Broadcast, Deliver', t.violet],
    ['causal or FIFO broadcast', 'orders what the sender ordered', t.blue],
    ['reliable broadcast', 'all or none, even if the sender crashes', t.blue],
    ['perfect links', 'no loss, no duplicates', t.green],
    ['the network', 'delay, loss, duplication, partitions', t.amber]
  ];
  const x1 = 90, y0 = 100, h = 44, gap = 10;
  rows.forEach(([title, sub, accent], i) => {
    const y = y0 + i * (h + gap);
    parts.push(box(t, x1, y, 430, h, title, null, accent, { size: 13 }));
    parts.push(text(620, y + h / 2 + 4, sub, { anchor: 'start', fill: t.muted, size: 12 }));
  });
  // the descent and the ascent
  const bottom = y0 + 4 * (h + gap) + h;
  parts.push(arrow(t, 68, y0 + 10, 68, bottom - 10, t.blue, { head: 'head-blue', w: 2 }));
  parts.push(text(68, y0 - 12, 'send', { anchor: 'middle', fill: t.blue, size: 12, weight: 600 }));
  parts.push(arrow(t, 552, bottom - 10, 552, y0 + 10, t.green, { head: 'head-green', w: 2 }));
  parts.push(text(552, y0 - 12, 'deliver', { anchor: 'middle', fill: t.green, size: 12, weight: 600 }));
  parts.push(text(40, H - 24, 'the stack view of the page follows one message through exactly these boxes', { anchor: 'start', fill: t.muted, size: 12 }));
  return svg(t, W, H, 'The layers a message goes through: your algorithm over causal or FIFO broadcast, over reliable broadcast, over perfect links, over the network, with send going down and deliver coming up', parts.join('\n  '));
}

// ---------------------------------------------------------------- 4. the loop from a question to an answer
function verification(t) {
  const W = 1180, H = 310;
  const parts = [];
  parts.push(text(40, 44, 'From "does it work?" to "here is the fault that breaks it"', { anchor: 'start', fill: t.ink, size: 17, weight: 700 }));
  parts.push(text(40, 66, 'Every step is reproducible from a seed, in the page and on the command line.', { anchor: 'start', fill: t.muted, size: 12.5 }));
  const steps = [
    ['scenario', 'code, topology, model', t.blue],
    ['properties', 'checked after every step', t.violet],
    ['batch', 'hundreds of seeds, faults drawn', t.violet],
    ['profile', 'one row per fault condition', t.green],
    ['shrink', 'the faults that are enough', t.amber]
  ];
  let x = 40;
  const w = 206, gap = 26, y = 108, h = 66;
  steps.forEach(([title, sub, accent], i) => {
    parts.push(box(t, x, y, w, h, title, sub, accent, { strong: i === 3 }));
    if (i < steps.length - 1) parts.push(arrow(t, x + w + 4, y + h / 2, x + w + gap - 6, y + h / 2, t.muted));
    x += w + gap;
  });
  // the loop back
  const lastX = 40 + 4 * (w + gap) + w;
  parts.push(`<path d="M${lastX - 60} ${y + h + 6} C ${lastX - 60} ${y + h + 46}, 160 ${y + h + 46}, 160 ${y + h + 8}" stroke="${t.red}" stroke-width="1.8" fill="none" marker-end="url(#head-red)"/>`);
  parts.push(text((lastX + 160) / 2 - 40, y + h + 74, 'open the seed, watch it happen, fix the algorithm', { fill: t.red, size: 12.5, weight: 600 }));
  return svg(t, W, H, 'The verification loop: a scenario declares properties, a batch runs it over many seeds with random faults, a profile summarizes the conditions it survives, shrinking reduces a failing schedule, and the failing seed goes back into the page', parts.join('\n  '));
}

// ---------------------------------------------------------------- one schematic per algorithm
// Not a trace of one run: the shape of the protocol. Roles as lifelines, phases down the left,
// messages as labelled arrows, and the one sentence that says why it works.
function protocol(t, spec) {
  const roles = spec.roles;
  const W = 1180, top = 118, laneW = (W - 220) / roles.length;
  const stepH = 46;
  // the closing line carries the reason and the cost; when they do not fit side by side, the cost wraps
  const wide = (spec.why.length + (spec.cost || '').length) * 6.4 > W - 120;
  const H = top + spec.steps.length * stepH + 96 + (wide ? 20 : 0);
  const x = i => 150 + laneW * (i + 0.5);
  const parts = [];

  parts.push(text(40, 44, spec.title, { anchor: 'start', fill: t.ink, size: 16, weight: 700 }));
  parts.push(text(40, 66, spec.subtitle, { anchor: 'start', fill: t.muted, size: 12.5 }));

  // lifelines
  const bottom = top + spec.steps.length * stepH + 14;
  roles.forEach((role, i) => {
    const cx = x(i);
    const w = Math.min(laneW - 18, 230);
    parts.push(`<rect x="${cx - w / 2}" y="${top - 34}" width="${w}" height="30" rx="8" fill="${t.panel}" stroke="${role.accent || t.blue}" stroke-width="1.4"/>`);
    parts.push(text(cx, top - 14, role.name, { fill: t.ink, size: 12.5, weight: 600 }));
    parts.push(`<line x1="${cx}" y1="${top}" x2="${cx}" y2="${bottom}" stroke="${t.grid}" stroke-width="1.5"/>`);
    if (role.note) parts.push(text(cx, bottom + 22, role.note, { fill: t.muted, size: 11 }));
  });

  // phases down the left
  let phaseTop = null, phaseName = null;
  const closePhase = (endY, color) => {
    if (phaseName === null) return;
    parts.push(`<rect x="40" y="${phaseTop - 12}" width="94" height="${endY - phaseTop + 16}" rx="8" fill="${color}" opacity="0.55"/>`);
    parts.push(text(87, phaseTop + (endY - phaseTop) / 2 + 4, phaseName, { fill: t.ink, size: 11.5, weight: 600 }));
  };

  spec.steps.forEach((st, i) => {
    const y = top + i * stepH + 24;
    if (st.phase && st.phase !== phaseName) {
      closePhase(top + (i - 1) * stepH + 24, phaseColor(t, phaseName));
      phaseTop = y;
      phaseName = st.phase;
    }
    const color = st.color === 'reply' ? t.green : st.color === 'bad' ? t.red : st.color === 'quiet' ? t.muted : t.blue;
    const head = st.color === 'reply' ? 'head-green' : st.color === 'bad' ? 'head-red' : 'head-blue';
    if (st.from === st.to) {
      // Something a process does on its own. On the right half of the picture the loop and its label
      // point inwards, so a long label cannot run off the edge.
      const cx = x(st.from);
      const inward = cx > W / 2 ? -1 : 1;
      parts.push(`<path d="M${cx} ${y - 8} q ${34 * inward} 0 ${34 * inward} 10 q 0 10 ${-34 * inward} 10" stroke="${color}" stroke-width="1.6" fill="none" marker-end="url(#${head})"/>`);
      parts.push(text(cx + 46 * inward, y + 16, st.label, { anchor: inward > 0 ? 'start' : 'end', fill: t.ink, size: 12 }));
    } else {
      const x1 = x(st.from), x2 = x(st.to);
      const dir = x2 > x1 ? 1 : -1;
      parts.push(`<path d="M${x1 + dir * 4} ${y} L${x2 - dir * 8} ${y}" stroke="${color}" stroke-width="1.8" fill="none"${st.dash ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${head})"/>`);
      parts.push(text((x1 + x2) / 2, y - 8, st.label, { fill: t.ink, size: 12, weight: 500 }));
      if (st.note) parts.push(text((x1 + x2) / 2, y + 16, st.note, { fill: t.muted, size: 11 }));
    }
  });
  closePhase(top + (spec.steps.length - 1) * stepH + 24, phaseColor(t, phaseName));

  parts.push(`<line x1="40" y1="${H - 44}" x2="${W - 40}" y2="${H - 44}" stroke="${t.rule}" stroke-width="1" stroke-dasharray="4 5"/>`);
  parts.push(text(40, H - (wide ? 42 : 22), spec.why, { anchor: 'start', fill: t.ink, size: 12.5, weight: 600 }));
  if (spec.cost) {
    parts.push(text(wide ? 40 : W - 40, H - 22, spec.cost, { anchor: wide ? 'start' : 'end', fill: t.muted, size: 12 }));
  }

  const label = spec.title + ': ' + spec.subtitle + '. ' + spec.steps.map(st => st.label).join('; ') + '. ' + spec.why;
  return svg(t, W, H, label, parts.join('\n  '));
}

function phaseColor(t, name) {
  if (!name) return 'transparent';
  const n = name.toLowerCase();
  if (n.includes('1') || n.includes('prepare') || n.includes('ask')) return t.blueSoft;
  if (n.includes('2') || n.includes('accept') || n.includes('write')) return t.violetSoft;
  if (n.includes('decide') || n.includes('done') || n.includes('learn')) return t.greenSoft;
  return t.amberSoft;
}

const DIAGRAMS = { pipeline, architecture, layers, verification };

const check = process.argv.includes('--check');
let stale = 0;
// one schematic per algorithm, from scripts/protocols.cjs
for (const example of EXAMPLES) {
  const spec = PROTOCOLS[example.key];
  if (!spec) continue;
  DIAGRAMS['example-' + example.key] = t => protocol(t, spec);
}
const described = EXAMPLES.filter(e => PROTOCOLS[e.key]).length;
if (!check && described !== EXAMPLES.length) {
  process.stderr.write(`warning: ${EXAMPLES.length - described} example(s) have no protocol description\n`);
}
for (const [name, draw] of Object.entries(DIAGRAMS)) {
  for (const [theme, palette] of Object.entries(THEMES)) {
    const file = join(out, `diagram-${name}-${theme}.svg`);
    const content = draw(palette);
    if (check) {
      let old = '';
      try { old = readFileSync(file, 'utf8'); } catch (e) { old = ''; }
      if (old !== content) { stale++; process.stderr.write(`out of date: docs/assets/diagram-${name}-${theme}.svg\n`); }
    } else {
      writeFileSync(file, content);
    }
  }
}
if (check) {
  if (stale) { process.stderr.write('\nRun: node scripts/make-diagrams.mjs\n'); process.exit(1); }
  process.stdout.write('diagrams up to date\n');
} else {
  process.stdout.write(`Wrote ${Object.keys(DIAGRAMS).length * 2} diagrams to docs/assets/\n`);
}
