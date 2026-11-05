// Web Worker: ospita il motore delle regole (WebAssembly) così l'interfaccia non si blocca
// mentre l'avversario pensa.
/* global createYgt, importScripts */
importScripts('ygt.js');

let M = null;
let version = '';
const scripts = new Map();   // nome -> testo (o null se non esiste)

function scriptUrl(name) { return `scripts/${name}${version ? '?v=' + encodeURIComponent(version) : ''}`; }

// Chiamato dal motore in modo sincrono: usa la cache o, se serve, una richiesta sincrona
function loadScript(name) {
  if (scripts.has(name)) return scripts.get(name);
  let text = null;
  try {
    const x = new XMLHttpRequest();
    x.open('GET', scriptUrl(name), false);
    x.send();
    if (x.status === 200) text = x.responseText;
  } catch (_) { text = null; }
  scripts.set(name, text);
  return text;
}

async function prefetch(names) {
  const todo = names.filter(n => !scripts.has(n));
  let i = 0, done = 0;
  async function lane() {
    while (i < todo.length) {
      const n = todo[i++];
      try {
        const r = await fetch(scriptUrl(n));
        scripts.set(n, r.ok ? await r.text() : null);
      } catch (_) { /* riproverà in modo sincrono durante il duello */ }
      done++;
      if (done % 8 === 0 || done === todo.length) postMessage({ type: 'progress', done, total: todo.length });
    }
  }
  await Promise.all(Array.from({ length: 8 }, lane));
}

function ints(arr) {
  const p = M._malloc(Math.max(1, arr.length) * 4);
  M.HEAPU32.set(arr, p >>> 2);
  return p;
}

function str(ptr) { return M.UTF8ToString(ptr); }

const handlers = {
  async init({ binUrl, v }) {
    version = v || '';
    M = await createYgt({ loadScript });
    const res = await fetch(binUrl);
    if (!res.ok) throw new Error('Impossibile scaricare i dati del motore');
    const bin = new Uint8Array(await res.arrayBuffer());
    const p = M._malloc(bin.length);
    M.HEAPU8.set(bin, p);
    const ok = M._ygt_load_cards(p, bin.length);
    M._free(p);
    if (!ok) throw new Error('Dati del motore non validi');
    return true;
  },
  async prefetch({ names }) { await prefetch(names); return true; },
  create({ hMain, hExtra, bMain, bExtra, difficulty, humanFirst, autoHuman }) {
    const ptrs = [ints(hMain), ints(hExtra), ints(bMain), ints(bExtra)];
    const lo = (Math.random() * 0xffffffff) >>> 0, hi = (Math.random() * 0xffffffff) >>> 0;
    const h = M._ygt_create(ptrs[0], hMain.length, ptrs[1], hExtra.length, ptrs[2], bMain.length, ptrs[3], bExtra.length,
      difficulty, humanFirst ? 1 : 0, lo, hi);
    ptrs.forEach(p => M._free(p));
    if (!h) throw new Error(str(M._ygt_last_error()) || 'Impossibile avviare il duello');
    if (autoHuman != null) M._ygt_set_auto_human(h, autoHuman, lo);
    return h;
  },
  advance({ h }) { return str(M._ygt_advance(h)); },
  respond({ h, json }) {
    const p = M.stringToNewUTF8(json);
    const out = str(M._ygt_respond(h, p));
    M._free(p);
    return out;
  },
  surrender({ h }) { return str(M._ygt_surrender(h)); },
  destroy({ h }) { M._ygt_destroy(h); return true; },
};

onmessage = async (e) => {
  const { id, type, ...args } = e.data;
  try {
    const result = await handlers[type](args);
    postMessage({ id, ok: true, result });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
