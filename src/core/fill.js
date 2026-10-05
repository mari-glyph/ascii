// fill.js
// Gradient fills built from motifs: a lattice of stamps whose size, colour and rotation are
// driven by a gradient field (linear, radial or conic) — a halftone made of shards.

import { pt, dist, rng, fm, clamp } from './geometry.js';
import { stampAt } from './motif.js';
import { sampleStops } from './color.js';

export const FILL_DEFAULTS = {
  layout: 'tri',        // grid | brick | tri | radial
  cell: 56,             // lattice spacing in stage units (stage is 1000 wide)
  jitter: 0,            // 0..1 position/rotation noise
  seed: 7,
  gradient: 'linear',   // linear | radial | conic
  angle: 90,            // degrees; linear direction / conic start
  cx: 0.5, cy: 0.5,     // radial/conic centre, 0..1 of the canvas
  ease: 'linear',       // linear | smooth | steps
  sizeFrom: 0.2, sizeTo: 1.1, // stamp size at t=0 / t=1, as a fraction of the cell
  rotate: 0, rotateSpan: 0,   // degrees at t=0, added degrees by t=1
  stops: [{ at: 0, color: '#2a2a2a' }, { at: 0.55, color: '#8a5a2a' }, { at: 1, color: '#c9837a' }],
  aspect: '1:1',
  background: '#f2ead8',
  clip: 'none',         // motif ref to clip the field to, or 'none'
};

export const ASPECTS = { '1:1': 1, '4:5': 1.25, '3:2': 2 / 3, '16:9': 9 / 16, '3:1': 1 / 3, '9:16': 16 / 9 };

export const fillBox = (aspect) => ({ x: 0, y: 0, w: 1000, h: Math.round(1000 * (ASPECTS[aspect] || 1)) });

function easeT(t, ease) {
  t = clamp(t, 0, 1);
  if (ease === 'smooth') return t * t * (3 - 2 * t);
  if (ease === 'steps') return Math.min(4, Math.floor(t * 5)) / 4;
  return t;
}

function field(o, box) {
  const c = pt(box.w * o.cx, box.h * o.cy);
  const a = (o.angle * Math.PI) / 180;
  if (o.gradient === 'radial') {
    const R = Math.max(...[pt(0, 0), pt(box.w, 0), pt(0, box.h), pt(box.w, box.h)].map((q) => dist(q, c))) || 1;
    return (p) => dist(p, c) / R;
  }
  if (o.gradient === 'conic') {
    return (p) => {
      const t = (Math.atan2(p.y - c.y, p.x - c.x) - a) / (2 * Math.PI);
      return t - Math.floor(t);
    };
  }
  const dir = pt(Math.cos(a), Math.sin(a));
  const ext = (Math.abs(dir.x) * box.w + Math.abs(dir.y) * box.h) / 2 || 1;
  return (p) => (((p.x - box.w / 2) * dir.x + (p.y - box.h / 2) * dir.y) / ext + 1) / 2;
}

// Lattice sites: { p, rot } with rot in radians (tri flips every other cell; radial follows rings).
function lattice(o, box) {
  const sites = [];
  const c = o.cell;
  if (o.layout === 'radial') {
    const ctr = pt(box.w * o.cx, box.h * o.cy);
    const R = Math.hypot(Math.max(ctr.x, box.w - ctr.x), Math.max(ctr.y, box.h - ctr.y));
    sites.push({ p: ctr, rot: 0 });
    for (let r = c; r <= R + c; r += c) {
      const n = Math.max(6, Math.round((2 * Math.PI * r) / c));
      for (let k = 0; k < n; k++) {
        const th = (k / n) * 2 * Math.PI;
        sites.push({ p: pt(ctr.x + r * Math.cos(th), ctr.y + r * Math.sin(th)), rot: th + Math.PI / 2 });
      }
    }
    return sites;
  }
  if (o.layout === 'tri') {
    const rh = (c * Math.sqrt(3)) / 2;
    for (let j = -1, y = -rh / 2; y < box.h + rh; j++, y += rh) {
      for (let k = -2, x = -c; x < box.w + c; k++, x += c / 2) {
        sites.push({ p: pt(x, y + rh / 2), rot: (k + j) % 2 === 0 ? 0 : Math.PI });
      }
    }
    return sites;
  }
  for (let j = 0, y = c / 2 - c; y < box.h + c; j++, y += c) {
    const shift = o.layout === 'brick' && j % 2 ? c / 2 : 0;
    for (let x = c / 2 - c + shift; x < box.w + c; x += c) sites.push({ p: pt(x, y), rot: 0 });
  }
  return sites;
}

// Returns [{ m, color }].
export function layoutFill(opts, motif, box) {
  const o = { ...FILL_DEFAULTS, ...opts, cell: Math.max(12, opts.cell ?? FILL_DEFAULTS.cell) };
  const tAt = field(o, box);
  const rand = rng(o.seed);
  const stamps = [];
  for (const { p, rot } of lattice(o, box)) {
    const jx = (rand() - 0.5) * o.jitter * o.cell, jy = (rand() - 0.5) * o.jitter * o.cell;
    const jr = (rand() - 0.5) * o.jitter * Math.PI * 0.5;
    const q = pt(p.x + jx, p.y + jy);
    const t = easeT(tAt(q), o.ease);
    const size = (o.sizeFrom + (o.sizeTo - o.sizeFrom) * t) * o.cell;
    if (size < o.cell * 0.02) continue;
    const deg = o.rotate + o.rotateSpan * t;
    stamps.push({ m: stampAt(motif, q, size, rot + jr + (deg * Math.PI) / 180), color: sampleStops(o.stops, t) });
  }
  return stamps;
}

// Matrix that fits a motif inside the canvas with a margin (used for the clip shape).
export function containMatrix(motifBox, box, margin = 0.06) {
  const k = Math.min((box.w * (1 - 2 * margin)) / (motifBox.w || 1), (box.h * (1 - 2 * margin)) / (motifBox.h || 1));
  return [k, 0, 0, k, box.w / 2 - k * (motifBox.x + motifBox.w / 2), box.h / 2 - k * (motifBox.y + motifBox.h / 2)];
}

// clip: optional motif to clip the field to (fitted inside the canvas).
export function fillMarkup(opts, motif, { idPrefix = 'fill', clip = null } = {}) {
  const o = { ...FILL_DEFAULTS, ...opts };
  const box = fillBox(o.aspect);
  const stamps = layoutFill(o, motif, box);
  const id = `${idPrefix}-motif`;
  const clipId = `${idPrefix}-clip`;
  const uses = stamps.map(({ m, color }) => `<use href="#${id}" transform="${fm(m)}" fill="${color}"/>`).join('');
  // The lattice overruns the canvas by a cell so edges stay full; clip it back to the canvas.
  const clipDef = `<clipPath id="${clipId}-box"><rect width="${box.w}" height="${box.h}"/></clipPath>`
    + (clip ? `<clipPath id="${clipId}"><path d="${clip.d}" transform="${fm(containMatrix(clip.box, box))}"/></clipPath>` : '');
  const defs = `<defs><path id="${id}" d="${motif.d}"/>${clipDef}</defs>`;
  const bg = o.background ? `<rect width="${box.w}" height="${box.h}" fill="${o.background}"/>` : '';
  const field = clip ? `<g clip-path="url(#${clipId})">${uses}</g>` : uses;
  return { box, count: stamps.length, markup: `${defs}${bg}<g clip-path="url(#${clipId}-box)">${field}</g>` };
}
