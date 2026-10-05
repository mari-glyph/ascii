// ascii.js — room 05
// The original ASCII animation tool, now one room of the workshop. Its source can be any
// workshop output (shard, form, edge, fill) or an uploaded image; brightness and contrast
// animate between a start and end state and export as GIF or video.

import { state, emit, on, sources } from '../store.js';
import { rasterize, download } from '../core/svg.js';
import { renderAsciiFrame } from '../ascii/render.js';
import { generateFrames, Player } from '../ascii/frames.js';
import { exportGif, exportVideo } from '../ascii/export.js';
import { h, section, row, note, button, segmented, toggle, slider, select, colorInput, filePicker, toast, frameThrottle } from '../ui.js';

const FONTS = [
  ["'JetBrains Mono', monospace", 'JetBrains Mono'],
  ["'IBM Plex Mono', monospace", 'IBM Plex Mono'],
  ["'Fira Code', monospace", 'Fira Code'],
  ["'Source Code Pro', monospace", 'Source Code Pro'],
  ["'Roboto Mono', monospace", 'Roboto Mono'],
  ["'Ubuntu Mono', monospace", 'Ubuntu Mono'],
  ["'Inconsolata', monospace", 'Inconsolata'],
  ["'Courier New', monospace", 'Courier New'],
];
const THEMES = { paper: { fg: '#2a2a2a', bg: '#f2ead8' }, terminal: { fg: '#00ff00', bg: '#0a0a0a' } };

const DEFAULTS = {
  source: 'form',
  columns: 120, blockSize: 1, font: FONTS[0][0], fontSize: 6,
  charset: 'dense', manualCharset: '@#%*+=-:. ', edgeMethod: 'none', dither: 'floyd', invert: false,
  start: { brightness: 0, contrast: 0 }, end: { brightness: 50, contrast: 50 },
  frames: 30, fps: 12, theme: 'paper', ...THEMES.paper,
};

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`couldn’t read ${file.name}`)); };
    img.src = url;
  });
}

