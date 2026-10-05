// svg.js
// DOM-side SVG helpers: element creation, pointer → user space, sanitising imported files,
// sampling any artwork's outlines into polylines, and serialise/rasterise/download.

import { pt, bboxOf, dist } from './geometry.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function s(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  attr(node, attrs);
  if (parent) parent.appendChild(node);
  return node;
}

export function attr(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) node.removeAttribute(k);
    else node.setAttribute(k, v === true ? '' : v);
  }
  return node;
}

export function userPoint(svg, evt) {
  const m = svg.getScreenCTM();
  if (!m) return pt(0, 0);
  const p = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(m.inverse());
  return pt(p.x, p.y);
}

// Units per screen pixel, so knobs and strokes keep a constant on-screen size at any zoom.
export function unitsPerPixel(svg) {
  const m = svg.getScreenCTM();
  return m ? 1 / Math.hypot(m.a, m.b) : 1;
}

export const viewBoxStr = (b) => `${b.x} ${b.y} ${b.w} ${b.h}`;

export function padBox(b, pad) {
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

export function unionBox(a, b) {
  return bboxOf([pt(a.x, a.y), pt(a.x + a.w, a.y + a.h), pt(b.x, b.y), pt(b.x + b.w, b.y + b.h)]);
}

// ── Measuring ───────────────────────────────────────────────────────────────
// One hidden, rendered SVG (no viewBox, so user units = its own units) for getBBox/getCTM work.

let measurer = null;
function measureRoot() {
  if (!measurer) {
    measurer = s('svg', { width: 10, height: 10, 'aria-hidden': 'true' });
    measurer.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(measurer);
  }
  return measurer;
}

export function pathBBox(d) {
  const p = s('path', { d }, measureRoot());
  try {
    const b = p.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } finally {
    p.remove();
  }
}

const GEOMETRY = 'path, circle, ellipse, rect, polygon, polyline, line';
const NOT_DRAWN = 'defs, clipPath, mask, symbol, pattern, marker, metadata';

// Sample every drawn outline in `markup` into polylines (in the artwork's own user space).
// Subpaths are split where consecutive samples jump; `closed` marks loops.
export function sampleOutlines(markup, { spacing = 2, maxSamples = 6000 } = {}) {
  const g = s('g', {}, measureRoot());
  g.innerHTML = markup;
  const out = [];
  try {
    const rootM = g.getScreenCTM().inverse();
    for (const el of g.querySelectorAll(GEOMETRY)) {
      if (el.closest(NOT_DRAWN)) continue;
      let L = 0;
      try { L = el.getTotalLength(); } catch { continue; }
      if (!(L > 0)) continue;
      const m = rootM.multiply(el.getScreenCTM());
      const n = Math.min(maxSamples, Math.max(24, Math.ceil(L / spacing)));
      const step = L / n;
      const forced = /^(circle|ellipse|rect|polygon)$/.test(el.tagName);
      let run = [];
      let prevLocal = null;
      const flush = () => {
        if (run.length > 1) {
          const closed = forced || dist(run[0], run[run.length - 1]) < Math.max(step * 2, 1e-3);
          if (closed && dist(run[0], run[run.length - 1]) < 1e-6) run.pop();
          out.push({ points: run, closed });
        }
        run = [];
      };
      for (let k = 0; k <= n; k++) {
        const p = el.getPointAtLength(Math.min(L, k * step));
        if (prevLocal && Math.hypot(p.x - prevLocal.x, p.y - prevLocal.y) > step * 4) flush();
        prevLocal = { x: p.x, y: p.y };
        const q = new DOMPoint(p.x, p.y).matrixTransform(m);
        run.push(pt(q.x, q.y));
      }
      flush();
    }
  } finally {
    g.remove();
  }
  return out;
}

export function markupBBox(markup) {
  const g = s('g', {}, measureRoot());
  g.innerHTML = markup;
  try {
    const b = g.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } finally {
    g.remove();
  }
}

// ── Importing ───────────────────────────────────────────────────────────────

// Parse user SVG text, strip anything executable, and return its viewBox + inner markup.
export function importSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('that doesn’t look like an SVG file');
  }
  root.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove());
  for (const node of root.querySelectorAll('*')) {
    for (const a of [...node.attributes]) {
      const v = a.value.trim().toLowerCase();
      if (a.name.startsWith('on') || ((a.name === 'href' || a.name === 'xlink:href') && v.startsWith('javascript:'))) {
        node.removeAttribute(a.name);
      }
    }
  }
  let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'));
    vb = w > 0 && h > 0 ? [0, 0, w, h] : null;
  }
  const markup = root.innerHTML;
  const box = vb ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] } : markupBBox(markup);
  return { markup, box };
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

// ── Exporting ───────────────────────────────────────────────────────────────

export function svgDocument(box, inner, { background = null } = {}) {
  const bg = background ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxStr(box)}" width="${Math.round(box.w)}" height="${Math.round(box.h)}">${bg}${inner}</svg>`;
}

export function rasterize(svgText, width = 1200, background = null) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width) || 1;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(width * ratio));
      const ctx = canvas.getContext('2d');
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not rasterise SVG')); };
    img.src = url;
  });
}

export function download(filename, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCanvas(filename, canvas) {
  canvas.toBlob((blob) => blob && download(filename, blob), 'image/png');
}

export const slug = (name) => (name || 'tisane').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tisane';
