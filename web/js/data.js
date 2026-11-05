// Database delle carte, ricerca e testi in italiano.
export const T = {
  MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80,
  SPIRIT: 0x200, UNION: 0x400, GEMINI: 0x800, TUNER: 0x1000, SYNCHRO: 0x2000, TOKEN: 0x4000,
  QUICKPLAY: 0x10000, CONTINUOUS: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, COUNTER: 0x100000,
  FLIP: 0x200000, TOON: 0x400000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000,
};
T.EXTRA = T.FUSION | T.SYNCHRO | T.XYZ | T.LINK;
export const LOC = { DECK: 0x01, HAND: 0x02, MZONE: 0x04, SZONE: 0x08, GRAVE: 0x10, REMOVED: 0x20, EXTRA: 0x40, OVERLAY: 0x80 };
export const POS = { FU_ATK: 0x1, FD_ATK: 0x2, FU_DEF: 0x4, FD_DEF: 0x8 };
export const faceUp = p => (p & 0x5) !== 0;
export const isDefense = p => (p & 0xc) !== 0;

// i campi "race" superano i 32 bit solo in teoria: in pratica stanno in un Number
const has = (v, bit) => Math.floor(v / bit) % 2 === 1;

export class Card {
  constructor(r) {
    [this.id, this.alias, this.type, this.atk, this.def, this.levelRaw, this.race, this.attribute, this.name] = r;
    this.nameEn = r[9] || r[8];
    this.desc = r[10] || '';
    this.strs = r[11] || null;
    this.norm = normalize(this.name);
    this.normEn = normalize(this.nameEn);
  }
  get isMonster() { return (this.type & T.MONSTER) !== 0; }
  get isSpell() { return (this.type & T.SPELL) !== 0; }
  get isTrap() { return (this.type & T.TRAP) !== 0; }
  get isExtra() { return this.isMonster && (this.type & T.EXTRA) !== 0; }
  get isLink() { return (this.type & T.LINK) !== 0; }
  get isToken() { return (this.type & T.TOKEN) !== 0; }
  get level() { return this.levelRaw & 0xff; }
  get linkRating() { return this.isLink ? this.def : 0; }
  /** Le illustrazioni alternative contano come la stessa carta per il limite di 3 copie */
  get baseId() { return this.alias && Math.abs(this.alias - this.id) < 20 ? this.alias : this.id; }
  get imageId() { return this.baseId; }
}

export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export const DB = {
  cards: new Map(),
  list: [],
  sets: {},
  strings: {},
  bots: [],
  newer: new Map(),   // id -> versione aggiornata (errata) da usare in partita
  ready: false,
};

async function fetchJson(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  if (!onBytes || !res.body) return res.json();
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length; onBytes(got);
  }
  const buf = new Uint8Array(got); let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return JSON.parse(new TextDecoder().decode(buf));
}

export async function loadData(onProgress) {
  let v = '';
  try { v = (await (await fetch('data/version.json', { cache: 'no-store' })).json()).v || ''; } catch (_) {}
  const q = v ? `?v=${encodeURIComponent(v)}` : '';
  onProgress?.('Carico le carte…', 0.05);
  const cards = await fetchJson('data/cards.json' + q, n => onProgress?.('Carico le carte…', Math.min(0.85, 0.05 + n / 7e6)));
  onProgress?.('Preparo la ricerca…', 0.88);
  DB.cards.clear(); DB.list = [];
  for (const r of cards.cards) { const c = new Card(r); DB.cards.set(c.id, c); DB.list.push(c); }
  for (const c of DB.list) {
    if (c.alias && c.id > c.alias && c.id < c.alias + 10) {
      const cur = DB.newer.get(c.alias);
      if (!cur || c.id > cur) DB.newer.set(c.alias, c.id);
    }
  }
  const [sets, strings, bots] = await Promise.all([
    fetchJson('data/sets.json' + q).catch(() => ({})),
    fetchJson('data/strings.json' + q).catch(() => ({})),
    fetchJson('data/bot_decks.json' + q).catch(() => []),
  ]);
  DB.sets = sets; DB.strings = strings; DB.bots = bots; DB.version = v;
  DB.ready = true;
  onProgress?.('Fatto', 1);
}

export const card = id => DB.cards.get(id) || null;
export const cardName = id => id === 0 ? 'carta coperta' : (card(id)?.name || `#${id}`);
export const playableCode = id => DB.newer.get(id) || id;
export const imageUrl = (id, big) => {
  const c = card(id); const iid = c ? c.imageId : id;
  return `https://images.ygoprodeck.com/images/${big ? 'cards' : 'cards_small'}/${iid}.jpg`;
};

export function effectString(code, idx) {
  const c = card(code);
  if (!c || !c.strs) return null;
  return c.strs[idx] || null;
}

