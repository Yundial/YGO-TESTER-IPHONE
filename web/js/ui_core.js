// Strumenti comuni dell'interfaccia: costruzione DOM, finestre, navigazione, immagini carte.
import { card, cardName, imageUrl, typeLine, statLine } from './data.js';

/** h('div.classe', {attributi/eventi}, ...figli) */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ------------------------------------------------------------------ navigazione (con il tasto indietro di sistema)
const stack = [];
let root = null;
export function setRoot(el) { root = el; }
export function current() { return stack[stack.length - 1]; }

function render() {
  const s = current();
  if (!s) return;
  closeAllModals();
  s.cleanup?.();
  clear(root);
  const out = s.render(s);
  s.cleanup = out?.cleanup;
  if (out?.el) root.appendChild(out.el);
  window.scrollTo(0, 0);
}
/** Sostituisce la schermata corrente (o la prima) */
export function replace(screen) { stack.pop()?.cleanup?.(); stack.push(screen); render(); }
export function go(screen) {
  stack.push(screen);
  history.pushState({ depth: stack.length }, '');
  render();
}
export function back() { if (stack.length > 1) history.back(); }
export function home(screen) {
  while (stack.length) stack.pop().cleanup?.();
  stack.push(screen);
  history.pushState({ depth: 1 }, '');
  render();
}
window.addEventListener('popstate', () => {
  if (modals.length) { closeTopModal(); history.pushState({ depth: stack.length }, ''); return; }
  const s = current();
  if (s?.onBack && s.onBack() === false) { history.pushState({ depth: stack.length }, ''); return; }
  if (stack.length > 1) { stack.pop().cleanup?.(); render(); }
  else history.pushState({ depth: 1 }, '');
});
export function rerender() { render(); }

// ------------------------------------------------------------------ finestre
const modals = [];
export function modal({ title, body, buttons = [], dismissable = true, wide = false, onClose }) {
  const box = h('div.modal' + (wide ? '.wide' : ''),
    title ? h('h2', title) : null,
    h('div.modal-body', body),
    buttons.length ? h('div.modal-buttons', buttons.map(b => b && h('button.' + (b.kind || 'text'), { onclick: () => b.onclick(close) }, b.label))) : null);
  const ov = h('div.overlay', { onclick: e => { if (e.target === ov && dismissable) close(); } }, box);
  document.body.appendChild(ov);
  const entry = { ov, onClose };
  modals.push(entry);
  function close() {
    const i = modals.indexOf(entry);
    if (i < 0) return;
    modals.splice(i, 1);
    ov.remove();
    onClose?.();
  }
  return close;
}
export function closeTopModal() { const m = modals[modals.length - 1]; if (m) { modals.pop(); m.ov.remove(); m.onClose?.(); } }
export function closeAllModals() { while (modals.length) { const m = modals.pop(); m.ov.remove(); } }
export function toast(text) {
  const t = h('div.toast', text);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
export function confirmBox(title, text, okLabel, onOk, danger = true) {
  modal({ title, body: h('p', text), buttons: [
    { label: 'Annulla', onclick: c => c() },
    { label: okLabel, kind: danger ? 'text.danger' : 'text', onclick: c => { c(); onOk(); } },
  ] });
}

// ------------------------------------------------------------------ carte
export function cardImg(code, { big = false, cls = '' } = {}) {
  if (!code) return h('div.card-back' + (cls ? '.' + cls : ''));
  const wrap = h('div.card-img' + (cls ? '.' + cls : ''));
  // senza immagine (offline o carta nuovissima) si vede un riquadro col nome
  wrap.appendChild(nameTile(code));
  const img = document.createElement('img');
  img.alt = ''; img.draggable = false; img.loading = 'lazy';
  img.onload = () => wrap.classList.add('loaded');
  img.onerror = () => img.remove();
  img.src = imageUrl(code, big);
  wrap.appendChild(img);
  return wrap;
}
function nameTile(code) {
  const c = card(code);
  const kind = !c ? '' : c.isSpell ? 'spell' : c.isTrap ? 'trap' : c.isExtra ? 'extra' : 'monster';
  return h('div.name-tile.' + (kind || 'unknown'), cardName(code));
}

/** Pressione prolungata (dettagli della carta) */
export function onLongPress(el, fn) {
  let t = null, fired = false;
  const start = () => { fired = false; t = setTimeout(() => { fired = true; fn(); }, 480); };
  const cancel = () => clearTimeout(t);
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel); el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('mousedown', start); el.addEventListener('mouseup', cancel); el.addEventListener('mouseleave', cancel);
  el.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); if (!fired) fn(); fired = true; });
  el.addEventListener('click', e => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
}

export function cardDetail(code, extraButtons = []) {
  const c = card(code);
  const body = h('div.detail',
    h('div.detail-img', cardImg(code, { big: true })),
    c ? [
      c.name !== c.nameEn ? h('div.muted', c.nameEn) : null,
      h('div.gold.small', typeLine(c)),
      statLine(c) ? h('div.small', statLine(c)) : null,
      h('p.desc', c.desc),
      h('div.muted.tiny', `ID ${c.id}`),
    ] : h('p', 'Carta non presente nel database.'));
  return modal({ title: c ? c.name : 'Carta', body, wide: true,
    buttons: [...extraButtons, { label: 'Chiudi', onclick: cl => cl() }] });
}

export function topBar(title, onBack, ...actions) {
  return h('header.topbar',
    onBack ? h('button.icon', { onclick: onBack, 'aria-label': 'Indietro' }, '‹') : h('span.spacer'),
    h('h1', title),
    h('div.actions', actions));
}

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const file = typeof File === 'function' ? new File([blob], filename, { type: mime }) : null;
  // su iPhone il foglio di condivisione permette di salvarlo in File, iCloud, ecc.
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: filename }).catch(() => {});
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
