// compose.js
// A form is a parallelogram with shards seated on any of its four edges. Each shard's base
// endpoints are matched to the edge's vertices and its apex is placed off the edge; the curves
// follow by the affine map those three point pairs define. Replacing the curves with straight
// lines through the matched points gives the form's skeleton polygon (a hexagon when two
// opposite edges carry shards). With body off and shards on opposite edges, this is the mark.

import { add, sub, perp, norm, dot, centroid, copy, fp, apply, rotation, bboxOf, fitMatrix } from './geometry.js';
import { rawTisaneShard, mapOntoEdge, apexRun, shardD, sampleShard, mapShard, MARK_CENTER } from './shard.js';

export const EDGE_MODES = ['off', 'out', 'in'];
const POLY_NAMES = { 3: 'triangle', 4: 'parallelogram', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };

const edge = (mode = 'off') => ({ mode, flip: false, u: null, depth: 1 });

// The mark's parallelogram: the two shards' straight bases are opposite sides (A, B, A′, B′).
export function rawMarkParallelogram() {
  const [A, B] = rawTisaneShard().anchors;
  const twin = rotation(Math.PI, MARK_CENTER);
  return [A, B, apply(twin, A), apply(twin, B)];
}

// The mark, fitted to the 1000-unit stage: both shards seated on opposite edges, body off.
export function tisaneForm() {
  const raw = rawTisaneShard();
  const twin = mapShard(raw, rotation(Math.PI, MARK_CENTER));
  const m = fitMatrix(bboxOf([...sampleShard(raw), ...sampleShard(twin)]), 1000, 170);
  return makeForm(rawMarkParallelogram().map((p) => apply(m, p)));
}

export function makeForm(para, modes = ['out', 'off', 'out', 'off']) {
  return { para: para.map(copy), edges: modes.map(edge), body: false, view: 'curved' };
}

export function cloneForm(f) {
  return { ...f, para: f.para.map(copy), edges: f.edges.map((e) => ({ ...e })) };
}

export function isForm(f) {
  return !!f && Array.isArray(f.para) && f.para.length === 4 && Array.isArray(f.edges) && f.edges.length === 4;
}

// Keep the parallelogram rule (P0 + P2 = P1 + P3) by recomputing the vertex opposite the one moved.
export function moveVertex(form, i, p) {
  const P = form.para;
  P[i] = copy(p);
  P[(i + 2) % 4] = sub(add(P[(i + 1) % 4], P[(i + 3) % 4]), p);
}

export function outwardNormals(para) {
  const c = centroid(para);
  return para.map((p0, i) => {
    const p1 = para[(i + 1) % 4];
    let n = norm(perp(sub(p1, p0)));
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    if (dot(n, sub(mid, c)) < 0) n = { x: -n.x, y: -n.y };
    return n;
  });
}

export function buildForm(form, shard) {
  const P = form.para;
  const normals = outwardNormals(P);
  const tris = [];
  const polygon = [];
  let outlineD = `M${fp(P[0])}`;

  for (let i = 0; i < 4; i++) {
    const p0 = P[i], p1 = P[(i + 1) % 4], e = form.edges[i];
    polygon.push(p0);
    if (e.mode === 'off' || Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1e-6) {
      tris.push(null);
      outlineD += `L${fp(p1)}`;
      continue;
    }
    const depth = e.mode === 'in' ? -e.depth : e.depth;
    const { m, apex } = mapOntoEdge(shard.anchors, p0, p1, normals[i], { flip: e.flip, u: e.u, depth });
    tris.push({
      edge: i, m, apex,
      d: shardD(shard, m),                                  // the whole mapped shard, base included
      sd: `M${fp(p0)}L${fp(apex)}L${fp(p1)}Z`,              // its straight-line triangle
    });
    polygon.push(apex);
    outlineD += apexRun(shard, m, e.flip);
  }
  outlineD += 'Z';

  const skeletonD = `M${polygon.map(fp).join('L')}Z`;
  const paraD = `M${P.map(fp).join('L')}Z`;
  const live = tris.filter(Boolean);
  const apexes = live.map((t) => t.apex);
  const piecesD = live.map((t) => (form.view === 'straight' ? t.sd : t.d)).join('');

  // What the form "is" when used elsewhere: the full outline with body on, else the shards alone.
  let d;
  if (form.body) d = form.view === 'straight' ? skeletonD : outlineD;
  else d = live.length ? piecesD : paraD;

  return {
    para: P, normals, tris, polygon, apexes, paraD, outlineD, skeletonD, piecesD, d,
    name: POLY_NAMES[polygon.length] || `${polygon.length}-gon`,
  };
}

// Lines joining every pair of apexes: for two opposite shards, the axis through the form's centre.
export function apexLines(apexes) {
  const out = [];
  for (let i = 0; i < apexes.length; i++) for (let j = i + 1; j < apexes.length; j++) out.push([apexes[i], apexes[j]]);
  return out;
}

export const PRESETS = {
  'tisane hash': { modes: ['out', 'off', 'out', 'off'], body: false },
  hexagon: { modes: ['out', 'off', 'out', 'off'], body: true },
  pentagon: { modes: ['out', 'off', 'off', 'off'], body: true },
  octagon: { modes: ['out', 'out', 'out', 'out'], body: true },
  pinwheel: { modes: ['out', 'out', 'out', 'out'], body: false },
  notched: { modes: ['in', 'off', 'in', 'off'], body: true },
};
