// motif.js
// A motif is anything that can be stamped: { d, frame: [A, B, C], box }.
// Shards use their own anchors as the frame. Any other shape uses its bounding box
// (base = bottom edge, apex = top centre), so every motif seats onto an edge the same way.

import { pt, copy, compose, translate, rotation, scaling } from './geometry.js';
import { shardD } from './shard.js';
import { buildForm } from './compose.js';
import { pathBBox } from './svg.js';

export function shardMotif(shard) {
  const d = shardD(shard);
  return { d, frame: shard.anchors.map(copy), box: pathBBox(d) };
}

export function pathMotif(d) {
  const box = pathBBox(d);
  const frame = [pt(box.x, box.y + box.h), pt(box.x + box.w, box.y + box.h), pt(box.x + box.w / 2, box.y)];
  return { d, frame, box };
}

export const formMotif = (form, shard) => pathMotif(buildForm(form, shard).d);

// Centre the motif at c, scale its longest side to `size`, rotate by `rad`.
export function stampAt(motif, c, size, rad = 0) {
  const { box } = motif;
  const k = size / Math.max(box.w, box.h, 1e-9);
  return compose(
    translate(c.x, c.y),
    compose(rotation(rad), compose(scaling(k), translate(-(box.x + box.w / 2), -(box.y + box.h / 2)))),
  );
}
