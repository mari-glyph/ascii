// edge.js
// Seat shrunken copies of a motif end-to-end along outlines. Each copy's base (A→B) becomes a
// chord of the outline and its apex points away from the shape, so a shard becomes a row of
// teeth/scales tracing the artwork.

import { sub, add, mul, dist, norm, lerp, signedArea, fm } from './geometry.js';
import { mapOntoEdge } from './shard.js';
import { stampAt } from './motif.js';

export const EDGE_DEFAULTS = {
  size: 4,          // motif base, % of the artwork's diagonal
  gap: 0.15,        // space between motifs, as a fraction of size (negative overlaps)
  depth: 1,         // apex height multiplier (1 = the motif's own proportions)
  offset: 0,        // push off the outline, as a fraction of size (+ outward)
  side: 'out',      // out | in | alt
  rhythm: 'none',   // none | flip | pairs (pairs adds each copy's 180° twin, like the mark)
  orient: 'hug',    // hug (base on the outline) | upright (no rotation)
  rotate: 0,        // extra rotation in degrees (upright only)
};

// Arc-length parametrisation of a polyline.
function walker(points, closed) {
  const pts = closed ? [...points, points[0]] : points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1];
  const at = (s) => {
    if (closed) s = ((s % L) + L) % L;
    else s = Math.max(0, Math.min(L, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1;
    return lerp(pts[lo], pts[hi], (s - cum[lo]) / seg);
  };
  return { L, at };
}

// Returns [{ m, tone }] – one affine per stamped copy; tone 1 marks the alternate copies.
export function layoutEdge(outlines, motif, opts, diag) {
  const o = { ...EDGE_DEFAULTS, ...opts };
  const size = Math.max(1e-6, (o.size / 100) * diag);
  const step = size * (1 + o.gap);
  const stamps = [];

  for (const { points, closed } of outlines) {
    if (points.length < 2) continue;
    const { L, at } = walker(points, closed);
    if (L < size * 0.5) continue;
    // Closed loops: round the count so copies meet evenly all the way around.
    const n = closed ? Math.max(1, Math.round(L / step)) : Math.max(1, Math.floor((L + size * o.gap) / step));
    const st = closed ? L / n : step;
    const start = closed ? st / 2 : (L - (n * step - size * o.gap)) / 2 + size / 2;
    // Outward = right of travel for counter-clockwise loops, left for clockwise ones.
    const ccw = closed && signedArea(points) > 0;

    for (let k = 0; k < n; k++) {
      const sc = start + k * st;
      let p1 = at(sc - size / 2), p2 = at(sc + size / 2);
      if (dist(p1, p2) < size * 0.05) continue;
      const t = norm(sub(p2, p1));
      const out = ccw || !closed ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
      const sign = o.side === 'in' ? -1 : o.side === 'alt' ? (k % 2 ? -1 : 1) : 1;
      const shift = mul(out, o.offset * size);
      p1 = add(p1, shift); p2 = add(p2, shift);
      const flip = o.rhythm === 'flip' && k % 2 === 1;

      if (o.orient === 'upright') {
        const c = add(lerp(p1, p2, 0.5), mul(out, sign * size * 0.5 * o.depth));
        stamps.push({ m: stampAt(motif, c, size, (o.rotate * Math.PI) / 180), tone: k % 2 });
        continue;
      }
      stamps.push({ m: mapOntoEdge(motif.frame, p1, p2, out, { flip, depth: o.depth * sign }).m, tone: flip ? 1 : 0 });
      if (o.rhythm === 'pairs') {
        stamps.push({ m: mapOntoEdge(motif.frame, p1, p2, out, { flip: !flip, depth: -o.depth * sign }).m, tone: 1 });
      }
    }
  }
  return stamps;
}

export function stampsMarkup(stamps, refId, color, altColor = color) {
  return stamps.map(({ m, tone }) => `<use href="#${refId}" transform="${fm(m)}"${tone && altColor !== color ? ` fill="${altColor}"` : ''}/>`).join('');
}