export function mount(root) {
  state.ascii = { ...DEFAULTS, ...state.ascii, start: { ...DEFAULTS.start, ...state.ascii.start }, end: { ...DEFAULTS.end, ...state.ascii.end } };
  const A = state.ascii;
  let image = null, uploaded = null, dirty = true, frames = [];
  const player = { current: null };

  // ── stage ────────────────────────────────────────────────────────────────
  const stage = h('div', { class: 'stage ascii-stage' });
  const preStart = h('pre', { class: 'ascii' }), preEnd = h('pre', { class: 'ascii' }), preAnim = h('pre', { class: 'ascii' });
  const dual = h('div', { class: 'ascii-dual' },
    h('figure', {}, h('figcaption', {}, 'start'), preStart),
    h('figure', {}, h('figcaption', {}, 'end'), preEnd));
  const anim = h('div', { class: 'ascii-anim', hidden: true }, h('figure', {}, h('figcaption', {}, 'animation'), preAnim));
  stage.append(dual, anim);
  player.current = new Player(preAnim);

  // ── inspector ────────────────────────────────────────────────────────────
  const commit = () => emit('ascii');
  const set = (k) => (v) => { A[k] = v; commit(); };
  const status = h('div', { class: 'readout' });
  const progress = h('progress', { max: 1, value: 0 });
  const manualRow = h('input', { type: 'text', class: 'text', value: A.manualCharset, placeholder: 'dark → light characters' });
  manualRow.addEventListener('input', () => { A.manualCharset = manualRow.value; commit(); });
  const fgCtl = colorInput({ label: 'ink', value: A.fg, onInput: (v) => { A.fg = v; paint(); commit(); } });
  const bgCtl = colorInput({ label: 'paper', value: A.bg, onInput: (v) => { A.bg = v; paint(); commit(); } });
  const playBtn = button('play', togglePlay);
  const sourceCtl = segmented({
    options: [['shard', 'shard'], ['form', 'form'], ['edge', 'edge'], ['fill', 'fill'], ['upload', 'image']],
    value: A.source,
    onChange: (v) => { A.source = v; dirty = true; commit(); },
  });

  const inspector = h('aside', { class: 'inspector' },
    section('source',
      sourceCtl.el,
      row(filePicker({ label: 'upload image', accept: 'image/*', dropTarget: stage, onFile: async (file) => {
        try { uploaded = await loadImageFile(file); A.source = 'upload'; sourceCtl.set('upload'); dirty = true; commit(); toast(`loaded ${file.name}`); } catch (err) { toast(err.message, 'error'); }
      } })),
      status,
    ),
    section('render',
      slider({ label: 'columns', min: 20, max: 400, value: A.columns, onInput: set('columns') }).el,
      slider({ label: 'pixelation', min: 1, max: 20, value: A.blockSize, onInput: set('blockSize') }).el,
      slider({ label: 'font size', min: 2, max: 20, step: 0.5, value: A.fontSize, format: (v) => `${v}px`, onInput: (v) => { A.fontSize = v; paint(); commit(); } }).el,
      select({ label: 'font', options: FONTS, value: A.font, onChange: (v) => { A.font = v; paint(); commit(); } }).el,
      select({ label: 'charset', options: [['dense', 'dense'], ['standard', 'standard'], ['blocks', 'blocks'], ['binary', 'binary'], ['hex', 'hex'], ['manual', 'manual']], value: A.charset, onChange: set('charset') }).el,
      manualRow,
      select({ label: 'edges', options: [['none', 'none'], ['sobel', 'sobel'], ['dog', 'contour (DoG)']], value: A.edgeMethod, onChange: set('edgeMethod') }).el,
      select({ label: 'dither', options: [['none', 'none'], ['floyd', 'floyd–steinberg'], ['atkinson', 'atkinson'], ['noise', 'noise'], ['ordered', 'ordered']], value: A.dither, onChange: set('dither') }).el,
      toggle({ label: 'invert', value: A.invert, onChange: set('invert') }).el,
    ),
    section('animate',
      note('Brightness and contrast ease from start to end across the frames.'),
      slider({ label: 'bright · start', min: -200, max: 200, value: A.start.brightness, onInput: (v) => { A.start.brightness = v; commit(); } }).el,
      slider({ label: 'bright · end', min: -200, max: 200, value: A.end.brightness, onInput: (v) => { A.end.brightness = v; commit(); } }).el,
      slider({ label: 'contrast · start', min: -255, max: 255, value: A.start.contrast, onInput: (v) => { A.start.contrast = v; commit(); } }).el,
      slider({ label: 'contrast · end', min: -255, max: 255, value: A.end.contrast, onInput: (v) => { A.end.contrast = v; commit(); } }).el,
      slider({ label: 'frames', min: 2, max: 120, value: A.frames, onInput: set('frames') }).el,
      slider({ label: 'fps', min: 1, max: 60, value: A.fps, onInput: set('fps') }).el,
    ),
    section('colour',
      segmented({ label: 'theme', options: [['paper', 'paper'], ['terminal', 'terminal']], value: A.theme, onChange: (v) => {
        Object.assign(A, { theme: v }, THEMES[v]); fgCtl.set(A.fg); bgCtl.set(A.bg); paint(); commit();
      } }).el,
      fgCtl.el, bgCtl.el,
    ),
    section('output',
      row(button('generate', generate, { kind: 'primary' }), playBtn),
      progress,
      row(button('export gif', () => exportWith(exportGif)), button('export video', () => exportWith(exportVideo))),
      row(button('copy text', () => {
        navigator.clipboard?.writeText(preStart.textContent).then(() => toast('copied'), () => toast('clipboard blocked', 'error'));
      }, { kind: 'ghost' })),
    ),
  );
  root.append(stage, inspector);

  // ── source + preview ─────────────────────────────────────────────────────
  async function loadSource() {
    dirty = false;
    if (A.source === 'upload') {
      image = uploaded;
      status.textContent = uploaded ? 'uploaded image' : 'upload or drop an image';
      return;
    }
    const make = sources[A.source];
    if (!make) return;
    try {
      image = await rasterize(make(), 900, '#ffffff');
      status.textContent = `from the ${A.source} room`;
    } catch (err) {
      image = null;
      status.textContent = err.message;
    }
  }

  const base = () => ({
    asciiWidth: A.columns, blockSize: A.blockSize, charset: A.charset, manualCharset: A.manualCharset,
    edgeMethod: A.edgeMethod, dither: A.dither, invert: A.invert,
  });

  function paint() {
    for (const pre of [preStart, preEnd, preAnim]) {
      Object.assign(pre.style, { fontFamily: A.font, fontSize: `${A.fontSize}px`, lineHeight: `${A.fontSize}px`, color: A.fg, background: A.bg });
    }
  }

  function showDual() {
    if (player.current.playing) togglePlay();
    dual.hidden = false;
    anim.hidden = true;
  }

  async function preview() {
    if (state.room !== 'ascii') return;
    if (dirty) await loadSource();
    manualRow.hidden = A.charset !== 'manual';
    paint();
    if (!image) { preStart.textContent = preEnd.textContent = ''; return; }
    showDual();
    preStart.textContent = renderAsciiFrame(image, { ...base(), ...A.start }).ascii;
    preEnd.textContent = renderAsciiFrame(image, { ...base(), ...A.end }).ascii;
  }

  // ── animation + export ───────────────────────────────────────────────────
  async function generate() {
    if (!image) { toast('no source image yet', 'error'); return; }
    dual.hidden = true;
    anim.hidden = false;
    progress.value = 0;
    frames = await generateFrames(image, {
      base: base(), start: A.start, end: A.end, count: A.frames,
      onProgress: (p, f) => { progress.value = p; preAnim.textContent = f.ascii; },
    });
    togglePlay();
  }

  function togglePlay() {
    const p = player.current;
    if (p.playing) { p.stop(); playBtn.textContent = 'play'; return; }
    if (!frames.length) { toast('generate frames first'); return; }
    dual.hidden = true;
    anim.hidden = false;
    p.play(frames, A.fps);
    playBtn.textContent = 'pause';
  }

  async function exportWith(fn) {
    try {
      progress.value = 0;
      const { blob, extension } = await fn(frames, {
        fps: A.fps, fontSize: 10, fontFamily: A.font, color: A.fg, background: A.bg,
        onProgress: (p) => { progress.value = p; },
      });
      progress.value = 1;
      download(`tisane-ascii.${extension}`, blob);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Other rooms only change while this one is hidden, so re-rasterise the source on every show.
  const throttled = frameThrottle(preview);
  on('ascii', throttled);
  return { show() { sourceCtl.set(A.source); dirty = true; preview(); } };
}
