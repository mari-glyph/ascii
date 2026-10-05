// store.js
// Shared workshop state, a tiny event bus, session autosave, and the saved-shape library.
// Everything persists to localStorage; every read/write is guarded so the workshop still works
// in private windows or with storage blocked (it just won't remember).

import { tisaneShard, cloneShard, isShard } from './core/shard.js';
import { tisaneForm, cloneForm, isForm } from './core/compose.js';
import { shardMotif, formMotif } from './core/motif.js';

const SESSION_KEY = 'tisane-workshop:session:v1';
const LIBRARY_KEY = 'tisane-workshop:library:v1';
const MAX_ART_CHARS = 400_000; // don't autosave huge imported artwork

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const session = readJSON(SESSION_KEY) || {};

export const state = {
  room: session.room || 'pen',
  shard: isShard(session.shard) ? session.shard : tisaneShard(),
  form: isForm(session.form) ? session.form : tisaneForm(),
  edge: session.edge || {},
  fill: session.fill || {},
  ascii: session.ascii || {},
  library: (readJSON(LIBRARY_KEY) || []).filter((it) => it && it.id && it.kind && it.data),
};

// ── events ─────────────────────────────────────────────────────────────────
// Topics: room, shard, form, edge, fill, ascii, library. Forms are built from the shard, so
// rooms showing a form listen to both shard and form.

const bus = new EventTarget();
export function on(topic, fn) {
  bus.addEventListener(topic, (e) => fn(e.detail));
}
export function emit(topic, detail) {
  bus.dispatchEvent(new CustomEvent(topic, { detail }));
  if (topic === 'library') writeJSON(LIBRARY_KEY, state.library);
  else scheduleSave();
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const edge = { ...state.edge };
    if (edge.art && edge.art.markup.length > MAX_ART_CHARS) delete edge.art;
    writeJSON(SESSION_KEY, { room: state.room, shard: state.shard, form: state.form, edge, fill: state.fill, ascii: state.ascii });
  }, 250);
}

// ── library ────────────────────────────────────────────────────────────────
// Items: { id, kind: 'shard' | 'form' | 'fill', name, created, data }
//   shard → { shard }    form → { form, shard }    fill → { fill, motif: { d, frame }, clip?: { d } }

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function saveItem(kind, name, data) {
  const item = { id: uid(), kind, name: name || `${kind} ${state.library.filter((i) => i.kind === kind).length + 1}`, created: Date.now(), data };
  state.library.unshift(item);
  emit('library');
  return item;
}

export function removeItem(id) {
  state.library = state.library.filter((i) => i.id !== id);
  emit('library');
}

export function renameItem(id, name) {
  const it = state.library.find((i) => i.id === id);
  if (it && name) { it.name = name; emit('library'); }
}

export const snapshotShard = () => cloneShard(state.shard);
export const snapshotForm = () => ({ form: cloneForm(state.form), shard: cloneShard(state.shard) });

export function exportLibrary() {
  return JSON.stringify({ format: 'tisane-workshop-library', version: 1, items: state.library }, null, 2);
}

// Imported strings end up inside SVG markup, so only accept plain path data and hex colours.
const isPathData = (d) => typeof d === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/.test(d);
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);
const isFillParams = (f) => !!f && Array.isArray(f.stops) && f.stops.every((st) => isHex(st?.color) && Number.isFinite(st.at))
  && (f.background === null || f.background === undefined || isHex(f.background));

export function importLibrary(text) {
  const parsed = JSON.parse(text);
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items)) throw new Error('no items in that file');
  const valid = items.filter((it) => it && typeof it.name === 'string' && (
    (it.kind === 'shard' && isShard(it.data?.shard))
    || (it.kind === 'form' && isForm(it.data?.form) && isShard(it.data?.shard))
    || (it.kind === 'fill' && isFillParams(it.data?.fill) && isPathData(it.data?.motif?.d) && Array.isArray(it.data.motif.frame)
      && (!it.data.clip || isPathData(it.data.clip.d)))
  ));
  const known = new Set(state.library.map((i) => i.id));
  for (const it of valid) state.library.push({ ...it, id: known.has(it.id) ? uid() : it.id || uid() });
  emit('library');
  return valid.length;
}

// Rooms register a function returning their current output as standalone SVG text, so other
// rooms (ascii) can use it as a source: sources.shard(), sources.form(), sources.edge(), sources.fill().
export const sources = {};

// ── motifs ─────────────────────────────────────────────────────────────────
// A motif ref is 'live:shard', 'live:form', or a library id (shard or form item).

export function resolveMotif(ref) {
  if (ref === 'live:form') return formMotif(state.form, state.shard);
  const it = state.library.find((i) => i.id === ref);
  if (it?.kind === 'shard') return shardMotif(it.data.shard);
  if (it?.kind === 'form') return formMotif(it.data.form, it.data.shard);
  return shardMotif(state.shard);
}

export function motifOptions() {
  return [
    ['live:shard', 'current shard'],
    ['live:form', 'current form'],
    ...state.library.filter((i) => i.kind !== 'fill').map((i) => [i.id, `${i.kind} · ${i.name}`]),
  ];
}
