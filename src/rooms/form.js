// form.js — room 02
// Between the pen and the edge: build a hexagon (or more) from a parallelogram with shards
// seated on its edges. Each shard's base endpoints are matched to an edge's vertices and its
// apex sits off the edge; the dashed skeleton is the straight line through those matched
// points, and the accent lines join the apexes. Drag a vertex (the opposite one follows, so the
// parallelogram stays three-point defined), drag an apex to lean/deepen its shard, click an edge
// to cycle off → out → in.

import { state, emit, on, saveItem, snapshotForm } from '../store.js';
import { s, attr, userPoint, unitsPerPixel, viewBoxStr, padBox, unionBox, pathBBox, svgDocument, download } from '../core/svg.js';
import { buildForm, apexLines, moveVertex, PRESETS, EDGE_MODES, tisaneForm } from '../core/compose.js';
import { apexFrame } from '../core/shard.js';
import { add, sub, dist, dot, perp, clamp, bboxOf, centroid, toEdgeFrame, translate, apply } from '../core/geometry.js';
import { h, section, row, note, button, segmented, toggle, slider, toast, frameThrottle } from '../ui.js';

const STAGE = { x: 0, y: 0, w: 1000, h: 1000 };

export function mount(root) {
  const opts = { skeleton: true, apexLines: true };
  let view = { ...STAGE };
  let drag = null;

  // ── stage ────────────────────────────────────────────────────────────────
  const stage = h('div', { class: 'stage' });
  const svg = s('svg', { class: 'stage-svg', preserveAspectRatio: 'xMidYMid meet' });
  stage.append(svg, h('div', { class: 'stage-hint' }, 'drag vertices · drag apexes · click an edge to cycle off → out → in'));
  const defs = s('defs', {}, svg);
  const pat = s('pattern', { id: 'form-grid', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, defs);
  s('circle', { cx: 0, cy: 0, r: 1.6, class: 'grid-dot' }, pat);
  const gridRect = s('rect', { fill: 'url(#form-grid)' }, svg);
  const paraFill = s('path', { class: 'para grab' }, svg);
  const ghost = s('path', { class: 'ghost' }, svg);
  const result = s('path', { class: 'shape grab' }, svg);
  const skeleton = s('path', { class: 'skeleton' }, svg);
  const apexG = s('g', {}, svg);
  const hitG = s('g', {}, svg);
  const knobG = s('g', {}, svg);

  const edgeHits = [0, 1, 2, 3].map((i) => s('line', { class: 'edge-hit para-edge', 'data-edge': i }, hitG));
  const vertexKnobs = [0, 1, 2, 3].map((i) => s('rect', { class: 'anchor', 'data-vertex': i }, knobG));
  const vertexLabels = [0, 1, 2, 3].map((i) => { const t = s('text', { class: 'anchor-label' }, knobG); t.textContent = `P${i + 1}`; return t; });
  const apexKnobs = [0, 1, 2, 3].map((i) => s('circle', { class: 'apex', 'data-apex': i }, knobG));

  // ── inspector ────────────────────────────────────────────────────────────
  const commit = () => emit('form');
  const edgeCtl = state.form.edges.map((_, i) => {
    const mode = segmented({
      options: EDGE_MODES.map((m) => [m, m]),
      value: state.form.edges[i].mode,
      onChange: (v) => { state.form.edges[i].mode = v; commit(); },
    });
    const depth = slider({
      label: 'depth', min: 0.1, max: 3, step: 0.01, value: state.form.edges[i].depth, format: (v) => v.toFixed(2),
      onInput: (v) => { state.form.edges[i].depth = v; commit(); },
    });
    const flip = button('flip', () => { const e = state.form.edges[i]; e.flip = !e.flip; e.u = null; commit(); }, { title: 'mirror the shard along this edge' });
    const reset = button('reset apex', () => { Object.assign(state.form.edges[i], { u: null, depth: 1 }); commit(); }, { kind: 'ghost' });
    const el = h('div', { class: 'edge-block' }, h('div', { class: 'edge-title' }, `P${i + 1} → P${((i + 1) % 4) + 1}`), mode.el, depth.el, row(flip, reset));
    return { el, mode, depth };
  });

  const view3 = segmented({
    label: 'draw', options: [['curved', 'curves'], ['straight', 'straight']], value: state.form.view,
    onChange: (v) => { state.form.view = v; commit(); },
  });
  const bodyT = toggle({ label: 'fill the parallelogram', value: state.form.body, onChange: (v) => { state.form.body = v; commit(); } });
  const readout = h('div', { class: 'readout' });
  const nameInput = h('input', { type: 'text', placeholder: 'name this form', class: 'text' });

  const presetBtns = Object.entries(PRESETS).map(([name, p]) => button(name, () => {
    state.form.edges.forEach((e, i) => Object.assign(e, { mode: p.modes[i], flip: false, u: null, depth: 1 }));
    state.form.body = p.body;
    commit();
  }));

  const inspector = h('aside', { class: 'inspector' },
    section('presets', h('div', { class: 'row wrap' }, presetBtns),
      row(button('reset parallelogram', () => { state.form.para = tisaneForm().para; fitView(); commit(); }, { kind: 'ghost' }))),
    section('shape', view3.el, bodyT.el,
      toggle({ label: 'skeleton (straight lines)', value: opts.skeleton, onChange: (v) => { opts.skeleton = v; render(); } }).el,
      toggle({ label: 'apex lines', value: opts.apexLines, onChange: (v) => { opts.apexLines = v; render(); } }).el,
      readout),
    section('edges', note('Each edge can carry the current shard, seated outward or inward.'), edgeCtl.map((c) => c.el)),
    section('save',
      row(nameInput, button('save form', () => {
        saveItem('form', nameInput.value.trim(), snapshotForm());
        nameInput.value = '';
        toast('form saved to library');
      }, { kind: 'primary' })),
      row(button('export svg', exportSvg), button('export skeleton', () => exportSvg(true))),
    ),
  );
  root.append(stage, inspector);

  function fitView() {
    const built = buildForm(state.form, state.shard);
    const pts = [...built.para, ...built.polygon];
    view = unionBox(STAGE, padBox(bboxOf(pts), 80));
    const b = pathBBox(built.outlineD);
    view = unionBox(view, padBox(b, 40));
  }

  function exportSvg(skeletonOnly = false) {
    const built = buildForm(state.form, state.shard);
    const inner = skeletonOnly
      ? `<path d="${built.skeletonD}" fill="none" stroke="#2a2a2a" stroke-width="2"/>`
      : `<path d="${built.d}" fill="#2a2a2a"/>`;
    const b = padBox(pathBBox(skeletonOnly ? built.skeletonD : built.d), 20);
    download(skeletonOnly ? 'tisane-form-skeleton.svg' : 'tisane-form.svg', svgDocument(b, inner), 'image/svg+xml');
  }

  // ── pointer ──────────────────────────────────────────────────────────────
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target, p = userPoint(svg, e);
    if (t.dataset.vertex !== undefined) drag = { kind: 'vertex', i: +t.dataset.vertex, offset: sub(state.form.para[+t.dataset.vertex], p) };
    else if (t.dataset.apex !== undefined) drag = { kind: 'apex', i: +t.dataset.apex };
    else if (t.dataset.edge !== undefined) drag = { kind: 'edge', i: +t.dataset.edge, start: p, moved: false, last: p };
    else if (t === paraFill || t === result) drag = { kind: 'move', last: p };
    else return;
    svg.setPointerCapture(e.pointerId);
  });

  const onMove = frameThrottle(() => {
    if (!drag?.p) return;
    const f = state.form, p = drag.p;
    if (drag.kind === 'vertex') {
      moveVertex(f, drag.i, add(p, drag.offset));
    } else if (drag.kind === 'apex') {
      const i = drag.i, p0 = f.para[i], p1 = f.para[(i + 1) % 4];
      const built = buildForm(f, state.shard);
      const side = dot(perp(sub(p1, p0)), built.normals[i]) >= 0 ? 1 : -1;
      const { u, v } = toEdgeFrame(p, p0, p1);
      const vOut = v * side;
      const e = f.edges[i];
      e.u = clamp(u, -1, 2);
      e.depth = clamp(Math.abs(vOut) / apexFrame(state.shard).h, 0.05, 6);
      e.mode = vOut >= 0 ? 'out' : 'in';
    } else if (drag.kind === 'move' || drag.kind === 'edge') {
      if (drag.kind === 'edge' && dist(p, drag.start) < 4 * unitsPerPixel(svg) && !drag.moved) return;
      drag.moved = true;
      const m = translate(p.x - drag.last.x, p.y - drag.last.y);
      f.para = f.para.map((q) => apply(m, q));
      drag.last = p;
    }
    commit();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.p = userPoint(svg, e);
    onMove();
  });
  const end = () => {
    if (!drag) return;
    if (drag.kind === 'edge' && !drag.moved) {
      const e = state.form.edges[drag.i];
      e.mode = EDGE_MODES[(EDGE_MODES.indexOf(e.mode) + 1) % EDGE_MODES.length];
      commit();
    }
    drag = null;
    const before = view;
    fitView();
    if (before.w !== view.w || before.h !== view.h) render();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  // ── render ───────────────────────────────────────────────────────────────
  function render() {
    const f = state.form;
    const built = buildForm(f, state.shard);
    const u = unitsPerPixel(svg);
    attr(svg, { viewBox: viewBoxStr(view) });
    attr(gridRect, { x: view.x, y: view.y, width: view.w, height: view.h });
    attr(paraFill, { d: built.paraD, class: `para grab${f.body ? ' body' : ''}`, 'stroke-width': 1.2 * u });
    attr(result, { d: built.d });
    // Show the other rendering faintly so curves and their straight skeleton can be compared.
    const other = f.view === 'straight' ? (f.body ? built.outlineD : built.tris.filter(Boolean).map((t) => t.d).join('')) : '';
    attr(ghost, { d: other });
    attr(skeleton, { d: opts.skeleton ? built.skeletonD : '' });

    apexG.replaceChildren();
    if (opts.apexLines) {
      for (const [a, b] of apexLines(built.apexes)) s('line', { class: 'apex-line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'stroke-width': 1.4 * u }, apexG);
    }

    built.para.forEach((p0, i) => {
      const p1 = built.para[(i + 1) % 4];
      attr(edgeHits[i], { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, 'stroke-width': 16 * u });
      const r = 6.5 * u;
      attr(vertexKnobs[i], { x: p0.x - r, y: p0.y - r, width: 2 * r, height: 2 * r, 'stroke-width': 1.5 * u });
      const c = centroid(built.para), away = sub(p0, c), l = Math.hypot(away.x, away.y) || 1;
      attr(vertexLabels[i], { x: p0.x + (away.x / l) * 22 * u, y: p0.y + (away.y / l) * 22 * u, 'font-size': 11 * u });
      const tri = built.tris[i];
      attr(apexKnobs[i], tri
        ? { cx: tri.apex.x, cy: tri.apex.y, r: 6 * u, visibility: 'visible', 'stroke-width': 1.5 * u }
        : { visibility: 'hidden' });
      edgeCtl[i].mode.set(f.edges[i].mode);
      edgeCtl[i].depth.set(f.edges[i].depth);
    });
    view3.set(f.view);
    bodyT.set(f.body);

    const lines = apexLines(built.apexes).map(([a, b]) => {
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return h('div', {}, `apex line · ${Math.round(dist(a, b))}u · ${Math.round(((deg % 180) + 180) % 180)}°`);
    });
    readout.replaceChildren(
      h('div', { class: 'readout-big' }, f.body ? built.name : `${built.apexes.length || 'no'} shard${built.apexes.length === 1 ? '' : 's'}`),
      h('div', {}, `skeleton · ${built.name} · ${built.polygon.length} vertices`),
      ...lines,
    );
  }

  on('form', render);
  on('shard', render);
  // Knobs are sized in screen pixels, so re-measure whenever the stage changes size.
  new ResizeObserver(() => { if (state.room === 'form') render(); }).observe(stage);
  fitView();
  return { show() { fitView(); render(); } };
}
