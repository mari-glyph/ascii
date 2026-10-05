// shard.js
// The shard is tisane's primitive: exactly three anchors A, B, C joined by three edges.
// edges[i] runs anchors[i] → anchors[(i + 1) % 3], so edge 0 is the base A→B, edge 1 is B→C,
// edge 2 is C→A. Every edge keeps its cubic controls (c1 near its start, c2 near its end) even
// while straight, so toggling line ↔ curve never loses a shape.

import {
  pt, add, sub, mul, lerp, dist, perp, norm, dot, copy, apply, bezier, bboxOf, centroid,
  affineFrom3, toEdgeFrame, fromEdgeFrame, fitMatrix, fp,
} from './geometry.js';

// The left shard of the tisane mark, verbatim from packages/ui/src/TisaneMark.tsx.
// Its twin is the same shard rotated 180° about MARK_CENTER.
const RAW = {
  anchors: [pt(3529.67, 5097.59), pt(4703.53, 716.67), pt(3849.17, 1100.29)],
  edges: [
    { curve: false },
    { curve: true, c1: pt(3275.54, 5545.1), c2: pt(-950.543, 4041.06) },
    { curve: true, c1: pt(-2070.32, 3920.98), c2: pt(3065.99, 6828.07) },
  ],
};
export const MARK_CENTER = pt(3790.515, 4529.79);
export const ANCHOR_NAMES = ['A', 'B', 'C'];
export const EDGE_NAMES = ['AB', 'BC', 'CA'];

export function cloneShard(s) {
  return {
    anchors: s.anchors.map(copy),
    edges: s.edges.map((e) => ({ curve: !!e.curve, c1: copy(e.c1), c2: copy(e.c2) })),
  };
}

// Fill in thirds for any straight edge that has no stored controls yet.
function withControls(s) {
  const out = { anchors: s.anchors.map(copy), edges: [] };
  for (let i = 0; i < 3; i++) {
    const p0 = s.anchors[i], p1 = s.anchors[(i + 1) % 3], e = s.edges[i] || {};
    out.edges.push({
      curve: !!e.curve,
      c1: e.c1 ? copy(e.c1) : lerp(p0, p1, 1 / 3),
      c2: e.c2 ? copy(e.c2) : lerp(p0, p1, 2 / 3),
    });
  }
  return out;
}

export function rawTisaneShard() {
  return withControls(RAW);
}

// The tisane shard centred on the 1000-unit pen stage by its outline (its handles reach further;
// the stage widens its view to keep them grabbable).
export function tisaneShard() {
  const raw = rawTisaneShard();
  return mapShard(raw, fitMatrix(bboxOf(sampleShard(raw, 64)), 1000, 200));
}

export function isShard(s) {
  const okPt = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  return !!s && Array.isArray(s.anchors) && s.anchors.length === 3 && s.anchors.every(okPt)
    && Array.isArray(s.edges) && s.edges.length === 3 && s.edges.every((e) => e && okPt(e.c1) && okPt(e.c2));
}

export function segments(s) {
  return s.edges.map((e, i) => ({
    p0: s.anchors[i], p1: s.anchors[(i + 1) % 3], c1: e.c1, c2: e.c2, curve: e.curve,
  }));
}

// Path command that draws a segment from wherever the pen is to its far end.
export function segCmd(seg, m = null, reverse = false) {
  const T = (p) => (m ? apply(m, p) : p);
  const to = reverse ? seg.p0 : seg.p1;
  if (!seg.curve) return `L${fp(T(to))}`;
  const [c1, c2] = reverse ? [seg.c2, seg.c1] : [seg.c1, seg.c2];
  return `C${fp(T(c1))} ${fp(T(c2))} ${fp(T(to))}`;
}

export function shardD(s, m = null) {
  const T = (p) => (m ? apply(m, p) : p);
  return `M${fp(T(s.anchors[0]))}` + segments(s).map((seg) => segCmd(seg, m)).join('') + 'Z';
}

export function mapShard(s, m) {
  return {
    anchors: s.anchors.map((p) => apply(m, p)),
    edges: s.edges.map((e) => ({ curve: e.curve, c1: apply(m, e.c1), c2: apply(m, e.c2) })),
  };
}

// Points along the drawn outline (for bounds and hit tests).
export function sampleShard(s, n = 24) {
  const out = [];
  for (const seg of segments(s)) {
    if (!seg.curve) { out.push(seg.p0); continue; }
    for (let k = 0; k < n; k++) out.push(bezier(seg.p0, seg.c1, seg.c2, seg.p1, k / n));
  }
  return out;
}

// Everything a user can grab: anchors plus the controls of curved edges.
export function handlePoints(s) {
  const pts = s.anchors.slice();
  s.edges.forEach((e) => { if (e.curve) pts.push(e.c1, e.c2); });
  return pts;
}

export const shardBBox = (s) => bboxOf(sampleShard(s));

// Straight → curve: seed the controls at thirds, bowed away from the shard's middle so the
// change is visible and the new handles are easy to grab.
export function setCurve(s, i, curve) {
  const e = s.edges[i];
  if (curve && !e.curve) {
    const p0 = s.anchors[i], p1 = s.anchors[(i + 1) % 3];
    const mid = lerp(p0, p1, 0.5);
    let n = norm(perp(sub(p1, p0)));
    if (dot(n, sub(mid, centroid(s.anchors))) < 0) n = mul(n, -1);
    const bow = mul(n, dist(p0, p1) * 0.12);
    e.c1 = add(lerp(p0, p1, 1 / 3), bow);
    e.c2 = add(lerp(p0, p1, 2 / 3), bow);
  }
  e.curve = curve;
}

// Where C sits relative to the base A→B: u along the base, |v| the height (both in base lengths).
export function apexFrame(s) {
  const { u, v } = toEdgeFrame(s.anchors[2], s.anchors[0], s.anchors[1]);
  return { u, h: Math.abs(v) || 0.0001 };
}

// Map a three-point frame (A, B, C) onto the segment p0→p1, apex on the side of `normal`.
//   flip  – mirror along the segment (A lands on p1 instead of p0)
//   u     – explicit apex position along the segment (null = keep the frame's own proportion)
//   depth – multiplies the apex height; negative pushes the apex to the other side
// Returns the affine matrix and the apex point. Curves follow because affine maps are exact on béziers.
export function mapOntoEdge(frame, p0, p1, normal, { flip = false, u = null, depth = 1 } = {}) {
  const [A, B, C] = frame;
  const own = toEdgeFrame(C, A, B);
  const h = Math.abs(own.v) || 0.0001;
  const uu = u ?? (flip ? 1 - own.u : own.u);
  // fromEdgeFrame measures v along perp(p1 − p0); convert so positive depth means "toward normal".
  const side = dot(perp(sub(p1, p0)), normal) >= 0 ? 1 : -1;
  const apex = fromEdgeFrame(uu, h * depth * side, p0, p1);
  const m = affineFrom3([A, B, C], flip ? [p1, p0, apex] : [p0, p1, apex]);
  return { m, apex };
}

// Path from p0 to p1 that walks the shard's two non-base edges (as mapped by mapOntoEdge).
export function apexRun(s, m, flip) {
  const segs = segments(s);
  // not flipped: A→p0, B→p1 so p0→apex→p1 is A→C→B (edges 2 and 1 reversed)
  // flipped:     B→p0, A→p1 so p0→apex→p1 is B→C→A (edges 1 and 2 forward)
  return flip
    ? segCmd(segs[1], m) + segCmd(segs[2], m)
    : segCmd(segs[2], m, true) + segCmd(segs[1], m, true);
}
