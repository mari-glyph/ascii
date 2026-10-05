// pathdata.js
// Minimal SVG path parser, used to pull a three-anchor shape out of pasted/dropped SVG.
// Returns absolute subpaths: [{ start, segs: [{ curve, c1, c2, to }], closed }].
// Quadratics are raised to cubics; arcs are not supported (they're rare in mark artwork).

import { pt, lerp, dist, copy } from './geometry.js';
import { isShard } from './shard.js';

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const PARAMS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0, A: 7 };

function tokenize(d) {
  const out = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let m;
  while ((m = re.exec(d))) out.push({ cmd: m[1], nums: (m[2].match(NUM) || []).map(Number) });
  return out;
}

export function parsePath(d) {
  const subpaths = [];
  let cur = null, pos = pt(0, 0), lastCtrl = null, lastCmd = '';
  const line = (to) => { cur.segs.push({ curve: false, c1: lerp(pos, to, 1 / 3), c2: lerp(pos, to, 2 / 3), to }); };
  const cubic = (c1, c2, to) => { cur.segs.push({ curve: true, c1, c2, to }); };

  for (const { cmd, nums } of tokenize(d)) {
    const C = cmd.toUpperCase(), rel = cmd !== C, n = PARAMS[C];
    if (C === 'A') throw new Error('arcs aren’t supported — convert to curves first');
    if (C === 'Z') {
      if (cur) { cur.closed = true; pos = copy(cur.start); }
      lastCmd = 'Z';
      continue;
    }
    for (let i = 0; i + n <= nums.length; i += n) {
      const a = nums.slice(i, i + n);
      const P = (x, y) => (rel ? pt(pos.x + x, pos.y + y) : pt(x, y));
      let k = C;
      if (C === 'M' && i > 0) k = 'L'; // extra pairs after M are implicit linetos
      if (k === 'M') {
        pos = P(a[0], a[1]);
        cur = { start: copy(pos), segs: [], closed: false };
        subpaths.push(cur);
        lastCtrl = null;
      } else {
        if (!cur) { cur = { start: copy(pos), segs: [], closed: false }; subpaths.push(cur); }
        if (k === 'L') { const to = P(a[0], a[1]); line(to); pos = to; lastCtrl = null; }
        else if (k === 'H') { const to = pt(rel ? pos.x + a[0] : a[0], pos.y); line(to); pos = to; lastCtrl = null; }
        else if (k === 'V') { const to = pt(pos.x, rel ? pos.y + a[0] : a[0]); line(to); pos = to; lastCtrl = null; }
        else if (k === 'C') {
          const c1 = P(a[0], a[1]), c2 = P(a[2], a[3]), to = P(a[4], a[5]);
          cubic(c1, c2, to); pos = to; lastCtrl = { c: c2, q: false };
        } else if (k === 'S') {
          const c1 = lastCtrl && !lastCtrl.q && /[CS]/i.test(lastCmd) ? pt(2 * pos.x - lastCtrl.c.x, 2 * pos.y - lastCtrl.c.y) : copy(pos);
          const c2 = P(a[0], a[1]), to = P(a[2], a[3]);
          cubic(c1, c2, to); pos = to; lastCtrl = { c: c2, q: false };
        } else if (k === 'Q' || k === 'T') {
          const q = k === 'Q' ? P(a[0], a[1])
            : (lastCtrl && lastCtrl.q && /[QT]/i.test(lastCmd) ? pt(2 * pos.x - lastCtrl.c.x, 2 * pos.y - lastCtrl.c.y) : copy(pos));
          const to = k === 'Q' ? P(a[2], a[3]) : P(a[0], a[1]);
          cubic(lerp(pos, q, 2 / 3), lerp(to, q, 2 / 3), to); pos = to; lastCtrl = { c: q, q: true };
        }
      }
      lastCmd = cmd;
    }
  }
  return subpaths;
}

// Turn the first subpath with exactly three anchors into a shard (closing line included).
export function shardFromPath(d) {
  const subs = parsePath(d);
  if (!subs.length) throw new Error('no path data found');
  const counts = [];
  for (const sp of subs) {
    const segs = sp.segs.slice();
    const end = segs.length ? segs[segs.length - 1].to : sp.start;
    if (dist(end, sp.start) > 1e-6) segs.push({ curve: false, c1: lerp(end, sp.start, 1 / 3), c2: lerp(end, sp.start, 2 / 3), to: copy(sp.start) });
    counts.push(segs.length);
    if (segs.length !== 3) continue;
    const anchors = [sp.start, segs[0].to, segs[1].to].map(copy);
    const shard = { anchors, edges: segs.map((s) => ({ curve: s.curve, c1: copy(s.c1), c2: copy(s.c2) })) };
    if (isShard(shard)) return shard;
  }
  throw new Error(`a shard needs exactly 3 anchors (found ${counts.join(', ')})`);
}
