// Service worker: tiene in memoria app, dati ed effetti delle carte per usarla anche senza rete.
const APP = 'ygt-app-v1';
const DATA = 'ygt-data-v1';
const CORE = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-180.png',
  'js/main.js', 'js/data.js', 'js/store.js', 'js/engine.js', 'js/ui_core.js', 'js/ui_decks.js', 'js/ui_game.js',
  'worker.js', 'ygt.js', 'ygt.wasm'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // elimina le copie delle versioni precedenti
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== APP && k !== DATA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const p = url.pathname;
  // dati e script: prima la copia salvata (l'indirizzo cambia a ogni nuova versione dei dati)
  if (p.includes('/scripts/') || p.includes('/data/')) {
    if (p.endsWith('version.json')) {
      e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })).then(r => r || new Response('{}')));
      return;
    }
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const r = await fetch(e.request);
        if (r.ok) c.put(e.request, r.clone());
        return r;
      } catch (err) {
        const old = await c.match(e.request, { ignoreSearch: true });
        if (old) return old;
        throw err;
      }
    }));
    return;
  }
  // app: prima la rete (per ricevere gli aggiornamenti), poi la copia salvata
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cl = r.clone(); caches.open(APP).then(c => c.put(e.request, cl)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
