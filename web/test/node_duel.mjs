// Prova del motore WebAssembly in Node: bot contro bot con i mazzi dell'app.
// uso: node node_duel.mjs <ygt.js> <cartella dati web> <idMazzoA> <idMazzoB> <livA> <livB> <partite>
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const [ygtJs, webDir, a, b, la, lb, games] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const createYgt = require(path.resolve(ygtJs));
const missing = new Set();
const M = await createYgt({ loadScript: name => {
  const p = path.join(webDir, 'scripts', name);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  missing.add(name); return null;
} });
const bin = fs.readFileSync(path.join(webDir, 'data', 'cards.bin'));
const p = M._malloc(bin.length); M.HEAPU8.set(bin, p);
if (!M._ygt_load_cards(p, bin.length)) throw new Error('cards.bin');
const bots = JSON.parse(fs.readFileSync(path.join(webDir, 'data', 'bot_decks.json'), 'utf8'));
const deck = id => bots.find(x => x.id === id);
const ints = arr => { const q = M._malloc(Math.max(1, arr.length) * 4); M.HEAPU32.set(arr, q >>> 2); return q; };
let wa = 0, wb = 0, other = 0;
for (let g = 0; g < Number(games); g++) {
  const A = deck(a), B = deck(b);
  const t0 = Date.now();
  const h = M._ygt_create(ints(A.main), A.main.length, ints(A.extra), A.extra.length, ints(B.main), B.main.length, ints(B.extra), B.extra.length, Number(lb), g % 2, 1000 + g, 7);
  if (!h) { console.log('errore', M.UTF8ToString(M._ygt_last_error())); process.exit(1); }
  M._ygt_set_auto_human(h, Number(la), 99 + g);
  const v = JSON.parse(M.UTF8ToString(M._ygt_advance(h)));
  const w = v.end ? v.end.winner : -1;
  if (w === 0) wa++; else if (w === 1) wb++; else other++;
  console.log(`partita ${g + 1}: vince ${w === 0 ? 'A' : w === 1 ? 'B' : '?'} turni ${v.state.turn} ${Date.now() - t0} ms${v.error ? ' ERRORE ' + v.error : ''}`);
  M._ygt_destroy(h);
}
console.log(`TOTALE A ${wa} B ${wb} altro ${other} script mancanti ${[...missing].length}`);
