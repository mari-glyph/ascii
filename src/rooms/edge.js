// edge.js — room 03
// Drop in any SVG (or draw one) and trace its outlines with an edge of shrunken shards: each
// copy's base becomes a chord of the outline and its apex points outward. Works with the live
// shard, the live form, or anything saved in the library.

import { state, emit, on, motifOptions, resolveMotif, sources } from '../store.js';
import {
  s, attr, userPoint, unitsPerPixel, viewBoxStr, padBox, unionBox, importSvg, readFileText,
  sampleOutlines, svgDocument, download, rasterize, downloadCanvas, pathBBox,
} from '../core/svg.js';
import { layoutEdge, stampsMarkup, EDGE_DEFAULTS } from '../core/edge.js';
import { shardD } from '../core/shard.js';
import { buildForm } from '../core/compose.js';
import { pt, dist, bboxOf, f, fp } from '../core/geometry.js';
import { h, section, row, note, button, segmented, toggle, slider, select, colorInput, filePicker, toast, frameThrottle } from '../ui.js';

const PAPER = '#f2ead8', INK = '#2a2a2a';

const SAMPLES = {
  circle: { name: 'circle', box: { x: 0, y: 0, w: 1000, h: 1000 }, markup: `<circle cx="500" cy="500" r="300" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>` },
};

const DEFAULTS = {
  ...EDGE_DEFAULTS,
  motif: 'live:shard',
  color: INK,
  altColor: '#8a5a2a',
  showArt: true,
  background: true,
  art: SAMPLES.circle,
};

// ── freehand helpers ───────────────────────────────────────────────────────

