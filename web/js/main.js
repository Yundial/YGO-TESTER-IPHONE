// Avvio della web app.
import { DB, loadData } from './data.js';
import { Store } from './store.js';
import { h, clear, setRoot, replace, go } from './ui_core.js';
import { DecksScreen, BackupScreen } from './ui_decks.js';
import { NewGameScreen, NG } from './ui_game.js';

const app = document.getElementById('app');
setRoot(app);
history.replaceState({ depth: 1 }, '');

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function HomeScreen() {
  return {
    render() {
      const btn = (icon, title, sub, onclick) => h('button.home-btn', { onclick }, h('span.home-icon', icon), h('span.grow', h('b', title), h('span.muted.small', sub)));
      const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const el = h('div.screen.home',
        h('div.home-title', 'YGO Tester'),
        h('p.muted.center', 'Prova i tuoi mazzi contro un avversario virtuale'),
        btn('▶', 'Gioca una partita di prova', 'Scegli mazzo, difficoltà e avversario', () => { NG.step = 0; NG.botDeck = null; go(NewGameScreen(HomeScreen())); }),
        btn('🂠', 'I miei mazzi', `${Store.decks.length} mazzi in archivio`, () => go(DecksScreen())),
        btn('⤓', 'Backup e dati', 'Salva o ripristina mazzi e modifiche', () => go(BackupScreen())),
        !standalone && isIos ? h('div.tip', h('b', 'Consiglio: '), "tocca Condividi ", h('span.share-ico', '⬆︎'), " e poi «Aggiungi alla schermata Home». Così l'app si apre a schermo intero e i mazzi restano salvati al sicuro.") : null);
      return { el };
    },
  };
}

async function boot() {
  const bar = h('div.progress', h('div.fill'));
  const label = h('p.muted');
  clear(app).appendChild(h('div.screen.boot', h('div.home-title', 'YGO Tester'), label, bar));
  try {
    await loadData((t, f) => { label.textContent = t; bar.firstChild.style.width = Math.round(f * 100) + '%'; });
    // chiede al browser di non cancellare i dati salvati
    try { navigator.storage?.persist?.(); } catch (_) {}
    replace(HomeScreen());
  } catch (e) {
    clear(app).appendChild(h('div.screen.boot', h('div.home-title', 'YGO Tester'),
      h('p.warn', 'Non riesco a caricare i dati delle carte. Serve la connessione a internet la prima volta.'),
      h('p.muted.small', String(e.message || e)),
      h('button.primary', { onclick: boot }, 'Riprova')));
  }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
void DB;
boot();
