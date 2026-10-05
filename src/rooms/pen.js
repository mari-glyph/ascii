// pen.js — room 01
// A deliberately small pen tool: one shard, exactly three anchors. Drag anchors (their handles
// follow; hold Alt to move the anchor alone), drag handles to bend an edge (hold Shift to keep
// the opposite handle smooth), double-click an edge to switch line ↔ curve, drag the body to
// move it. The faint twin is the shard rotated 180° the way the mark pairs its two halves.

import { state, emit, on, saveItem, snapshotShard } from '../store.js';
import {
  s, attr, userPoint, unitsPerPixel, viewBoxStr, padBox, unionBox, pathBBox, svgDocument,
  download, readFileText, importSvg,
} from '../core/svg.js';
import {
  segments, segCmd, shardD, setCurve, handlePoints, tisaneShard, rawTisaneShard,
  mapShard, sampleShard, ANCHOR_NAMES, EDGE_NAMES, MARK_CENTER,
} from '../core/shard.js';
import { buildForm } from '../core/compose.js';
import {
  pt, add, sub, bboxOf, rotation, scaleAbout, translate, centroid, toEdgeFrame, fromEdgeFrame, fp,
} from '../core/geometry.js';
import { shardFromPath } from '../core/pathdata.js';
import { h, section, row, note, button, segmented, toggle, numberPair, filePicker, toast, frameThrottle } from '../ui.js';

const STAGE = { x: 0, y: 0, w: 1000, h: 1000 };
const GRID = 25;

// Where the mark's rotation centre sits relative to the raw shard's base, so the twin ghost
// keeps the same relationship as the shard is edited.
const RAW = rawTisaneShard();
const TWIN_CENTER = toEdgeFrame(MARK_CENTER, RAW.anchors[0], RAW.anchors[1]);
const RAW_SIDE = Math.sign(toEdgeFrame(RAW.anchors[2], RAW.anchors[0], RAW.anchors[1]).v);

export function twinOf(shard) {
  const [A, B, C] = shard.anchors;
  const side = Math.sign(toEdgeFrame(C, A, B).v) || 1;
  const q = fromEdgeFrame(TWIN_CENTER.u, TWIN_CENTER.v * side * RAW_SIDE, A, B);
  return mapShard(shard, rotation(Math.PI, q));
}

