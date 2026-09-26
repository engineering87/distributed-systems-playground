// Builds the documentation site in manual/ from docs/*.md, CONTRIBUTING.md and CHANGELOG.md.
// No dependencies: a small Markdown renderer covers the subset used by the documentation.
// Usage: node scripts/build-docs.mjs          -> writes manual/
//        node scripts/build-docs.mjs --check  -> fails if manual/ is out of date
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, posix } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'manual';
const REPO = 'https://github.com/engineering87/distributed-systems-playground';

// pages in menu order: [source, output, menu title, group]
const PAGES = [
  ['docs/README.md', 'index.html', 'Overview', 'Start here'],
  ['docs/getting-started.md', 'getting-started.html', 'Getting started', 'Start here'],
  ['docs/concepts.md', 'concepts.html', 'Concepts', 'Start here'],
  ['docs/examples.md', 'examples.html', 'Examples', 'Start here'],
  ['docs/interface.md', 'interface.html', 'The interface', 'Reference'],
  ['docs/language.md', 'language.html', 'The Upon language', 'Reference'],
  ['docs/library.md', 'library.html', 'The module library', 'Reference'],
  ['docs/timing-model.md', 'timing-model.html', 'The timing model', 'Reference'],
  ['docs/faults.md', 'faults.html', 'Faults', 'Reference'],
  ['docs/engine.md', 'engine.html', 'How the engine works', 'Reference'],
  ['docs/assumptions.md', 'assumptions.html', 'Assumptions and simplifications', 'Reference'],
  ['docs/troubleshooting.md', 'troubleshooting.html', 'Troubleshooting', 'Reference'],
  ['docs/tour.md', 'tour.html', 'A guided tour', 'Getting started'],
  ['docs/cli.md', 'cli.html', 'Outside the browser', 'Using it'],
  ['docs/faq.md', 'faq.html', 'Questions and references', 'Reference'],
  ['docs/teaching.md', 'teaching.html', 'Teaching', 'Using it'],
  ['CONTRIBUTING.md', 'contributing.html', 'Contributing', 'Project'],
  ['CHANGELOG.md', 'changelog.html', 'Changelog', 'Project'],
  ['docs/SPEC.md', 'spec.html', 'Specification', 'Project']
];
const bySource = new Map(PAGES.map(p => [p[0], p]));

