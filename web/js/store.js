// Archivio dei mazzi (memoria del browser) e backup in file, compatibile con l'app Android.
import { DB, card, cardName, playableCode } from './data.js';

const K_DECKS = 'ygt.decks', K_BOT = 'ygt.botmods', K_OPTS = 'ygt.opts';

function read(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (_) { return def; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (_) { return false; }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const Store = {
  decks: read(K_DECKS, []),
  botMods: read(K_BOT, {}),
  opts: Object.assign({ smartChain: false, autoZones: true }, read(K_OPTS, {})),

  save() { return write(K_DECKS, this.decks); },
  saveOpts() { write(K_OPTS, this.opts); },
  get(id) { return this.decks.find(d => d.id === id) || null; },
  upsert(d) {
    d.updated = Date.now();
    const i = this.decks.findIndex(x => x.id === d.id);
    if (i >= 0) this.decks[i] = d; else this.decks.unshift(d);
    this.save();
  },
  create(name = 'Nuovo mazzo') { const d = { id: uid(), name, main: [], extra: [], updated: Date.now() }; this.upsert(d); return d; },
  remove(id) { this.decks = this.decks.filter(d => d.id !== id); this.save(); },
  duplicate(id) {
    const d = this.get(id); if (!d) return null;
    const c = { ...d, id: uid(), name: d.name + ' (copia)', main: [...d.main], extra: [...d.extra] };
    this.upsert(c); return c;
  },

  // ---- mazzi dell'avversario
  botBase(id) { return DB.bots.find(b => b.id === id) || null; },
  botDeck(id) {
    const b = this.botBase(id); if (!b) return null;
    const m = this.botMods[id];
    return m ? { ...b, main: m.main, extra: m.extra } : b;
  },
  isBotModified(id) { return !!this.botMods[id]; },
  saveBot(id, main, extra) {
    const b = this.botBase(id); if (!b) return;
    const same = (a, c) => a.length === c.length && [...a].sort().join() === [...c].sort().join();
    if (same(b.main, main) && same(b.extra, extra)) delete this.botMods[id];
    else this.botMods[id] = { main, extra };
    write(K_BOT, this.botMods);
  },
  resetBot(id) { delete this.botMods[id]; write(K_BOT, this.botMods); },

  // ---- backup (stesso formato dell'app Android)
  backupJson() {
    return JSON.stringify({ app: 'ygotester', version: 1, created: new Date().toISOString(),
      decks: this.decks, botOverrides: this.botMods }, null, 1);
  },
  /** Ripristina un backup: i mazzi con lo stesso id vengono sostituiti, gli altri restano */
  restore(text) {
    let o;
    try { o = JSON.parse(text); } catch (_) { throw new Error('Il file non è un backup valido.'); }
    if (!o || o.app !== 'ygotester' || !Array.isArray(o.decks)) throw new Error('Il file non è un backup di YGO Tester.');
    let n = 0;
    for (const d of o.decks) {
      if (!d || !d.id || !Array.isArray(d.main)) continue;
      const clean = { id: String(d.id), name: String(d.name || 'Mazzo'), main: d.main.map(Number), extra: (d.extra || []).map(Number), updated: d.updated || Date.now() };
      const i = this.decks.findIndex(x => x.id === clean.id);
      if (i >= 0) this.decks[i] = clean; else this.decks.push(clean);
      n++;
    }
    this.save();
    let b = 0;
    if (o.botOverrides && typeof o.botOverrides === 'object') {
      for (const [k, v] of Object.entries(o.botOverrides)) {
        if (v && Array.isArray(v.main)) { this.botMods[k] = { main: v.main.map(Number), extra: (v.extra || []).map(Number) }; b++; }
      }
      write(K_BOT, this.botMods);
    }
    return { decks: n, bots: b };
  },
};

export function parseYdk(name, text) {
  const main = [], extra = [];
  let sec = 0;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('#main')) sec = 0;
    else if (l.startsWith('#extra')) sec = 1;
    else if (l.startsWith('!side')) sec = 2;
    else if (/^\d+$/.test(l)) {
      const id = playableCode(Number(l));
      if (sec === 0) main.push(id); else if (sec === 1) extra.push(id);
    }
  }
  if (!main.length && !extra.length) return null;
  return { id: uid(), name, main, extra, updated: Date.now() };
}

export function toYdk(d) {
  return `#created by YGO Tester\n#main\n${d.main.join('\n')}\n#extra\n${d.extra.join('\n')}\n!side\n`;
}

/** Problemi del mazzo per il regolamento base (40-60 Main, max 15 Extra, max 3 copie) */
export function deckProblems(d) {
  const out = [];
  if (d.main.length < 40) out.push(`Il Main Deck ha ${d.main.length} carte: ne servono almeno 40.`);
  if (d.main.length > 60) out.push(`Il Main Deck ha ${d.main.length} carte: massimo 60.`);
  if (d.extra.length > 15) out.push(`L'Extra Deck ha ${d.extra.length} carte: massimo 15.`);
  const counts = new Map();
  for (const id of [...d.main, ...d.extra]) { const b = card(id)?.baseId ?? id; counts.set(b, (counts.get(b) || 0) + 1); }
  for (const [id, n] of counts) if (n > 3) out.push(`«${cardName(id)}» compare ${n} volte (massimo 3).`);
  return out;
}
