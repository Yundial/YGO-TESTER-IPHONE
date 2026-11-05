// Comunicazione con il motore (worker) e lettura dello stato del duello.
import { DB, card, cardName, effectString, T } from './data.js';

let worker = null, seq = 0;
const pending = new Map();
let progressCb = null;

function call(type, args = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...args });
  });
}

export async function initEngine() {
  if (worker) return;
  worker = new Worker('worker.js');
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') { progressCb?.(m.done, m.total); return; }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Errore del motore'));
    pending.clear();
  };
  const v = DB.version || '';
  await call('init', { binUrl: 'data/cards.bin' + (v ? '?v=' + encodeURIComponent(v) : ''), v });
}

const BASE_SCRIPTS = ['constant.lua', 'utility.lua', 'archetype_setcode_constants.lua', 'card_counter_constants.lua',
  'cards_specific_functions.lua', 'chain.lua', 'debug_utility.lua', 'deprecated_functions.lua', 'proc_equip.lua',
  'proc_fusion.lua', 'proc_fusion_spell.lua', 'proc_gemini.lua', 'proc_link.lua', 'proc_maximum.lua', 'proc_normal.lua',
  'proc_pendulum.lua', 'proc_persistent.lua', 'proc_ritual.lua', 'proc_rush.lua', 'proc_skill.lua', 'proc_spirit.lua',
  'proc_synchro.lua', 'proc_union.lua', 'proc_workaround.lua', 'proc_xyz.lua'];

/** Scarica in anticipo gli effetti di tutte le carte dei due mazzi */
export async function prefetchScripts(codes, onProgress) {
  await initEngine();
  const names = new Set(BASE_SCRIPTS);
  for (const id of codes) {
    const c = card(id);
    if (c && c.isMonster && (c.type & T.NORMAL) && !(c.type & T.PENDULUM)) continue; // i Normali non hanno script
    const sid = c && c.alias && Math.abs(c.alias - c.id) < 10 ? c.alias : id;
    names.add(`c${sid}.lua`);
  }
  progressCb = onProgress;
  try { await call('prefetch', { names: [...names] }); } finally { progressCb = null; }
}

// ------------------------------------------------------------------ sessione di duello
function fcard(o) {
  if (!o) return null;
  return { code: o.c || 0, pos: o.p || 0, atk: o.a || 0, def: o.df || 0, level: o.lv || 0, type: o.t || 0, overlays: o.o || 0, baseAtk: o.ba || 0 };
}
const fcards = a => (a || []).map(x => x == null ? null : fcard(x));

export function pcards(p, key) {
  return (p[key] || []).map(o => ({ code: o.c || 0, pl: o.pl || 0, loc: o.l || 0, seq: o.s || 0, pos: o.pos || 0, desc: o.d || 0, param: o.x || 0 }));
}

export function response({ a = 0, b = 0, idx = null, places = null, mask = 0 } = {}) {
  const o = { a, b, mask };
  if (idx) o.idx = idx;
  if (places) o.places = places;
  return JSON.stringify(o);
}

