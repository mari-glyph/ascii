// main.js
// Boots the workshop: tabs, the library rail, and the five rooms.
//   01 pen   – edit one three-point shard
//   02 form  – seat shards on a parallelogram's edges (hexagon, the hash, …)
//   03 edge  – trace any SVG's outline with shrunken shards
//   04 fill  – gradient fills made of shards
//   05 ascii – render any of the above (or an image) as animated ASCII

import { state, emit, on, sources, removeItem, renameItem, exportLibrary, importLibrary } from './store.js';
import { shardD } from './core/shard.js';
import { buildForm } from './core/compose.js';
import { fillMarkup } from './core/fill.js';
import { pathBBox, padBox, svgDocument, download, readFileText } from './core/svg.js';
import { h, button, toast } from './ui.js';
import * as pen from './rooms/pen.js';
import * as form from './rooms/form.js';
import * as edge from './rooms/edge.js';
import * as fill from './rooms/fill.js';
import * as ascii from './rooms/ascii.js';

const INK = '#2a2a2a';
const ROOMS = [
  { id: 'pen', label: 'pen', mod: pen },
  { id: 'form', label: 'form', mod: form },
  { id: 'edge', label: 'edge', mod: edge },
  { id: 'fill', label: 'fill', mod: fill },
  { id: 'ascii', label: 'ascii', mod: ascii },
];

const pathDoc = (d) => svgDocument(padBox(pathBBox(d), 40), `<path d="${d}" fill="${INK}"/>`);
sources.shard = () => pathDoc(shardD(state.shard));
sources.form = () => pathDoc(buildForm(state.form, state.shard).d);

// ── rooms + tabs ─────────────────────────────────────────────────────────
const tabs = document.querySelector('.tabs');
const roomsEl = document.querySelector('.rooms');
const mounted = {};

for (const [i, r] of ROOMS.entries()) {
  const el = h('section', { class: 'room', id: `room-${r.id}`, role: 'tabpanel', 'aria-label': r.label });
  roomsEl.append(el);
  r.el = el;
  r.tab = h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => { state.room = r.id; emit('room'); } },
    h('span', { class: 'tab-n' }, String(i + 1).padStart(2, '0')), r.label);
  tabs.append(r.tab);
}
for (const r of ROOMS) mounted[r.id] = r.mod.mount(r.el);

function showRoom() {
  if (!mounted[state.room]) state.room = 'pen';
  for (const r of ROOMS) {
    const on = r.id === state.room;
    r.el.hidden = !on;
    r.tab.setAttribute('aria-selected', on);
    r.tab.classList.toggle('on', on);
  }
  // Rooms measure their stage on show, so wait for layout.
  requestAnimationFrame(() => mounted[state.room].show());
}
on('room', showRoom);

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= ROOMS.length) { state.room = ROOMS[n - 1].id; emit('room'); }
});

// ── library rail ─────────────────────────────────────────────────────────
const libBody = document.querySelector('.lib-body');
const thumbs = new Map(); // id → data URL (fills are expensive to draw)

function thumbFor(item) {
  if (thumbs.has(item.id)) return thumbs.get(item.id);
  let svg;
  if (item.kind === 'shard') svg = pathDoc(shardD(item.data.shard));
  else if (item.kind === 'form') svg = pathDoc(buildForm(item.data.form, item.data.shard).d);
  else {
    const motif = { ...item.data.motif, box: pathBBox(item.data.motif.d) };
    const clip = item.data.clip ? { d: item.data.clip.d, box: pathBBox(item.data.clip.d) } : null;
    const { box, markup } = fillMarkup(item.data.fill, motif, { idPrefix: `t${item.id}`, clip });
    svg = svgDocument(box, markup);
  }
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  thumbs.set(item.id, url);
  return url;
}

function openItem(item) {
  if (item.kind === 'shard') {
    state.shard = JSON.parse(JSON.stringify(item.data.shard));
    emit('shard');
    state.room = 'pen';
  } else if (item.kind === 'form') {
    state.shard = JSON.parse(JSON.stringify(item.data.shard));
    state.form = JSON.parse(JSON.stringify(item.data.form));
    emit('shard');
    emit('form');
    state.room = 'form';
  } else {
    state.room = 'fill';
    mounted.fill.load(item);
  }
  emit('room');
  toast(`opened ${item.name}`);
}

function renderLibrary() {
  const groups = [['shard', 'shards'], ['form', 'forms'], ['fill', 'fills']];
  libBody.replaceChildren(...groups.map(([kind, title]) => {
    const items = state.library.filter((i) => i.kind === kind);
    return h('div', { class: 'lib-group' },
      h('h3', {}, title, h('span', { class: 'count' }, items.length)),
      items.length
        ? h('ul', {}, items.map((it) => h('li', { class: 'lib-item' },
          h('button', { type: 'button', class: 'lib-open', title: `open ${it.name}`, onclick: () => openItem(it) },
            h('img', { src: thumbFor(it), alt: '' }),
            h('span', { class: 'lib-name' }, it.name)),
          h('div', { class: 'lib-tools' },
            button('rename', () => { const n = prompt('rename', it.name); if (n) { renameItem(it.id, n.trim()); } }, { kind: 'ghost tiny' }),
            button('delete', () => { if (confirm(`delete “${it.name}” from the library?`)) { thumbs.delete(it.id); removeItem(it.id); } }, { kind: 'ghost tiny' })),
        )))
        : h('p', { class: 'note' }, kind === 'fill' ? 'save a fill from room 04' : `save a ${kind} from room ${kind === 'shard' ? '01' : '02'}`),
    );
  }));
}
on('library', renderLibrary);

const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  try { toast(`imported ${importLibrary(await readFileText(file))} items`); } catch (err) { toast(`import failed: ${err.message}`, 'error'); }
});
document.querySelector('.lib-actions').append(
  button('export', () => download('tisane-library.json', exportLibrary(), 'application/json'), { kind: 'ghost tiny', title: 'download the library as JSON' }),
  button('import', () => importInput.click(), { kind: 'ghost tiny', title: 'merge a library JSON file' }),
  importInput,
);

renderLibrary();
showRoom();