// ---------------------------------------------------------------- helpers
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function slug(text) {
  return text.replace(/[`*_]/g, '').trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
}
function resolveLink(url, fromSrc) {
  if (/^(https?:|mailto:|#)/.test(url)) return url;
  const [path, anchor] = url.split('#');
  const target = posix.normalize(posix.join(posix.dirname(fromSrc), path));
  const hash = anchor !== undefined ? '#' + anchor : '';
  if (bySource.has(target)) return bySource.get(target)[1] + hash;
  if (target === 'README.md') return REPO + '#readme' + (anchor ? '' : '');
  if (target === 'index.html') return '../index.html' + hash;
  if (/\.(png|svg|gif|jpg)$/.test(target)) return posix.relative(OUT, target);
  return REPO + '/blob/main/' + target + hash;
}

// ---------------------------------------------------------------- inline markdown
// A handful of tags may be written directly in the documentation. Everything else is escaped: the text is
// walked once, so there is no tag-matching regular expression to get wrong.
const INLINE_TAGS = new Set(['b', 'i', 'em', 'strong', 'kbd', 'br', 'sub', 'sup']);
function escapeExceptSimpleTags(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c !== '<') { out += ({ '&': '&amp;', '>': '&gt;', '"': '&quot;' })[c] || c; i++; continue; }
    const gt = text.indexOf('>', i);
    const inside = gt < 0 ? '' : text.slice(i + 1, gt);
    const name = inside.replace(/^\//, '').replace(/\/$/, '').trim().toLowerCase();
    if (gt > i && INLINE_TAGS.has(name)) { out += text.slice(i, gt + 1); i = gt + 1; }
    else { out += '&lt;'; i++; }
  }
  return out;
}

// the text of an HTML fragment, for the search index: walked, not matched
function plain(html) {
  let out = '', i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { out += html.slice(i); break; }
    out += html.slice(i, lt) + ' ';
    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    i = gt + 1;
  }
  return out.replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function inline(text, src) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = s.replace(/\\\|/g, '|');
  s = escapeExceptSimpleTags(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => `<img src="${esc(resolveLink(url, src))}" alt="${alt}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const href = resolveLink(url.replace(/&amp;/g, '&'), src);
    const ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${esc(href)}"${ext}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?=[^\w*]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + esc(codes[+i]) + '</code>');
  return s;
}

// ---------------------------------------------------------------- code highlighting for Upon
const KW = new Set(('interface request indication algorithm implements as uses via params state stable upon event where condition ' +
  'exists in do end function return call trigger if then elif else forall while starttimer canceltimer assert log skip and or not ' +
  'notin union inter minus subseteq true false nil').split(' '));
function highlightUpon(code) {
  let out = '';
  const re = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?(?:us|ms|s)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([⟨⟩∪∩∈∉∅∧∨¬⊆≠≤≥Π])|([\s\S])/g;
  let m;
  while ((m = re.exec(code))) {
    if (m[1]) out += '<span class="t-cm">' + esc(m[1]) + '</span>';
    else if (m[2]) out += '<span class="t-str">' + esc(m[2]) + '</span>';
    else if (m[3]) out += '<span class="t-num">' + esc(m[3]) + '</span>';
    else if (m[4]) {
      const w = m[4];
      const cls = KW.has(w) ? 't-kw' : /^[A-Z][A-Z0-9_]+$/.test(w) ? 't-at' : /^[A-Z]/.test(w) ? 't-ty' : '';
      out += cls ? `<span class="${cls}">${esc(w)}</span>` : esc(w);
    } else if (m[5]) out += '<span class="t-op">' + esc(m[5]) + '</span>';
    else out += esc(m[6]);
  }
  return out;
}

// ---------------------------------------------------------------- block markdown
function render(md, src) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [], headings = [], seen = new Map();
  let i = 0;
  const isBlank = l => /^\s*$/.test(l);
  const isList = l => /^(\s*)([-*]|\d+\.)\s+/.test(l);
  const startsBlock = l => /^(#{1,6}\s|```|\|| {0,3}>|<\/?(div|p|img|picture|table|details|h\d)\b|---\s*$)/.test(l) || isList(l);
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m;
    if ((m = /^```(\w*)\s*$/.exec(line))) {
      const lang = m[1], buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const code = buf.join('\n');
      out.push(`<pre class="code${lang ? ' lang-' + lang : ''}"><code>${lang === 'upon' ? highlightUpon(code) : esc(code)}</code></pre>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      const level = m[1].length, text = m[2];
      if (level === 2 && /^(contents|table of contents)$/i.test(text.trim())) {
        i++;
        while (i < lines.length && (isBlank(lines[i]) || isList(lines[i]) || /^\s+\S/.test(lines[i]))) i++;
        continue;
      }
      const base = slug(text);
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      const id = n ? base + '-' + n : base;
      if (level === 2 || level === 3) headings.push({ level, id, text: text.replace(/[`*]/g, '') });
      out.push(`<h${level} id="${id}">${inline(text, src)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`);
      i++;
      continue;
    }
    if (/^---\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^<\/?(div|p|img|picture|table|details|h\d)\b/.test(line)) {
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join('\n').replace(/(src|href)="([^"]+)"/g, (x, a, u) => `${a}="${esc(resolveLink(u, src))}"`));
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => r.replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push('<div class="table"><table><thead><tr>' + head.map(h => `<th>${inline(h, src)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + r.map(c => `<td>${inline(c, src)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) buf.push(lines[i++].replace(/^ {0,3}>\s?/, ''));
      out.push('<blockquote>' + render(buf.join('\n'), src).html + '</blockquote>');
      continue;
    }
    if (isList(line)) {
      // collect the list and its indented continuation lines
      const buf = [];
      while (i < lines.length && (isList(lines[i]) || (!isBlank(lines[i]) && /^\s+/.test(lines[i])) ||
        (isBlank(lines[i]) && i + 1 < lines.length && (isList(lines[i + 1]) || /^\s{2,}\S/.test(lines[i + 1]))))) buf.push(lines[i++]);
      out.push(renderList(buf, src));
      continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !(buf.length && startsBlock(lines[i]))) buf.push(lines[i++]);
    out.push('<p>' + inline(buf.join(' '), src) + '</p>');
  }
  return { html: out.join('\n'), headings };
}
function renderList(lines, src) {
  const first = /^(\s*)([-*]|\d+\.)\s+/.exec(lines[0]);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  for (const l of lines) {
    const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(l);
    if (m && m[1].length === indent) items.push([m[3]]);
    else if (items.length) items[items.length - 1].push(l.startsWith(' '.repeat(indent + 2)) ? l.slice(indent + 2) : l.trimStart());
  }
  const lis = items.map(parts => {
    const text = parts.join('\n');
    const nested = parts.findIndex((p, k) => k > 0 && /^\s*([-*]|\d+\.)\s+/.test(p));
    if (nested > 0) {
      const head = parts.slice(0, nested).join(' ');
      return '<li>' + inline(head, src) + renderList(parts.slice(nested).filter(p => p.trim()), src) + '</li>';
    }
    if (/\n\s*\n/.test(text) || /^```/m.test(text)) return '<li>' + render(text, src).html + '</li>';
    return '<li>' + inline(parts.join(' '), src) + '</li>';
  });
  return (ordered ? '<ol>' : '<ul>') + lis.join('') + (ordered ? '</ol>' : '</ul>');
}

// ---------------------------------------------------------------- page layout
const LOGO = readFileSync(join(root, 'docs/assets/logo.svg'), 'utf8').replace('<svg ', '<svg class="logo" ');
function nav(current) {
  let html = '', group = '';
  for (const [, out, title, g] of PAGES) {
    if (g !== group) { html += (group ? '</ul>' : '') + `<p class="group">${g}</p><ul>`; group = g; }
    html += `<li><a href="${out}"${out === current ? ' aria-current="page"' : ''}>${title}</a></li>`;
  }
  return html + '</ul>';
}
const STYLE = `
:root { --paper:#eef3f5; --surface:#fff; --surface-2:#f6f9fa; --rule:#c5d1d8; --grid:#dfe7eb; --ink:#17283a; --muted:#56687a; --blue:#2350a3; --blue-soft:#e3ebf8;
  --code-kw:#2350a3; --code-at:#8a3f8f; --code-ty:#0c7760; --code-num:#a1560a; --code-str:#8a5a00; --code-cm:#7b8a96;
  --ui:"Atkinson Hyperlegible","Segoe UI",system-ui,-apple-system,sans-serif; --mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper:#0f161d; --surface:#151f29; --surface-2:#1a2632; --rule:#2d3e4e; --grid:#1f2a34; --ink:#e2eaf1; --muted:#93a4b3; --blue:#86aef0; --blue-soft:#1d2d45;
  --code-kw:#86aef0; --code-at:#d49ad8; --code-ty:#4cc2a5; --code-num:#e2a74a; --code-str:#e8c27a; --code-cm:#6f8292; color-scheme: dark; } }
:root[data-theme="dark"] { --paper:#0f161d; --surface:#151f29; --surface-2:#1a2632; --rule:#2d3e4e; --grid:#1f2a34; --ink:#e2eaf1; --muted:#93a4b3; --blue:#86aef0; --blue-soft:#1d2d45;
  --code-kw:#86aef0; --code-at:#d49ad8; --code-ty:#4cc2a5; --code-num:#e2a74a; --code-str:#e8c27a; --code-cm:#6f8292; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.6 var(--ui); }
a { color: var(--blue); }
header.top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 10px 18px; background: var(--surface); border-bottom: 1px solid var(--rule); }
header.top .brand { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-weight: 700; }
.logo { width: 30px; height: 30px; }
header.top .grow { flex: 1; }
.search { position: relative; }
.search input { font: inherit; font-size: 14px; padding: 6px 10px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); color: var(--ink); width: min(280px, 40vw); }
.results { position: absolute; right: 0; top: 40px; width: min(460px, 92vw); max-height: 70vh; overflow: auto; background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
.results a { display: block; padding: 8px 12px; text-decoration: none; color: var(--ink); border-bottom: 1px solid var(--grid); }
.results a:hover, .results a.on { background: var(--blue-soft); }
.results small { display: block; color: var(--muted); }
.button { font: inherit; font-size: 14px; font-weight: 700; padding: 6px 12px; border-radius: 6px; background: var(--blue); color: var(--surface); text-decoration: none; white-space: nowrap; }
.menu-toggle { display: none; font: inherit; border: 1px solid var(--rule); background: var(--surface); color: var(--ink); border-radius: 6px; padding: 4px 10px; }
.layout { display: grid; grid-template-columns: 250px minmax(0, 1fr) 220px; gap: 28px; max-width: 1320px; margin: 0 auto; padding: 0 18px; }
nav.side { position: sticky; top: 58px; align-self: start; max-height: calc(100vh - 70px); overflow: auto; padding: 18px 0; font-size: 15px; }
nav.side .group { margin: 16px 0 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
nav.side ul { list-style: none; margin: 0; padding: 0; }
nav.side a { display: block; padding: 4px 10px; border-radius: 6px; color: var(--ink); text-decoration: none; }
nav.side a:hover { background: var(--surface-2); }
nav.side a[aria-current] { background: var(--blue-soft); color: var(--blue); font-weight: 700; }
main { padding: 26px 0 60px; min-width: 0; }
main h1, main h2, main h3, main h4 { scroll-margin-top: 72px; }
main h1 { font-size: 34px; line-height: 1.2; margin: 0 0 18px; }
main h2 { font-size: 24px; margin: 40px 0 10px; padding-top: 6px; border-top: 1px solid var(--grid); }
main h3 { font-size: 19px; margin: 28px 0 8px; }
main h4 { font-size: 16px; margin: 20px 0 6px; }
.anchor { margin-left: 8px; color: var(--muted); text-decoration: none; opacity: 0; font-weight: 400; }
h1:hover .anchor, h2:hover .anchor, h3:hover .anchor, h4:hover .anchor { opacity: 1; }
main code { font: .88em var(--mono); background: var(--surface-2); border: 1px solid var(--grid); border-radius: 4px; padding: 1px 5px; }
pre.code { background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; padding: 12px 14px; overflow: auto; font: 13.5px/1.55 var(--mono); }
pre.code code { background: none; border: 0; padding: 0; font: inherit; }
.t-kw { color: var(--code-kw); font-weight: 600; } .t-at { color: var(--code-at); } .t-ty { color: var(--code-ty); }
.t-num { color: var(--code-num); } .t-str { color: var(--code-str); } .t-cm { color: var(--code-cm); font-style: italic; } .t-op { color: var(--code-kw); }
.table { overflow-x: auto; margin: 14px 0; }
table { border-collapse: collapse; font-size: 15px; min-width: 60%; }
th, td { border: 1px solid var(--rule); padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: var(--surface-2); }
blockquote { margin: 14px 0; padding: 4px 14px; border-left: 4px solid var(--blue); background: var(--surface); }
img { max-width: 100%; border-radius: 8px; }
kbd { font: 12px var(--mono); border: 1px solid var(--rule); border-bottom-width: 2px; border-radius: 4px; padding: 1px 6px; background: var(--surface-2); }
aside.toc { position: sticky; top: 58px; align-self: start; max-height: calc(100vh - 70px); overflow: auto; padding: 26px 0; font-size: 14px; }
aside.toc p { margin: 0 0 6px; font-weight: 700; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
aside.toc a { display: block; padding: 2px 0; color: var(--muted); text-decoration: none; overflow-wrap: anywhere; }
aside.toc a.l3 { padding-left: 12px; }
aside.toc a:hover, aside.toc a.on { color: var(--blue); }
.pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--rule); }
.pager a { text-decoration: none; }
.pager small { display: block; color: var(--muted); }
footer { color: var(--muted); font-size: 14px; margin-top: 30px; }
@media (max-width: 1100px) { .layout { grid-template-columns: 230px minmax(0, 1fr); } aside.toc { display: none; } }
@media (max-width: 760px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .menu-toggle { display: inline-block; }
  nav.side { display: none; position: static; max-height: none; }
  body.menu-open nav.side { display: block; }
  header.top .brand span { display: none; }
  header.top { gap: 8px; padding: 8px 10px; }
  .search input { width: 100%; }
  .search { flex: 1; min-width: 0; }
  header.top .grow { display: none; }
  .button .long { display: none; }
  main h1 { font-size: 28px; }
}
@media print { header.top, nav.side, aside.toc, .pager { display: none; } .layout { display: block; } }
`;
const SCRIPT = `
(function () {
  try { var s = JSON.parse(localStorage.getItem('ds-playground:settings') || '{}'); if (s.theme === 'light' || s.theme === 'dark') document.documentElement.setAttribute('data-theme', s.theme); } catch (e) {}
})();
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.menu-toggle');
  if (toggle) toggle.addEventListener('click', function () { document.body.classList.toggle('menu-open'); });
  var input = document.getElementById('q'), box = document.getElementById('results');
  var idx = window.DOCS_INDEX || [];
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); }
  function search(q) {
    var words = norm(q).split(/\\s+/).filter(Boolean);
    if (!words.length) return [];
    var hits = [];
    idx.forEach(function (e) {
      var t = norm(e.t), x = norm(e.x), score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (t.indexOf(w) >= 0) score += 5; else if (x.indexOf(w) >= 0) score += 1; else return;
      }
      hits.push({ e: e, s: score });
    });
    return hits.sort(function (a, b) { return b.s - a.s; }).slice(0, 12);
  }
  var sel = -1;
  function show() {
    var list = search(input.value);
    box.innerHTML = '';
    sel = -1;
    if (!input.value.trim()) { box.hidden = true; return; }
    if (!list.length) { box.innerHTML = '<a>No results</a>'; box.hidden = false; return; }
    list.forEach(function (h) {
      var a = document.createElement('a');
      a.href = h.e.u;
      a.textContent = h.e.t;
      var small = document.createElement('small');
      var x = h.e.x, pos = norm(x).indexOf(norm(input.value.trim().split(/\\s+/)[0]));
      small.textContent = (h.e.p ? h.e.p + ' · ' : '') + (pos >= 0 ? '…' + x.slice(Math.max(0, pos - 40), pos + 90) + '…' : x.slice(0, 120));
      a.appendChild(small);
      box.appendChild(a);
    });
    box.hidden = false;
  }
  if (input) {
    input.addEventListener('input', show);
    input.addEventListener('keydown', function (ev) {
      var items = box.querySelectorAll('a[href]');
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        sel = Math.max(0, Math.min(items.length - 1, sel + (ev.key === 'ArrowDown' ? 1 : -1)));
        items.forEach(function (a, i) { a.classList.toggle('on', i === sel); });
      } else if (ev.key === 'Enter' && items.length) { location.href = items[Math.max(0, sel)].href; }
      else if (ev.key === 'Escape') { input.value = ''; box.hidden = true; }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === '/' && document.activeElement !== input) { ev.preventDefault(); input.focus(); }
    });
    document.addEventListener('click', function (ev) { if (!ev.target.closest('.search')) box.hidden = true; });
  }
  var links = document.querySelectorAll('aside.toc a');
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { links.forEach(function (a) { a.classList.remove('on'); }); var a = map[en.target.id]; if (a) a.classList.add('on'); }
      });
    }, { rootMargin: '-60px 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var h = document.getElementById(id); if (h) obs.observe(h); });
  }
});
`;
function page(p, body, headings, prev, next, title) {
  const toc = headings.length > 2 ? '<aside class="toc"><p>On this page</p>' +
    headings.map(h => `<a class="l${h.level}" href="#${h.id}">${esc(h.text)}</a>`).join('') + '</aside>' : '<aside class="toc"></aside>';
  const pager = '<nav class="pager">' +
    (prev ? `<a href="${prev[1]}"><small>Previous</small>${prev[2]}</a>` : '<span></span>') +
    (next ? `<a href="${next[1]}" style="text-align:right"><small>Next</small>${next[2]}</a>` : '<span></span>') + '</nav>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Distributed Systems Playground</title>
<meta name="description" content="Documentation of Distributed Systems Playground: ${esc(title)}.">
<link rel="icon" type="image/svg+xml" href="../docs/assets/logo.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>${STYLE}</style>
<script>${SCRIPT}</script>
<script src="search-index.js"></script>
</head>
<body>
<header class="top">
  <button class="menu-toggle" type="button" aria-label="Menu">☰</button>
  <a class="brand" href="index.html">${LOGO}<span>Distributed Systems Playground</span></a>
  <span class="grow"></span>
  <div class="search"><input id="q" type="search" placeholder="Search the documentation (/)" aria-label="Search the documentation" autocomplete="off"><div id="results" class="results" hidden></div></div>
  <a class="button" href="../index.html"><span class="long">Open the </span>Playground</a>
</header>
<div class="layout">
<nav class="side" aria-label="Documentation">${nav(p[1])}</nav>
<main>
${body}
${pager}
<footer>Generated from <a href="${REPO}/blob/main/${p[0]}" target="_blank" rel="noopener">${p[0]}</a>. Released under the MIT License.</footer>
</main>
${toc}
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------- build
const files = new Map();
const index = [];
PAGES.forEach((p, k) => {
  const md = readFileSync(join(root, p[0]), 'utf8');
  const { html, headings } = render(md, p[0]);
  const title = (/^#\s+(.*)$/m.exec(md) || [, p[2]])[1].replace(/[`*]/g, '');
  files.set(p[1], page(p, html, headings, PAGES[k - 1], PAGES[k + 1], title));
  // search entries: one per section
  const parts = html.split(/(?=<h[23] id=")/);
  parts.forEach((part, j) => {
    const h = /^<h[23] id="([^"]+)">(.*?)<a class="anchor"/.exec(part);
    // the text of the section, without its own heading
    const headEnd = part.startsWith('<h') ? part.indexOf('</h', 1) : -1;
    const afterHead = headEnd < 0 ? part : part.slice(part.indexOf('>', headEnd) + 1);
    const text = plain(afterHead).slice(0, 600);
    if (!h && j > 0) return;
    index.push({ u: p[1] + (h ? '#' + h[1] : ''), t: h ? plain(h[2]) : title, p: h ? p[2] : '', x: text });
  });
});
files.set('search-index.js', 'window.DOCS_INDEX = ' + JSON.stringify(index) + ';\n');

const check = process.argv.includes('--check');
let stale = [];
for (const [name, content] of files) {
  const path = join(root, OUT, name);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) stale.push(name);
  } else {
    mkdirSync(join(root, OUT), { recursive: true });
    writeFileSync(path, content);
  }
}
if (check) {
  const extra = existsSync(join(root, OUT)) ? readdirSync(join(root, OUT)).filter(f => !files.has(f)) : [];
  if (stale.length || extra.length) {
    console.error('manual/ is out of date (' + stale.concat(extra).join(', ') + '): run "npm run build" and commit the result.');
    process.exit(1);
  }
  console.log('manual/ is up to date.');
} else {
  console.log(`Wrote ${files.size} files to ${OUT}/`);
}