export class DuelSession {
  constructor(handle) {
    this.h = handle;
    this.view = null;
    this.log = [];
    this.busy = false;
    this.closed = false;
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  async run(type, args = {}) {
    if (this.busy || this.closed) return;
    this.busy = true; this.emit();
    try {
      const json = await call(type, { h: this.h, ...args });
      if (!this.closed) this.apply(json);
    } catch (e) {
      this.view = { ...(this.view || {}), error: 'Errore del motore: ' + e.message };
    }
    this.busy = false;
    this.emit();
  }
  start() { return this.run('advance'); }
  respond(json) { return this.run('respond', { json }); }
  surrender() { return this.run('surrender'); }
  close() {
    if (this.closed) return;
    this.closed = true;
    call('destroy', { h: this.h }).catch(() => {});
  }

  apply(json) {
    let o;
    try { o = JSON.parse(json); } catch (_) { return; }
    const st = o.state; if (!st) return;
    const players = (st.p || []).map(p => ({ lp: p.lp, deck: p.deck, extraCount: p.xc, hand: fcards(p.hand), m: fcards(p.m), s: fcards(p.s), gy: fcards(p.gy), ban: fcards(p.ban), ex: fcards(p.ex) }));
    for (const e of o.log || []) { const t = formatLog(e); if (t) this.log.push(t); }
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
    this.view = {
      turn: st.turn, turnPlayer: st.tp, phase: st.phase,
      chain: (st.chain || []).map(c => [c.c, c.pl]),
      players, prompt: o.prompt || null,
      winner: o.end ? o.end.winner : null, winReason: o.end ? o.end.reason : 0,
      error: o.error || null,
    };
  }
}

const who = pl => pl === 0 ? 'Tu' : "L'avversario";
const n = code => code === 0 ? 'una carta coperta' : `«${cardName(code)}»`;

export function formatLog(e) {
  const pl = e.pl || 0, c = e.c || 0;
  switch (e.k) {
    case 'turn': return `── Turno ${e.n}: ${pl === 0 ? 'tocca a te' : "tocca all'avversario"} ──`;
    case 'draw':
      if (pl === 0 && e.c && e.c.length) return 'Peschi ' + e.c.map(n).join(', ');
      return `${who(pl)} pesca ${e.n} ${e.n === 1 ? 'carta' : 'carte'}`;
    case 'summon': return `${who(pl)} Evoca Normalmente ${n(c)}`;
    case 'spsummon': return `${who(pl)} Evoca Specialmente ${n(c)}`;
    case 'flip': return `${who(pl)} Evoca di Scoperta ${n(c)}`;
    case 'set': return c ? `${who(pl)} posizioni ${n(c)}` : `${who(pl)} posiziona una carta coperta`;
    case 'chain': {
      const d = e.d || 0;
      const eff = d >= 10000 ? effectString(Math.floor(d / 1048576), d % 1048576) : null;
      return `${who(pl)} attiva ${n(c)}` + (e.n > 1 ? ` (anello ${e.n})` : '') + (eff ? ` – ${eff}` : '');
    }
    case 'negated': return `L'anello ${e.n} della catena è stato negato`;
    case 'attack': return e.direct ? `${n(c)} attacca direttamente` : `${n(c)} attacca ${e.t ? n(e.t) : 'un mostro coperto'}`;
    case 'dmg': return `${who(pl)} ${pl === 0 ? 'subisci' : 'subisce'} ${e.v} danni`;
    case 'rec': return `${who(pl)} ${pl === 0 ? 'guadagni' : 'guadagna'} ${e.v} LP`;
    case 'cost': return `${who(pl)} ${pl === 0 ? 'paghi' : 'paga'} ${e.v} LP`;
    case 'move': {
      const to = e.to, from = e.from;
      if (to === 0x10) return `${n(c)} va al Cimitero` + (from === 0x01 ? ' dal Deck' : '');
      if (to === 0x20) return `${n(c)} viene bandita`;
      if (to === 0x02) return c === 0 ? `${who(pl)} aggiunge una carta alla mano` : `${n(c)} va in mano a ${pl === 0 ? 'te' : "l'avversario"}`;
      if (to === 0x01) return `${n(c)} torna nel Deck`;
      if (to === 0x40) return `${n(c)} torna nell'Extra Deck`;
      return null;
    }
    case 'reveal': return e.c && e.c.length ? 'Carte rivelate: ' + e.c.map(n).join(', ') : null;
    case 'coin': return 'Lancio della moneta: ' + (e.r || []).map(x => x === 1 ? 'testa' : 'croce').join(', ');
    case 'dice': return 'Lancio del dado: ' + (e.r || []).join(', ');
    default: return null;
  }
}

export async function createDuel({ hMain, hExtra, bMain, bExtra, difficulty, humanFirst, autoHuman = null }) {
  await initEngine();
  const h = await call('create', { hMain, hExtra, bMain, bExtra, difficulty, humanFirst, autoHuman });
  return new DuelSession(h);
}
