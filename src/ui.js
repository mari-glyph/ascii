// ui.js
// Small DOM builders for inspector controls, so each room declares its panel instead of
// hand-wiring markup + listeners.

export function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : String(kid));
  }
  return node;
}

export const section = (title, ...kids) => h('section', { class: 'sec' }, title ? h('h3', {}, title) : null, ...kids);
export const row = (...kids) => h('div', { class: 'row' }, ...kids);
export const note = (text) => h('p', { class: 'note' }, text);

export function button(text, onclick, { kind = '', title = null } = {}) {
  return h('button', { type: 'button', class: `btn ${kind}`.trim(), title, onclick }, text);
}

export function slider({ label, min, max, step = 1, value, format = (v) => v, onInput }) {
  const out = h('output', {});
  const input = h('input', { type: 'range', min, max, step });
  const paint = () => {
    out.textContent = format(parseFloat(input.value));
    input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
  };
  input.value = value;
  paint();
  input.addEventListener('input', () => { paint(); onInput(parseFloat(input.value)); });
  const el = h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, label), input, out);
  return { el, input, set(v) { input.value = v; paint(); } };
}

// options: [[value, text, title?]]
export function segmented({ label = null, options, value, onChange }) {
  const btns = options.map(([v, text, title]) => {
    const b = h('button', { type: 'button', class: 'seg-btn', title }, text);
    b.dataset.v = String(v);
    b.addEventListener('click', () => { set(v); onChange(v); });
    return b;
  });
  function set(v) { btns.forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); }
  set(value);
  const el = h('div', { class: label ? 'ctl' : 'ctl bare' }, label ? h('span', { class: 'ctl-label' }, label) : null, h('div', { class: 'seg' }, btns));
  return { el, set };
}

export function select({ label, options, value, onChange }) {
  const sel = h('select', {});
  const setOptions = (opts, v = sel.value) => {
    sel.replaceChildren(...opts.map(([ov, text]) => h('option', { value: ov }, text)));
    sel.value = opts.some(([ov]) => ov === v) ? v : (opts[0]?.[0] ?? '');
  };
  setOptions(options, value);
  sel.addEventListener('change', () => onChange(sel.value));
  const el = h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, label), sel);
  return { el, input: sel, set(v) { sel.value = v; }, setOptions };
}

export function toggle({ label, value, onChange }) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { class: 'ctl toggle' }, h('span', { class: 'ctl-label' }, label), input, h('span', { class: 'switch', 'aria-hidden': 'true' }));
  return { el, set(v) { input.checked = !!v; } };
}

export function colorInput({ label, value, onInput }) {
  const input = h('input', { type: 'color', value });
  input.addEventListener('input', () => onInput(input.value));
  const el = h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, label), input);
  return { el, input, set(v) { input.value = v; } };
}

export function numberPair({ label, x, y, onChange }) {
  const mk = (v) => h('input', { type: 'number', step: '1', value: Math.round(v) });
  const ix = mk(x), iy = mk(y);
  const fire = () => onChange(parseFloat(ix.value) || 0, parseFloat(iy.value) || 0);
  ix.addEventListener('change', fire);
  iy.addEventListener('change', fire);
  const el = h('div', { class: 'ctl pair' }, h('span', { class: 'ctl-label' }, label), ix, iy);
  return {
    el,
    set(nx, ny) {
      if (document.activeElement !== ix) ix.value = Math.round(nx);
      if (document.activeElement !== iy) iy.value = Math.round(ny);
    },
  };
}

// File picker that also accepts drops on `dropTarget`.
export function filePicker({ label, accept, onFile, dropTarget = null }) {
  const input = h('input', { type: 'file', accept, hidden: true });
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
  const btn = button(label, () => input.click());
  if (dropTarget) {
    dropTarget.addEventListener('dragover', (e) => { e.preventDefault(); dropTarget.classList.add('dragging'); });
    dropTarget.addEventListener('dragleave', () => dropTarget.classList.remove('dragging'));
    dropTarget.addEventListener('drop', (e) => {
      e.preventDefault();
      dropTarget.classList.remove('dragging');
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
  }
  return h('span', {}, btn, input);
}

let toastTimer = 0;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = msg;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

// Coalesce bursts of input into one render per frame.
export function frameThrottle(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}
