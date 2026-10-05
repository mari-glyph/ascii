// geometry.js
// Points are plain { x, y }. Affine matrices use SVG's matrix(a b c d e f) order:
//   x' = a·x + c·y + e
//   y' = b·x + d·y + f

export const pt = (x, y) => ({ x, y });
export const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
export const mul = (p, k) => ({ x: p.x * k, y: p.y * k });
export const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
export const dot = (p, q) => p.x * q.x + p.y * q.y;
export const cross = (p, q) => p.x * q.y - p.y * q.x;
export const len = (p) => Math.hypot(p.x, p.y);
export const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
export const perp = (p) => ({ x: -p.y, y: p.x });
export const norm = (p) => { const l = len(p) || 1; return { x: p.x / l, y: p.y / l }; };
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const copy = (p) => ({ x: p.x, y: p.y });

export const IDENTITY = [1, 0, 0, 1, 0, 0];

export function apply(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

// compose(m1, m2) applies m2 first, then m1.
export function compose(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return IDENTITY.slice();
  return [
    m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export const translate = (tx, ty) => [1, 0, 0, 1, tx, ty];
export const scaling = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];

export function rotation(rad, about = { x: 0, y: 0 }) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return compose(translate(about.x, about.y), compose([c, s, -s, c, 0, 0], translate(-about.x, -about.y)));
}

export function scaleAbout(sx, sy, about) {
  return compose(translate(about.x, about.y), compose(scaling(sx, sy), translate(-about.x, -about.y)));
}

// The unique affine map sending src[i] → dst[i] for three non-collinear points.
// This is how a shard's curves follow its anchors onto any triangle.
export function affineFrom3(src, dst) {
  const s1 = sub(src[1], src[0]), s2 = sub(src[2], src[0]);
  const d1 = sub(dst[1], dst[0]), d2 = sub(dst[2], dst[0]);
  const det = cross(s1, s2);
  if (Math.abs(det) < 1e-9) return similarityFrom2(src[0], src[1], dst[0], dst[1]);
  const a = (d1.x * s2.y - d2.x * s1.y) / det;
  const c = (d2.x * s1.x - d1.x * s2.x) / det;
  const b = (d1.y * s2.y - d2.y * s1.y) / det;
  const d = (d2.y * s1.x - d1.y * s2.x) / det;
  return [a, b, c, d, dst[0].x - (a * src[0].x + c * src[0].y), dst[0].y - (b * src[0].x + d * src[0].y)];
}

// Rotation + uniform scale + translation sending p0 → q0 and p1 → q1.
export function similarityFrom2(p0, p1, q0, q1) {
  const s = sub(p1, p0), d = sub(q1, q0);
  const ss = dot(s, s) || 1;
  const a = dot(s, d) / ss;   // k·cosθ
  const b = cross(s, d) / ss; // k·sinθ
  return [a, b, -b, a, q0.x - (a * p0.x - b * p0.y), q0.y - (b * p0.x + a * p0.y)];
}

// Express p in the frame of segment p0→p1: u along it, v along its left normal, both in units of |p1 − p0|.
export function toEdgeFrame(p, p0, p1) {
  const e = sub(p1, p0), r = sub(p, p0), ee = dot(e, e) || 1;
  return { u: dot(r, e) / ee, v: cross(e, r) / ee };
}

export function fromEdgeFrame(u, v, p0, p1) {
  const e = sub(p1, p0);
  return add(p0, add(mul(e, u), mul(perp(e), v)));
}

// Cubic bézier point.
export function bezier(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

export function bboxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Uniform scale + translate that centres a box inside a size×size square with `pad` on every side.
export function fitMatrix(box, size = 1000, pad = 100) {
  const k = (size - 2 * pad) / Math.max(box.w, box.h, 1e-9);
  return [k, 0, 0, k, size / 2 - k * (box.x + box.w / 2), size / 2 - k * (box.y + box.h / 2)];
}

// Shoelace signed area. Positive = counter-clockwise in the raw coordinate frame,
// where the left normal perp(tangent) points inward.
export function signedArea(points) {
  let a = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const centroid = (points) => mul(points.reduce(add, { x: 0, y: 0 }), 1 / (points.length || 1));

// Short number formatting for path data.
export const f = (n) => (Math.round(n * 100) / 100).toString();
export const fp = (p) => `${f(p.x)} ${f(p.y)}`;
export const fm = (m) => `matrix(${m.map((n) => Math.round(n * 10000) / 10000).join(' ')})`;

// Mulberry32: tiny seeded PRNG so jittered layouts are stable between renders.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