// ------------------------------------------------------------------ ricerca
function finish(list, limit) {
  const out = []; const seen = new Set();
  for (const c of list) {
    if (c.isToken || seen.has(c.nameEn)) continue;
    seen.add(c.nameEn); out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function search(query, limit = 80) {
  const q = query.trim();
  if (!q) return [];
  const digits = q.replace(/\s/g, '');
  if (/^\d{4,}$/.test(digits)) {
    const n = Number(digits);
    const exact = DB.list.filter(c => c.id === n || c.alias === n);
    const pre = DB.list.filter(c => String(c.id).startsWith(digits) && !exact.includes(c));
    return finish([...exact, ...pre], limit);
  }
  const nq = normalize(q);
  const starts = [], contains = [];
  for (const c of DB.list) {
    if (c.norm.startsWith(nq) || c.normEn.startsWith(nq)) starts.push(c);
    else if (c.norm.includes(nq) || c.normEn.includes(nq)) contains.push(c);
  }
  const byLen = (a, b) => a.name.length - b.name.length;
  starts.sort(byLen); contains.sort(byLen);
  return finish([...starts, ...contains], limit);
}

export const emptyFilter = () => ({ kind: 0, frames: [], attributes: 0, races: 0, levels: [], spellKinds: [], trapKinds: [], atkMin: null, atkMax: null, defMin: null, defMax: null });
export const filterCount = f => (f.kind ? 1 : 0) + f.frames.length + popcount(f.attributes) + popcount(f.races) + f.levels.length + f.spellKinds.length + f.trapKinds.length + [f.atkMin, f.atkMax, f.defMin, f.defMax].filter(x => x != null).length;
export const filterActive = f => filterCount(f) > 0;
function popcount(v) { let n = 0; while (v > 0) { if (v % 2) n++; v = Math.floor(v / 2); } return n; }

/** Filtri incrociati: in Tipo/Abilità devono valere tutte le scelte, negli altri gruppi basta una */
export function searchFiltered(f, name, limit = 300) {
  const byName = name.trim() ? search(name, 5000) : null;
  const pool = byName || DB.list.filter(c => !(c.alias && Math.abs(c.alias - c.id) < 20));
  const ST_SUB = T.QUICKPLAY | T.CONTINUOUS | T.EQUIP | T.FIELD | T.RITUAL;
  const out = pool.filter(c => {
    if (c.isToken) return false;
    if (f.kind === 1 && !c.isMonster) return false;
    if (f.kind === 2 && !c.isSpell) return false;
    if (f.kind === 3 && !c.isTrap) return false;
    if (f.kind === 1) {
      for (const fr of f.frames) if (!(c.type & fr)) return false;
      if (f.attributes && !(c.attribute & f.attributes)) return false;
      if (f.races) { let ok = false; for (const [bit] of RACES) if (has(f.races, bit) && has(c.race, bit)) ok = true; if (!ok) return false; }
      if (f.levels.length && !f.levels.includes(c.level)) return false;
      if (f.atkMin != null && !(c.atk >= f.atkMin)) return false;
      if (f.atkMax != null && !(c.atk >= 0 && c.atk <= f.atkMax)) return false;
      if (f.defMin != null && (c.isLink || !(c.def >= f.defMin))) return false;
      if (f.defMax != null && (c.isLink || !(c.def >= 0 && c.def <= f.defMax))) return false;
    }
    if (f.kind === 2 && f.spellKinds.length && !f.spellKinds.some(k => k === 0 ? !(c.type & ST_SUB) : (c.type & k))) return false;
    if (f.kind === 3 && f.trapKinds.length && !f.trapKinds.some(k => k === 0 ? !(c.type & (T.CONTINUOUS | T.COUNTER)) : (c.type & k))) return false;
    return true;
  });
  if (!byName) out.sort((a, b) => a.norm.localeCompare(b.norm));
  return finish(out, limit);
}

/** Codice di stampa (es. LOB-IT001): i codici italiani vengono convertiti nell'equivalente inglese */
export function searchSetCode(raw) {
  const code = raw.trim().toUpperCase().replace(/\s/g, '');
  const m = code.match(/^([A-Z0-9]+)-([A-Z]{0,2})(\d+)$/);
  const cands = [code];
  if (m) {
    const [, set, region, num] = m;
    cands.unshift(`${set}-EN${num}`);
    if (region.length <= 1) cands.push(`${set}-E${num}`);
    cands.push(`${set}-${num}`);
  }
  for (const k of cands) {
    const id = DB.sets[k];
    if (id && card(id)) return [card(id)];
  }
  return [];
}

// ------------------------------------------------------------------ testi
export const ATTRIBUTES = [[0x1, 'TERRA'], [0x2, 'ACQUA'], [0x4, 'FUOCO'], [0x8, 'VENTO'], [0x10, 'LUCE'], [0x20, 'OSCURITÀ'], [0x40, 'DIVINO']];
export const RACES = [
  [0x1, 'Guerriero'], [0x2, 'Incantatore'], [0x4, 'Fata'], [0x8, 'Demone'], [0x10, 'Zombie'], [0x20, 'Macchina'],
  [0x40, 'Acqua'], [0x80, 'Pyro'], [0x100, 'Roccia'], [0x200, 'Bestia Alata'], [0x400, 'Pianta'], [0x800, 'Insetto'],
  [0x1000, 'Tuono'], [0x2000, 'Drago'], [0x4000, 'Bestia'], [0x8000, 'Guerriero-Bestia'], [0x10000, 'Dinosauro'],
  [0x20000, 'Pesce'], [0x40000, 'Serpente Marino'], [0x80000, 'Rettile'], [0x100000, 'Psichico'],
  [0x200000, 'Bestia Divina'], [0x400000, 'Dio Creatore'], [0x800000, 'Wyrm'], [0x1000000, 'Cyberso'], [0x2000000, 'Illusione'],
];
export const attributeName = a => ATTRIBUTES.filter(([b]) => a & b).map(x => x[1]).join('/');
export const raceName = r => RACES.filter(([b]) => has(r, b)).map(x => x[1]).join('/');

export function typeLine(c) {
  const t = c.type;
  if (c.isSpell || c.isTrap) {
    const kind = c.isSpell ? 'Magia' : 'Trappola';
    const sub = t & T.QUICKPLAY ? 'Rapida' : t & T.CONTINUOUS ? 'Continua' : t & T.EQUIP ? 'Equipaggiamento'
      : t & T.FIELD ? 'Terreno' : t & T.COUNTER ? 'Contro' : t & T.RITUAL ? 'Rituale' : 'Normale';
    return `${kind} ${sub}`;
  }
  const parts = [];
  const add = (bit, n) => { if (t & bit) parts.push(n); };
  add(T.FUSION, 'Fusione'); add(T.SYNCHRO, 'Synchro'); add(T.XYZ, 'Xyz'); add(T.LINK, 'Link'); add(T.RITUAL, 'Rituale');
  add(T.PENDULUM, 'Pendulum'); add(T.TUNER, 'Tuner'); add(T.FLIP, 'Scoperta'); add(T.TOON, 'Toon'); add(T.SPIRIT, 'Spirit');
  add(T.UNION, 'Union'); add(T.GEMINI, 'Gemello');
  parts.push(t & T.EFFECT ? 'Effetto' : 'Normale');
  const lv = c.isLink ? `LINK-${c.linkRating}` : t & T.XYZ ? `Rango ${c.level}` : `Liv. ${c.level}`;
  return `Mostro ${parts.join('/')} · ${raceName(c.race)} · ${attributeName(c.attribute)} · ${lv}`;
}
const stat = v => v < 0 ? '?' : String(v);
export const statLine = c => !c.isMonster ? '' : c.isLink ? `ATK ${stat(c.atk)}` : `ATK ${stat(c.atk)} / DEF ${stat(c.def)}`;

export function sysText(id) {
  return (DB.strings[String(id)] || '').replace(/%ls/g, '').replace(/%d/g, '');
}

/** Descrizione di un effetto: stringa di sistema oppure stringa della carta (codice<<20 | indice) */
export function descText(d, fallbackCode = 0) {
  if (!d) return fallbackCode ? `Effetto di «${cardName(fallbackCode)}»` : '';
  if (d < 10000) return sysText(d) || `Opzione ${d}`;
  const code = Math.floor(d / 1048576);
  const idx = d % 1048576;
  const s = effectString(code, idx);
  return s ? `«${cardName(code)}»: ${s}` : `Effetto ${idx + 1} di «${cardName(code)}»`;
}

export const phaseName = p => ({ 1: 'Draw Phase', 2: 'Standby Phase', 4: 'Main Phase 1', 8: 'Battle Phase', 16: 'Battle Phase', 32: 'Battle Phase', 64: 'Battle Phase', 128: 'Battle Phase', 256: 'Main Phase 2', 512: 'End Phase' })[p] || '';
export const positionName = p => ({ 1: 'Attacco scoperto', 2: 'Attacco coperto', 4: 'Difesa scoperta', 8: 'Difesa coperta' })[p] || 'Posizione';
export function zoneName(pl, l, s) {
  const who = pl === 0 ? 'Tua' : 'Avversario';
  const z = l === LOC.MZONE ? (s === 5 ? 'Zona Mostri Extra sinistra' : s === 6 ? 'Zona Mostri Extra destra' : `Zona Mostri ${s + 1}`)
    : (s === 5 ? 'Zona Terreno' : s >= 6 ? 'Zona Pendulum' : `Zona Magie/Trappole ${s + 1}`);
  return `${who} – ${z}`;
}
