// fill.js — room 04
// Custom gradient fills built from three-point shapes: a lattice of motifs whose size, colour and
// rotation follow a linear, radial or conic field. Drag on the canvas to aim the gradient. Fills
// save to the library with a snapshot of their motif, so they survive later shard edits.

import { state, emit, on, saveItem, motifOptions, resolveMotif, sources } from '../store.js';
import { s, attr, userPoint, viewBoxStr, pathBBox, svgDocument, download, rasterize, downloadCanvas } from '../core/svg.js';
import { fillMarkup, fillBox, FILL_DEFAULTS, ASPECTS } from '../core/fill.js';
import { sampleStops, cssGradient } from '../core/color.js';
import { h, section, row, note, button, segmented, toggle, slider, select, colorInput, toast, frameThrottle } from '../ui.js';

// snapshot / clipSnapshot hold the motif and clip shapes a saved fill was made with.
const DEFAULTS = { ...FILL_DEFAULTS, motif: 'live:shard', snapshot: null, clipSnapshot: null };

export function mount(root) {
  state.fill = { ...DEFAULTS, ...state.fill };
  const F = state.fill;

  // ── stage ────────────────────────────────────────────────────────────────
  const stage = h('div', { class: 'stage' });
  const svg = s('svg', { class: 'stage-svg aim', preserveAspectRatio: 'xMidYMid meet' });
  const content = s('g', {}, svg);
  const frame = s('rect', { class: 'frame' }, svg);
  const aimDot = s('circle', { class: 'aim-dot', r: 7 }, svg);
  stage.append(svg, h('div', { class: 'stage-hint' }, 'drag on the canvas to aim the gradient'));

  // ── inspector ────────────────────────────────────────────────────────────
  const commit = () => emit('fill');
  const set = (k) => (v) => { F[k] = v; commit(); };
  const ctl = {};

  const motifChoices = () => [...(F.snapshot ? [['snapshot', 'saved with this fill']] : []), ...motifOptions()];
  ctl.motif = select({ label: 'motif', options: motifChoices(), value: F.motif, onChange: set('motif') });
  const clipChoices = () => [['none', 'none'], ...(F.clipSnapshot ? [['snapshot', 'saved with this fill']] : []), ...motifOptions()];
  ctl.clip = select({ label: 'clip to', options: clipChoices(), value: F.clip, onChange: set('clip') });

  ctl.layout = segmented({ label: 'lattice', options: [['grid', 'grid'], ['brick', 'brick'], ['tri', 'tri'], ['radial', 'rings']], value: F.layout, onChange: set('layout') });
  ctl.cell = slider({ label: 'cell', min: 16, max: 200, step: 1, value: F.cell, onInput: set('cell') });
  ctl.jitter = slider({ label: 'jitter', min: 0, max: 1, step: 0.01, value: F.jitter, format: (v) => v.toFixed(2), onInput: set('jitter') });
  ctl.gradient = segmented({ label: 'field', options: [['linear', 'linear'], ['radial', 'radial'], ['conic', 'conic']], value: F.gradient, onChange: set('gradient') });
  ctl.angle = slider({ label: 'angle', min: 0, max: 360, step: 1, value: F.angle, format: (v) => `${Math.round(v)}°`, onInput: set('angle') });
  ctl.cx = slider({ label: 'centre x', min: 0, max: 1, step: 0.01, value: F.cx, format: (v) => v.toFixed(2), onInput: set('cx') });
  ctl.cy = slider({ label: 'centre y', min: 0, max: 1, step: 0.01, value: F.cy, format: (v) => v.toFixed(2), onInput: set('cy') });
  ctl.ease = segmented({ label: 'ease', options: [['linear', 'linear'], ['smooth', 'smooth'], ['steps', 'steps']], value: F.ease, onChange: set('ease') });
  ctl.sizeFrom = slider({ label: 'size from', min: 0, max: 2, step: 0.01, value: F.sizeFrom, format: (v) => v.toFixed(2), onInput: set('sizeFrom') });
  ctl.sizeTo = slider({ label: 'size to', min: 0, max: 2, step: 0.01, value: F.sizeTo, format: (v) => v.toFixed(2), onInput: set('sizeTo') });
  ctl.rotate = slider({ label: 'rotate', min: -180, max: 180, step: 1, value: F.rotate, format: (v) => `${v}°`, onInput: set('rotate') });
  ctl.rotateSpan = slider({ label: 'twist', min: -360, max: 360, step: 1, value: F.rotateSpan, format: (v) => `${v}°`, onInput: set('rotateSpan') });
  ctl.aspect = select({ label: 'canvas', options: Object.keys(ASPECTS).map((k) => [k, k]), value: F.aspect, onChange: set('aspect') });
  ctl.bg = colorInput({ label: 'background', value: F.background || '#f2ead8', onInput: (v) => { F.background = v; ctl.bgOn.set(true); commit(); } });
  ctl.bgOn = toggle({ label: 'background on', value: !!F.background, onChange: (v) => { F.background = v ? ctl.bg.input.value : null; commit(); } });

  // Stops editor: preview bar + one row per stop.
  const stopBar = h('div', { class: 'stop-bar' });
  const stopList = h('div', { class: 'stops' });
  function renderStops() {
    stopBar.style.background = cssGradient(F.stops);
    stopList.replaceChildren(...F.stops.map((st, i) => {
      const c = colorInput({ label: '', value: st.color, onInput: (v) => { st.color = v; stopBar.style.background = cssGradient(F.stops); commit(); } });
      const at = slider({ label: '', min: 0, max: 1, step: 0.01, value: st.at, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { st.at = v; stopBar.style.background = cssGradient(F.stops); commit(); } });
      const rm = button('×', () => { F.stops.splice(i, 1); renderStops(); commit(); }, { kind: 'ghost icon', title: 'remove stop' });
      rm.disabled = F.stops.length <= 2;
      return h('div', { class: 'stop' }, c.input, at.el, rm);
    }));
  }
  const addStop = () => {
    // Add at the middle of the widest gap, coloured as the gradient already is there.
    const sorted = [...F.stops].sort((a, b) => a.at - b.at);
    let best = 0, at = 0.5;
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = sorted[i + 1].at - sorted[i].at;
      if (g > best) { best = g; at = (sorted[i].at + sorted[i + 1].at) / 2; }
    }
    F.stops.push({ at, color: sampleStops(F.stops, at) });
    renderStops();
    commit();
  };

  const count = h('div', { class: 'readout' });
  const nameInput = h('input', { type: 'text', placeholder: 'name this fill', class: 'text' });

  const inspector = h('aside', { class: 'inspector' },
    section('motif', ctl.motif.el, note('Use the current form for paired shards — the default form is the tisane hash.')),
    section('lattice', ctl.layout.el, ctl.cell.el, ctl.jitter.el,
      row(button('reshuffle', () => { F.seed = (F.seed + 1) % 100000; commit(); }, { kind: 'ghost' }))),
    section('gradient', ctl.gradient.el, ctl.angle.el, ctl.cx.el, ctl.cy.el, ctl.ease.el),
    section('maps to',
      ctl.sizeFrom.el, ctl.sizeTo.el, ctl.rotate.el, ctl.rotateSpan.el,
      h('div', { class: 'ctl-label' }, 'colour stops'), stopBar, stopList,
      row(button('+ stop', addStop), button('reverse', () => { F.stops.forEach((st) => { st.at = 1 - st.at; }); renderStops(); commit(); }))),
    section('canvas', ctl.aspect.el, ctl.clip.el, ctl.bgOn.el, ctl.bg.el),
    section('save', count,
      row(nameInput, button('save fill', saveFill, { kind: 'primary' })),
      row(button('export svg', () => download('tisane-fill.svg', compute().svgText, 'image/svg+xml')),
        button('export png', async () => downloadCanvas('tisane-fill.png', await rasterize(compute().svgText, 2000)))),
      row(button('send to ascii →', () => { state.ascii.source = 'fill'; state.room = 'ascii'; emit('room'); }, { kind: 'ghost' })),
    ),
  );
  root.append(stage, inspector);

  function motif() {
    if (F.motif === 'snapshot' && F.snapshot) return { ...F.snapshot, box: pathBBox(F.snapshot.d) };
    return resolveMotif(F.motif);
  }

  function clipShape() {
    if (!F.clip || F.clip === 'none') return null;
    if (F.clip === 'snapshot') return F.clipSnapshot ? { d: F.clipSnapshot.d, box: pathBBox(F.clipSnapshot.d) } : null;
    return resolveMotif(F.clip);
  }

  function saveFill() {
    const m = motif(), c = clipShape();
    const { snapshot, clipSnapshot, ...params } = F;
    const fill = JSON.parse(JSON.stringify({ ...params, motif: 'snapshot', clip: c ? 'snapshot' : 'none' }));
    saveItem('fill', nameInput.value.trim(), { fill, motif: { d: m.d, frame: m.frame }, ...(c ? { clip: { d: c.d } } : {}) });
    nameInput.value = '';
    toast('fill saved to library');
  }

  function compute() {
    const out = fillMarkup(F, motif(), { idPrefix: 'fill', clip: clipShape() });
    return { ...out, svgText: svgDocument(out.box, out.markup) };
  }

  // ── aiming ───────────────────────────────────────────────────────────────
  let aiming = false;
  const aim = (e) => {
    const box = fillBox(F.aspect), p = userPoint(svg, e);
    if (F.gradient === 'linear') {
      F.angle = Math.round(((Math.atan2(p.y - box.h / 2, p.x - box.w / 2) * 180) / Math.PI + 360) % 360);
    } else {
      F.cx = Math.max(0, Math.min(1, p.x / box.w));
      F.cy = Math.max(0, Math.min(1, p.y / box.h));
    }
    commit();
  };
  svg.addEventListener('pointerdown', (e) => { if (e.button === 0) { aiming = true; svg.setPointerCapture(e.pointerId); aim(e); } });
  svg.addEventListener('pointermove', (e) => { if (aiming) aim(e); });
  svg.addEventListener('pointerup', () => { aiming = false; });
  svg.addEventListener('pointercancel', () => { aiming = false; });

  // ── render ───────────────────────────────────────────────────────────────
  function syncControls() {
    for (const k of ['cell', 'jitter', 'angle', 'cx', 'cy', 'sizeFrom', 'sizeTo', 'rotate', 'rotateSpan']) ctl[k].set(F[k]);
    for (const k of ['layout', 'gradient', 'ease', 'aspect']) ctl[k].set(F[k]);
    ctl.motif.setOptions(motifChoices(), F.motif);
    ctl.clip.setOptions(clipChoices(), F.clip);
    ctl.bgOn.set(!!F.background);
    if (F.background) ctl.bg.set(F.background);
    ctl.angle.el.classList.toggle('disabled', F.gradient === 'radial');
    ctl.cx.el.classList.toggle('disabled', F.gradient === 'linear');
    ctl.cy.el.classList.toggle('disabled', F.gradient === 'linear');
  }

  function render() {
    if (state.room !== 'fill') return;
    const { box, markup, count: n } = compute();
    attr(svg, { viewBox: viewBoxStr({ x: -20, y: -20, w: box.w + 40, h: box.h + 40 }) });
    content.innerHTML = markup;
    attr(frame, { x: 0, y: 0, width: box.w, height: box.h });
    const c = F.gradient === 'linear'
      ? { x: box.w / 2 + Math.cos((F.angle * Math.PI) / 180) * box.w * 0.35, y: box.h / 2 + Math.sin((F.angle * Math.PI) / 180) * box.h * 0.35 }
      : { x: F.cx * box.w, y: F.cy * box.h };
    attr(aimDot, { cx: c.x, cy: c.y });
    count.textContent = `${n} stamps`;
    syncControls();
  }

  // Load a saved fill (called from the library rail).
  function load(item) {
    Object.assign(F, DEFAULTS, JSON.parse(JSON.stringify(item.data.fill)), {
      motif: 'snapshot', snapshot: item.data.motif,
      clip: item.data.clip ? 'snapshot' : 'none', clipSnapshot: item.data.clip || null,
    });
    renderStops();
    commit();
  }

  sources.fill = () => compute().svgText;
  renderStops();
  const throttled = frameThrottle(render);
  on('fill', throttled);
  on('shard', throttled);
  on('form', throttled);
  on('library', throttled);
  return { show: render, load };
}