export function mount(root) {
  const opts = { skeleton: true, twin: true, snap: false };
  let view = { ...STAGE };
  let sel = null;   // { type: 'anchor', i } | { type: 'ctrl', i, which }
  let drag = null;
  const past = [], future = [];

  // ── stage ────────────────────────────────────────────────────────────────
  const stage = h('div', { class: 'stage' });
  const svg = s('svg', { class: 'stage-svg', preserveAspectRatio: 'xMidYMid meet' });
  stage.append(svg, h('div', { class: 'stage-hint' }, 'drag anchors · drag handles · double-click an edge to bend it · ⌘Z undo'));
  const defs = s('defs', {}, svg);
  const pat = s('pattern', { id: 'pen-grid', width: GRID * 2, height: GRID * 2, patternUnits: 'userSpaceOnUse' }, defs);
  s('circle', { cx: 0, cy: 0, r: 1.6, class: 'grid-dot' }, pat);
  const gridRect = s('rect', { fill: 'url(#pen-grid)' }, svg);
  const ghost = s('path', { class: 'ghost' }, svg);
  const body = s('path', { class: 'shape grab' }, svg);
  const skeleton = s('path', { class: 'skeleton' }, svg);
  const arms = s('g', {}, svg);
  const hits = s('g', {}, svg);
  const knobs = s('g', {}, svg);

  const armLines = [], ctrlKnobs = [], edgeHits = [], anchorKnobs = [], anchorLabels = [];
  for (let i = 0; i < 3; i++) {
    edgeHits.push(s('path', { class: 'edge-hit', 'data-edge': i }, hits));
    for (const which of ['c1', 'c2']) {
      armLines.push(s('line', { class: 'arm' }, arms));
      ctrlKnobs.push(s('circle', { class: 'ctrl', 'data-ctrl': `${i}:${which}` }, knobs));
    }
  }
  for (let i = 0; i < 3; i++) {
    anchorKnobs.push(s('rect', { class: 'anchor', 'data-anchor': i }, knobs));
    anchorLabels.push(s('text', { class: 'anchor-label' }, knobs));
    anchorLabels[i].textContent = ANCHOR_NAMES[i];
  }

  // ── inspector ────────────────────────────────────────────────────────────
  const anchorInputs = ANCHOR_NAMES.map((name, i) => numberPair({
    label: name, x: 0, y: 0,
    onChange: (x, y) => { checkpoint(); moveAnchor(state.shard, i, pt(x, y), true); commit(); },
  }));
  const edgeToggles = EDGE_NAMES.map((name, i) => segmented({
    label: name,
    options: [['line', 'line'], ['curve', 'curve']],
    value: 'line',
    onChange: (v) => { checkpoint(); setCurve(state.shard, i, v === 'curve'); commit(); },
  }));

  const transform = (m) => { checkpoint(); state.shard = mapShard(state.shard, m); commit(); };
  const centre = () => centroid(sampleShard(state.shard));

  const previewSvg = s('svg', { class: 'mini', preserveAspectRatio: 'xMidYMid meet' });
  const previewPath = s('path', { class: 'mini-shape' }, previewSvg);
  const previewName = h('span', { class: 'mini-caption' });
  const nameInput = h('input', { type: 'text', placeholder: 'name this shard', class: 'text' });
  const pathInput = h('input', { type: 'text', placeholder: 'paste path d="…"', class: 'text' });

  const inspector = h('aside', { class: 'inspector' },
    section('anchors', note('Exactly three points. A→B is the base the shard seats on.'), anchorInputs.map((c) => c.el)),
    section('edges', edgeToggles.map((c) => c.el)),
    section('transform',
      row(
        button('flip ↔', () => { const c = centre(); transform(scaleAbout(-1, 1, c)); }),
        button('flip ↕', () => { const c = centre(); transform(scaleAbout(1, -1, c)); }),
        button('⟲ 15°', () => transform(rotation(-Math.PI / 12, centre()))),
        button('⟳ 15°', () => transform(rotation(Math.PI / 12, centre()))),
      ),
      row(
        button('smaller', () => { const c = centre(); transform(scaleAbout(0.9, 0.9, c)); }),
        button('larger', () => { const c = centre(); transform(scaleAbout(1.1, 1.1, c)); }),
        button('centre', () => { const c = centre(); transform(translate(500 - c.x, 500 - c.y)); }),
      ),
      row(
        button('fit view', () => { fitView(); render(); }),
        button('reset to tisane', () => { checkpoint(); state.shard = tisaneShard(); fitView(); commit(); }, { kind: 'ghost' }),
      ),
    ),
    section('view',
      toggle({ label: 'skeleton (apex lines)', value: opts.skeleton, onChange: (v) => { opts.skeleton = v; render(); } }).el,
      toggle({ label: 'twin ghost', value: opts.twin, onChange: (v) => { opts.twin = v; render(); } }).el,
      toggle({ label: `snap anchors to ${GRID}`, value: opts.snap, onChange: (v) => { opts.snap = v; } }).el,
    ),
    section('in the form',
      h('div', { class: 'mini-wrap' }, previewSvg, previewName),
      button('open form →', () => { state.room = 'form'; emit('room'); }, { kind: 'ghost' }),
    ),
    section('import',
      note('Any path with exactly three anchors — e.g. one half of the tisane favicon. You can also drop an .svg on the stage.'),
      row(filePicker({ label: 'open .svg', accept: '.svg,image/svg+xml', onFile: importFile, dropTarget: stage })),
      row(pathInput, button('load', () => importD(pathInput.value))),
    ),
    section('save',
      row(nameInput, button('save shard', () => {
        saveItem('shard', nameInput.value.trim(), { shard: snapshotShard() });
        nameInput.value = '';
        toast('shard saved to library');
      }, { kind: 'primary' })),
      row(button('export svg', exportSvg)),
    ),
  );

  root.append(stage, inspector);

  // ── geometry edits ───────────────────────────────────────────────────────
  function snap(p) {
    return opts.snap ? pt(Math.round(p.x / GRID) * GRID, Math.round(p.y / GRID) * GRID) : p;
  }

  // Move an anchor; its two attached handles (c1 of the edge leaving it, c2 of the edge arriving) ride along.
  function moveAnchor(sh, i, p, withHandles) {
    const d = sub(p, sh.anchors[i]);
    sh.anchors[i] = p;
    if (!withHandles) return;
    const out = sh.edges[i], inc = sh.edges[(i + 2) % 3];
    out.c1 = add(out.c1, d);
    inc.c2 = add(inc.c2, d);
  }

  // The handle on the other side of the same anchor, if that edge is curved.
  function opposite(i, which) {
    if (which === 'c1') { const j = (i + 2) % 3; return { i: j, which: 'c2', anchor: i }; }
    const j = (i + 1) % 3;
    return { i: j, which: 'c1', anchor: j };
  }

  function checkpoint() {
    past.push(JSON.stringify(state.shard));
    if (past.length > 200) past.shift();
    future.length = 0;
  }
  function undo() {
    if (!past.length) return;
    future.push(JSON.stringify(state.shard));
    state.shard = JSON.parse(past.pop());
    commit();
  }
  function redo() {
    if (!future.length) return;
    past.push(JSON.stringify(state.shard));
    state.shard = JSON.parse(future.pop());
    commit();
  }

  const commit = () => emit('shard');

  function fitView() {
    const b = bboxOf(handlePoints(state.shard));
    view = unionBox(STAGE, padBox(b, 120));
  }

  // ── pointer ──────────────────────────────────────────────────────────────
  // Pointer capture retargets click/dblclick to the svg, so double-clicks on an edge are
  // detected here from two quick presses on the same edge.
  let lastEdgePress = { i: -1, t: 0 };

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target, p = userPoint(svg, e);
    const sh = state.shard;
    if (t.dataset.edge !== undefined) {
      const i = +t.dataset.edge, now = performance.now();
      if (lastEdgePress.i === i && now - lastEdgePress.t < 350) {
        lastEdgePress = { i: -1, t: 0 };
        checkpoint();
        setCurve(sh, i, !sh.edges[i].curve);
        commit();
        return;
      }
      lastEdgePress = { i, t: now };
    }
    if (t.dataset.anchor !== undefined) {
      const i = +t.dataset.anchor;
      sel = { type: 'anchor', i };
      drag = { kind: 'anchor', i, offset: sub(sh.anchors[i], p) };
    } else if (t.dataset.ctrl) {
      const [i, which] = t.dataset.ctrl.split(':');
      sel = { type: 'ctrl', i: +i, which };
      drag = { kind: 'ctrl', i: +i, which, offset: sub(sh.edges[+i][which], p) };
    } else if (t === body || t.dataset.edge !== undefined) {
      drag = { kind: 'move', last: p };
    } else {
      sel = null;
      render();
      return;
    }
    svg.setPointerCapture(e.pointerId);
    render();
  });

  const onMove = frameThrottle(() => {
    if (!drag || !drag.p) return;
    if (!drag.recorded) { checkpoint(); drag.recorded = true; } // history only for real moves
    const { p, alt, shift } = drag;
    const sh = state.shard;
    if (drag.kind === 'anchor') {
      moveAnchor(sh, drag.i, snap(add(p, drag.offset)), !alt);
    } else if (drag.kind === 'ctrl') {
      const np = add(p, drag.offset);
      sh.edges[drag.i][drag.which] = np;
      const o = opposite(drag.i, drag.which);
      if (shift && sh.edges[o.i].curve) {
        // Smooth: keep the opposite handle colinear through the anchor, at its own length.
        const a = sh.anchors[o.anchor];
        const v = sub(a, np), lv = Math.hypot(v.x, v.y) || 1;
        const lo = Math.hypot(sh.edges[o.i][o.which].x - a.x, sh.edges[o.i][o.which].y - a.y);
        sh.edges[o.i][o.which] = add(a, pt((v.x / lv) * lo, (v.y / lv) * lo));
      }
    } else if (drag.kind === 'move') {
      state.shard = mapShard(sh, translate(p.x - drag.last.x, p.y - drag.last.y));
      drag.last = p;
    }
    commit();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.p = userPoint(svg, e);
    drag.alt = e.altKey;
    drag.shift = e.shiftKey;
    onMove();
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    // Grow the view if a handle was pulled off-stage, so it stays grabbable.
    const b = padBox(bboxOf(handlePoints(state.shard)), 40);
    if (b.x < view.x || b.y < view.y || b.x + b.w > view.x + view.w || b.y + b.h > view.y + view.h) fitView();
    render();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => {
    if (state.room !== 'pen' || e.target.closest('input, textarea, select')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') { sel = null; render(); return; }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!sel || !dirs[e.key]) return;
    e.preventDefault();
    const k = e.shiftKey ? 10 : 1;
    const d = pt(dirs[e.key][0] * k, dirs[e.key][1] * k);
    checkpoint();
    const sh = state.shard;
    if (sel.type === 'anchor') moveAnchor(sh, sel.i, add(sh.anchors[sel.i], d), !e.altKey);
    else sh.edges[sel.i][sel.which] = add(sh.edges[sel.i][sel.which], d);
    commit();
  });

  // ── import / export ──────────────────────────────────────────────────────
  function load(shard) {
    // Fit whatever came in to the stage by its outline.
    const b = bboxOf(sampleShard(shard, 32));
    const k = 600 / Math.max(b.w, b.h, 1e-9);
    const m = [k, 0, 0, k, 500 - k * (b.x + b.w / 2), 500 - k * (b.y + b.h / 2)];
    checkpoint();
    state.shard = mapShard(shard, m);
    fitView();
    commit();
  }

  function importD(d) {
    const clean = (d || '').replace(/^\s*d\s*=\s*["']?|["']\s*$/g, '').trim();
    if (!clean) return;
    try { load(shardFromPath(clean)); toast('shard loaded'); } catch (err) { toast(err.message, 'error'); }
  }

  async function importFile(file) {
    try {
      const { markup } = importSvg(await readFileText(file));
      const tmp = document.createElement('template');
      tmp.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`;
      const ds = [...tmp.content.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean);
      if (!ds.length) throw new Error('no <path> in that file');
      let lastErr = null;
      for (const d of ds) {
        try { load(shardFromPath(d)); toast(`loaded a shard from ${file.name}`); return; } catch (err) { lastErr = err; }
      }
      throw lastErr;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function exportSvg() {
    const d = shardD(state.shard);
    const b = padBox(pathBBox(d), 20);
    download('tisane-shard.svg', svgDocument(b, `<path d="${d}" fill="#2a2a2a"/>`), 'image/svg+xml');
  }

  // ── render ───────────────────────────────────────────────────────────────
  function render() {
    const sh = state.shard;
    const u = unitsPerPixel(svg);
    attr(svg, { viewBox: viewBoxStr(view) });
    attr(gridRect, { x: view.x, y: view.y, width: view.w, height: view.h });
    attr(body, { d: shardD(sh) });
    attr(ghost, { d: opts.twin ? shardD(twinOf(sh)) : '' });
    const [A, B, C] = sh.anchors;
    attr(skeleton, { d: opts.skeleton ? `M${fp(A)}L${fp(B)}L${fp(C)}Z` : '' });

    segments(sh).forEach((seg, i) => {
      attr(edgeHits[i], { d: `M${fp(seg.p0)}${segCmd(seg)}`, 'stroke-width': 14 * u });
      [['c1', seg.p0], ['c2', seg.p1]].forEach(([which, a], k) => {
        const c = sh.edges[i][which], idx = i * 2 + k;
        const on = seg.curve;
        attr(armLines[idx], { x1: a.x, y1: a.y, x2: c.x, y2: c.y, visibility: on ? 'visible' : 'hidden', 'stroke-width': 1.2 * u });
        attr(ctrlKnobs[idx], {
          cx: c.x, cy: c.y, r: 5.5 * u, visibility: on ? 'visible' : 'hidden', 'stroke-width': 1.5 * u,
          class: `ctrl${sel?.type === 'ctrl' && sel.i === i && sel.which === which ? ' sel' : ''}`,
        });
      });
      edgeToggles[i].set(seg.curve ? 'curve' : 'line');
    });

    const mid = centroid(sh.anchors);
    sh.anchors.forEach((a, i) => {
      const r = 6.5 * u;
      attr(anchorKnobs[i], {
        x: a.x - r, y: a.y - r, width: 2 * r, height: 2 * r, 'stroke-width': 1.5 * u,
        class: `anchor${sel?.type === 'anchor' && sel.i === i ? ' sel' : ''}`,
      });
      const away = sub(a, mid), l = Math.hypot(away.x, away.y) || 1;
      attr(anchorLabels[i], { x: a.x + (away.x / l) * 20 * u, y: a.y + (away.y / l) * 20 * u, 'font-size': 11 * u });
      anchorInputs[i].set(a.x, a.y);
    });

    // The shard seated in the current form (the hash, by default).
    const built = buildForm(state.form, sh);
    attr(previewPath, { d: built.d });
    attr(previewSvg, { viewBox: viewBoxStr(padBox(pathBBox(built.d), 30)) });
    previewName.textContent = state.form.body ? built.name : 'shards only';
  }

  on('shard', render);
  on('form', render);
  // Knobs are sized in screen pixels, so re-measure whenever the stage changes size.
  new ResizeObserver(() => { if (state.room === 'pen') render(); }).observe(stage);
  fitView();
  return { show: render };
}