// Ramer–Douglas–Peucker: drop points that sit within eps of the line through their neighbours.
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let best = 0, idx = 0;
  const L = dist(a, b) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > best) { best = d; idx = i; }
  }
  if (best <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

// Catmull-Rom through the points, emitted as cubic béziers.
function smoothD(pts, closed) {
  if (pts.length < 2) return '';
  const n = pts.length;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${fp(pts[0])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = pt(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6);
    const c2 = pt(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6);
    d += `C${fp(c1)} ${fp(c2)} ${fp(p2)}`;
  }
  return d + (closed ? 'Z' : '');
}

export function mount(root) {
  state.edge = { ...DEFAULTS, ...state.edge };
  const E = state.edge;
  let drawing = false, stroke = null, closeStrokes = true;
  let cache = { markup: null, outlines: [], box: null };

  // ── stage ────────────────────────────────────────────────────────────────
  const stage = h('div', { class: 'stage' });
  const svg = s('svg', { class: 'stage-svg', preserveAspectRatio: 'xMidYMid meet' });
  const hint = h('div', { class: 'stage-hint' }, 'drop an .svg here · or switch on draw');
  stage.append(svg, hint);
  const bg = s('rect', { class: 'paper' }, svg);
  const artG = s('g', {}, svg);
  const edgeG = s('g', {}, svg);
  const inkPath = s('path', { class: 'ink-stroke' }, svg);

  // ── inspector ────────────────────────────────────────────────────────────
  const commit = () => emit('edge');
  const set = (k) => (v) => { E[k] = v; commit(); };

  const motifSel = select({ label: 'motif', options: motifOptions(), value: E.motif, onChange: set('motif') });
  const drawT = toggle({ label: 'draw', value: false, onChange: (v) => { drawing = v; stage.classList.toggle('drawing', v); hint.textContent = v ? 'drag to draw · release to add the stroke' : 'drop an .svg here · or switch on draw'; } });
  const pasteArea = h('textarea', { class: 'text', rows: 3, placeholder: '<svg …>…</svg>' });
  const count = h('div', { class: 'readout' });
  const rotateCtl = slider({ label: 'rotate', min: -180, max: 180, step: 1, value: E.rotate, format: (v) => `${v}°`, onInput: set('rotate') });

  const useArt = (art, msg) => { E.art = art; commit(); if (msg) toast(msg); };
  const artFromPath = (d, name) => {
    const b = padBox(pathBBox(d), 60);
    useArt({ name, box: b, markup: `<path d="${d}" fill="${PAPER}" stroke="${INK}" stroke-width="${Math.max(b.w, b.h) / 300}"/>` }, `using the ${name} as artwork`);
  };

  async function onFile(file) {
    try {
      const { markup, box } = importSvg(await readFileText(file));
      useArt({ name: file.name, box, markup }, `loaded ${file.name}`);
    } catch (err) { toast(err.message, 'error'); }
  }

  const inspector = h('aside', { class: 'inspector' },
    section('artwork',
      note('Any SVG works — every path, circle, rect and polygon outline gets an edge.'),
      h('div', { class: 'row wrap' },
        filePicker({ label: 'open .svg', accept: '.svg,image/svg+xml', onFile, dropTarget: stage }),
        button('shard', () => artFromPath(shardD(state.shard), 'shard')),
        button('form', () => artFromPath(buildForm(state.form, state.shard).d, 'form')),
        button('circle', () => useArt(SAMPLES.circle)),
      ),
      row(pasteArea),
      row(button('use pasted svg', () => {
        try { const { markup, box } = importSvg(pasteArea.value); useArt({ name: 'pasted', box, markup }, 'using pasted svg'); } catch (err) { toast(err.message, 'error'); }
      })),
      drawT.el,
      toggle({ label: 'close loops', value: closeStrokes, onChange: (v) => { closeStrokes = v; } }).el,
      row(button('clear artwork', () => useArt({ name: 'blank', box: { x: 0, y: 0, w: 1000, h: 1000 }, markup: '' }), { kind: 'ghost' })),
    ),
    section('motif', motifSel.el),
    section('placement',
      slider({ label: 'size', min: 0.5, max: 15, step: 0.1, value: E.size, format: (v) => `${v.toFixed(1)}%`, onInput: set('size') }).el,
      slider({ label: 'gap', min: -0.5, max: 2, step: 0.01, value: E.gap, format: (v) => v.toFixed(2), onInput: set('gap') }).el,
      slider({ label: 'depth', min: 0.1, max: 3, step: 0.01, value: E.depth, format: (v) => v.toFixed(2), onInput: set('depth') }).el,
      slider({ label: 'offset', min: -1.5, max: 1.5, step: 0.01, value: E.offset, format: (v) => v.toFixed(2), onInput: set('offset') }).el,
      segmented({ label: 'side', options: [['out', 'out'], ['in', 'in'], ['alt', 'alternate']], value: E.side, onChange: set('side') }).el,
      segmented({ label: 'rhythm', options: [['none', 'even'], ['flip', 'flip'], ['pairs', 'pairs', 'add each copy’s 180° twin, like the mark']], value: E.rhythm, onChange: set('rhythm') }).el,
      segmented({ label: 'orient', options: [['hug', 'hug edge'], ['upright', 'upright']], value: E.orient, onChange: set('orient') }).el,
      rotateCtl.el,
    ),
    section('colour',
      colorInput({ label: 'motif', value: E.color, onInput: set('color') }).el,
      colorInput({ label: 'alternate', value: E.altColor, onInput: set('altColor') }).el,
      toggle({ label: 'show artwork', value: E.showArt, onChange: set('showArt') }).el,
      toggle({ label: 'paper background', value: E.background, onChange: set('background') }).el,
    ),
    section('output', count,
      row(button('export svg', () => download('tisane-edge.svg', compute().svgText, 'image/svg+xml'), { kind: 'primary' }),
        button('export png', async () => downloadCanvas('tisane-edge.png', await rasterize(compute().svgText, 2000)))),
      row(button('send to ascii →', () => { state.ascii.source = 'edge'; state.room = 'ascii'; emit('room'); }, { kind: 'ghost' })),
    ),
  );
  root.append(stage, inspector);

  // ── drawing ──────────────────────────────────────────────────────────────
  svg.addEventListener('pointerdown', (e) => {
    if (!drawing || e.button !== 0) return;
    stroke = [userPoint(svg, e)];
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    const p = userPoint(svg, e);
    if (dist(p, stroke[stroke.length - 1]) > 2 * unitsPerPixel(svg)) stroke.push(p);
    attr(inkPath, { d: `M${stroke.map(fp).join('L')}`, 'stroke-width': 2 * unitsPerPixel(svg) });
  });
  const finish = () => {
    if (!stroke) return;
    const u = unitsPerPixel(svg);
    const pts = simplify(stroke, 1.5 * u);
    stroke = null;
    attr(inkPath, { d: '' });
    if (pts.length < 2) return;
    // A loop is a stroke whose ends nearly meet; anything else stays an open line.
    const b = bboxOf(pts);
    const closed = closeStrokes && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < Math.max(24 * u, 0.15 * Math.hypot(b.w, b.h));
    const d = smoothD(pts, closed);
    const w = Math.max(E.art.box.w, E.art.box.h) / 300;
    const path = `<path d="${d}" fill="${closed ? PAPER : 'none'}" stroke="${INK}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    E.art = { ...E.art, name: 'drawing', markup: E.art.markup + path };
    commit();
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);

  // ── render ───────────────────────────────────────────────────────────────
  function outlines() {
    if (cache.markup !== E.art.markup) {
      const diag = Math.hypot(E.art.box.w, E.art.box.h);
      const found = sampleOutlines(E.art.markup, { spacing: diag / 1500 });
      const all = found.flatMap((o) => o.points);
      cache = { markup: E.art.markup, outlines: found, box: all.length ? unionBox(E.art.box, bboxOf(all)) : E.art.box };
    }
    return cache;
  }

  function compute() {
    const { outlines: lines, box: artBox } = outlines();
    const diag = Math.hypot(artBox.w, artBox.h);
    const motif = resolveMotif(E.motif);
    const stamps = layoutEdge(lines, motif, E, diag);
    const size = (E.size / 100) * diag;
    const box = padBox(artBox, size * (Math.max(1, E.depth) + Math.abs(E.offset) + 0.6));
    const edgeInner = `<defs><path id="edge-motif" d="${motif.d}"/></defs><g fill="${E.color}">${stampsMarkup(stamps, 'edge-motif', E.color, E.altColor)}</g>`;
    const svgText = svgDocument(box, (E.showArt ? E.art.markup : '') + edgeInner, { background: E.background ? PAPER : null });
    return { lines, stamps, box, edgeInner, svgText };
  }

  function render() {
    if (state.room !== 'edge') return;
    const { lines, stamps, box, edgeInner } = compute();
    attr(svg, { viewBox: viewBoxStr(box) });
    attr(bg, { x: box.x, y: box.y, width: box.w, height: box.h, fill: E.background ? PAPER : 'transparent' });
    if (artG.dataset.markup !== E.art.markup) { artG.innerHTML = E.art.markup; artG.dataset.markup = E.art.markup; }
    artG.style.display = E.showArt ? '' : 'none';
    edgeG.innerHTML = edgeInner;

    rotateCtl.el.classList.toggle('disabled', E.orient !== 'upright');
    count.textContent = `${stamps.length} copies on ${lines.length} outline${lines.length === 1 ? '' : 's'} · ${E.art.name || 'artwork'}`;
  }

  sources.edge = () => compute().svgText;

  const throttled = frameThrottle(render);
  on('edge', throttled);
  on('shard', throttled);
  on('form', throttled);
  on('library', () => { motifSel.setOptions(motifOptions(), E.motif); throttled(); });
  return { show: render };
}
