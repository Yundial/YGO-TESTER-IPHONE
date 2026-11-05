// Nuova partita, tavolo di gioco, richieste di scelta del motore.
import { DB, card, cardName, playableCode, descText, phaseName, positionName, zoneName, search, LOC, POS, faceUp, isDefense,
  ATTRIBUTES, RACES, T } from './data.js';
import { Store, deckProblems } from './store.js';
import { createDuel, prefetchScripts, pcards, response } from './engine.js';
import { h, clear, go, back, home, replace, modal, closeAllModals, confirmBox, cardImg, cardDetail, topBar, onLongPress } from './ui_core.js';
import { coverOf, BotEditorScreen, DecksScreen } from './ui_decks.js';

export const DIFFS = ['Facile', 'Medio', 'Difficile', 'Incubo'];
const DIFF_DESC = [
  'Gioca per divertirsi: mosse spesso a caso, attacca volentieri, usa poco le risposte.',
  "Gioca per vincere, ma con calma: poche Evocazioni dall'Extra, a volte si ferma, nega di rado. Ideale per provare i mazzi.",
  'Competitivo: combo di base, attacchi ragionati e negazioni frequenti, ma non calcola le sequenze. Mazzi del meta.',
  'Vuole batterti a tutti i costi: prova più sequenze di gioco prima di scegliere e nega appena può. Stessi mazzi di Difficile.',
];
export const deckLevel = d => Math.min(d, 2);

// ------------------------------------------------------------------ nuova partita (le scelte restano tornando indietro)
export const NG = { step: 0, deckId: null, difficulty: 1, botDeck: null };

export function NewGameScreen(homeScreen) {
  let redraw = () => {};
  return {
    onBack() { if (NG.step > 0) { NG.step--; redraw(); return false; } return true; },
    render() {
      const box = h('div.screen');
      redraw = () => {
        clear(box);
        const titles = ['1 · Il tuo mazzo', '2 · Difficoltà', '3 · Avversario', '4 · Chi inizia'];
        box.appendChild(topBar(titles[NG.step], () => { if (NG.step > 0) { NG.step--; redraw(); } else back(); }));
        const list = h('div.list');
        box.appendChild(list);
        if (NG.step === 0) {
          if (!Store.decks.length) list.append(h('p.muted', "Non hai ancora mazzi. Creane uno o importalo dall'archivio."), h('button.outline', { onclick: () => go(DecksScreen()) }, 'Vai ai mazzi'));
          for (const d of Store.decks) {
            const probs = deckProblems(d);
            list.appendChild(choice(NG.deckId === d.id, d.name, `Main ${d.main.length} · Extra ${d.extra.length}` + (probs.length ? `\n⚠ ${probs[0]}` : ''), coverOf(d.main),
              d.main.length ? () => { NG.deckId = d.id; NG.step = 1; redraw(); } : null));
          }
        } else if (NG.step === 1) {
          DIFFS.forEach((n, i) => list.appendChild(choice(NG.difficulty === i, n, DIFF_DESC[i], null, () => { NG.difficulty = i; NG.botDeck = null; NG.step = 2; redraw(); })));
        } else if (NG.step === 2) {
          list.appendChild(choice(NG.botDeck == null, 'Casuale', `Un mazzo a sorpresa del livello ${DIFFS[NG.difficulty]}`, null, () => { NG.botDeck = null; NG.step = 3; redraw(); }));
          list.appendChild(h('p.muted.small', 'Tocca un mazzo per sceglierlo, oppure «Vedi / modifica» per guardarlo e cambiarlo prima del duello.'));
          for (const orig of DB.bots.filter(b => b.level === deckLevel(NG.difficulty))) {
            const b = Store.botDeck(orig.id);
            const mod = Store.isBotModified(orig.id);
            list.appendChild(choice(NG.botDeck === b.id, b.name + (mod ? ' ✎' : ''), `${b.desc}\nMain ${b.main.length} · Extra ${b.extra.length}${mod ? ' · modificato da te' : ''}`,
              coverOf(b.main), () => { NG.botDeck = b.id; NG.step = 3; redraw(); },
              h('button.text.small', { onclick: e => { e.stopPropagation(); go(BotEditorScreen(b.id)); } }, 'Vedi /', h('br'), 'modifica')));
          }
        } else {
          const mine = Store.get(NG.deckId);
          list.append(
            h('p', `Il tuo mazzo: ${mine?.name || '-'}`),
            h('p', `Difficoltà: ${DIFFS[NG.difficulty]}`),
            h('p', `Avversario: ${Store.botDeck(NG.botDeck || '')?.name || 'casuale'}`),
            h('h3', 'Chi inizia il duello?'),
            ...['Testa o croce', 'Inizio io', "Inizia l'avversario"].map((l, i) => h('button.primary.block', { onclick: () => {
              if (!mine) return;
              go(DuelScreen({ deckId: mine.id, difficulty: NG.difficulty, botDeckId: NG.botDeck, first: i }, homeScreen));
            } }, l)));
        }
      };
      redraw();
      return { el: box };
    },
  };
}

function choice(selected, title, sub, cover, onclick, trailing = null) {
  return h('div.row-card' + (selected ? '.selected' : '') + (onclick ? '' : '.disabled'), { onclick: onclick || null },
    cover != null ? cardImg(cover, { cls: 'thumb' }) : null,
    h('div.grow', h('div.title', title), h('div.muted.small.pre', sub)),
    trailing);
}

// ------------------------------------------------------------------ duello
const PHASE_TIMINGS = 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x1000000 | 0x4000000;

function idleActions(p) {
  const out = [];
  const act = (c, i, idx) => { const d = descText(c.desc); out.push({ card: c, label: !c.desc || !d ? 'Attiva' : 'Attiva: ' + d, json: idx }); };
  if (p.k === 'idle') {
    pcards(p, 'summon').forEach((c, i) => out.push({ card: c, label: 'Evoca Normalmente', json: response({ a: 0, b: i }) }));
    pcards(p, 'sp').forEach((c, i) => out.push({ card: c, label: 'Evoca Specialmente', json: response({ a: 1, b: i }) }));
    pcards(p, 'repos').forEach((c, i) => out.push({ card: c, label: 'Cambia posizione', json: response({ a: 2, b: i }) }));
    pcards(p, 'mset').forEach((c, i) => out.push({ card: c, label: 'Posiziona coperto', json: response({ a: 3, b: i }) }));
    pcards(p, 'sset').forEach((c, i) => out.push({ card: c, label: 'Posiziona coperta', json: response({ a: 4, b: i }) }));
    pcards(p, 'act').forEach((c, i) => act(c, i, response({ a: 5, b: i })));
  } else if (p.k === 'battle') {
    pcards(p, 'act').forEach((c, i) => act(c, i, response({ a: 0, b: i })));
    pcards(p, 'atk').forEach((c, i) => out.push({ card: c, label: c.param ? 'Attacca (anche direttamente)' : 'Attacca', json: response({ a: 1, b: i }) }));
  } else if (p.k === 'chain') {
    pcards(p, 'cards').forEach((c, i) => act(c, i, response({ a: i })));
  }
  return out;
}

const matches = (c, pl, loc, seq) => c && c.pl === pl && (c.loc & 0x7f) === loc && c.seq === seq;

function isQuietWindow(p, v) {
  if (p.k !== 'chain' || p.forced || v.chain.length) return false;
  return (((p.t1 || 0) | (p.t2 || 0)) & ~PHASE_TIMINGS) === 0;
}
function shouldAutoPass(p, v) {
  if (!isQuietWindow(p, v)) return false;
  if (v.turnPlayer === 1 && v.phase === 0x200) return false;
  const cards = pcards(p, 'cards');
  return cards.length > 0 && cards.every(c => (c.loc & 0x7f) === LOC.SZONE);
}
function autoZone(p) {
  if (p.k !== 'place' || p.dis || p.count > 1) return null;
  const z = p.zones || [];
  const pick = [2, 1, 3, 0, 4, 5, 6, 7].map(s => z.find(x => x.pl === 0 && x.s === s)).find(Boolean) || z[0];
  return pick ? response({ places: [pick.pl, pick.l, pick.s] }) : null;
}

export function DuelScreen(config, homeScreen) {
  let session = null, closed = false, botName = 'Avversario';
  let ui = { minimized: false, lastPrompt: null };
  return {
    onBack() {
      if (session && session.view && session.view.winner == null) {
        confirmBox('Abbandonare il duello?', 'La partita verrà considerata persa.', 'Abbandona', () => { closed = true; session?.close(); session = null; back(); });
        return false;
      }
      return true;
    },
    render() {
      const root = h('div.screen.duel');
      const status = h('div.prep', h('div.spinner'), h('p', 'Preparo il duello…'));
      root.appendChild(status);
      const setStatus = (t, err) => { clear(status); if (!err) status.appendChild(h('div.spinner')); status.appendChild(h('p' + (err ? '.warn' : ''), t)); if (err) status.appendChild(h('button.primary', { onclick: back }, 'Indietro')); };
      (async () => {
        try {
          const mine = Store.get(config.deckId);
          if (!mine) throw new Error('Mazzo non trovato.');
          const pool = DB.bots.filter(b => b.level === deckLevel(config.difficulty));
          const bot = Store.botDeck(config.botDeckId || '') || Store.botDeck((pool.length ? pool : DB.bots)[Math.floor(Math.random() * (pool.length || DB.bots.length))].id);
          botName = bot.name;
          const hMain = mine.main.map(playableCode), hExtra = mine.extra.map(playableCode);
          setStatus('Controllo gli effetti delle carte…');
          await prefetchScripts([...hMain, ...hExtra, ...bot.main, ...bot.extra], (d, t) => setStatus(`Scarico gli effetti delle carte… ${d}/${t}`));
          const humanFirst = config.first === 1 ? true : config.first === 2 ? false : Math.random() < 0.5;
          setStatus(humanFirst ? 'Inizi tu!' : "Inizia l'avversario!");
          session = await createDuel({ hMain, hExtra, bMain: bot.main, bExtra: bot.extra, difficulty: config.difficulty, humanFirst });
          if (closed) { session.close(); return; }
          session.onChange(() => draw());
          await session.start();
        } catch (e) { setStatus(e.message || String(e), true); }
      })();

      function send(json) { session?.respond(json); }

      function draw() {
        if (!session || closed) return;
        const v = session.view;
        if (!v) return;
        if (v.prompt !== ui.lastPrompt) { ui.minimized = false; ui.lastPrompt = v.prompt; }
        closeAllModals();
        clear(root);
        const me = v.players[0], opp = v.players[1];
        if (!me || !opp) return;
        const p = v.prompt;
        const kind = p?.k || '';
        const actions = p ? idleActions(p) : [];
        const busy = session.busy;

        // risposte automatiche (catene vuote, zone)
        if (p && !busy && !v.error && v.winner == null) {
          const zone = Store.opts.autoZones ? autoZone(p) : null;
          if (Store.opts.smartChain && shouldAutoPass(p, v)) { setTimeout(() => send(response({ a: -1 })), 0); }
          else if (zone) { setTimeout(() => send(zone), 0); }
        }
        const autoPassing = p && !v.error && ((Store.opts.smartChain && shouldAutoPass(p, v)) || (Store.opts.autoZones && autoZone(p)));

        const tap = (pl, loc, seq, code) => {
          const acts = actions.filter(a => matches(a.card, pl, loc, seq));
          if (acts.length && !busy) showActions(acts);
          else if (code) cardDetail(code);
        };
        const hl = (pl, loc, seq) => actions.some(a => matches(a.card, pl, loc, seq));

        root.appendChild(playerBar(`${botName} · ${DIFFS[config.difficulty]}`, opp.lp, v.turnPlayer === 1, 'opp'));
        root.appendChild(h('div.opp-hand', h('span.muted.tiny', `Mano ${opp.hand.length}`),
          opp.hand.slice(0, 12).map((c, i) => h('div.mini', { onclick: () => tap(1, LOC.HAND, i, c?.code || 0) }, cardImg(c?.code || 0)))));

        // campo 7 colonne
        const f = h('div.board');
        const row = (...cells) => f.appendChild(h('div.frow', cells));
        const zone = (c, monster, pl, loc, seq) => zoneCell(c, monster, hl(pl, loc, seq), () => tap(pl, loc, seq, c?.code || 0));
        const pile = (label, count, top, onclick, hi = false) => pileCell(label, count, top, onclick, hi);
        row(pile('Deck', opp.deck, null, null), ...[4, 3, 2, 1, 0].map(i => zone(opp.s[i], false, 1, LOC.SZONE, i)),
          pile('Extra', opp.extraCount, opp.ex[opp.ex.length - 1], () => openPile('Extra Deck avversario (scoperte)', 1, LOC.EXTRA, opp.ex)));
        row(pile('Cimit.', opp.gy.length, opp.gy[opp.gy.length - 1], () => openPile('Cimitero avversario', 1, LOC.GRAVE, opp.gy)),
          ...[4, 3, 2, 1, 0].map(i => zone(opp.m[i], true, 1, LOC.MZONE, i)), zone(opp.s[5], false, 1, LOC.SZONE, 5));
        const emz = (mySeq, oppSeq) => me.m[mySeq] ? zone(me.m[mySeq], true, 0, LOC.MZONE, mySeq) : opp.m[oppSeq] ? zone(opp.m[oppSeq], true, 1, LOC.MZONE, oppSeq) : zoneCell(null, true, false, null);
        row(pile('Band.', opp.ban.length, opp.ban[opp.ban.length - 1], () => openPile("Carte bandite dell'avversario", 1, LOC.REMOVED, opp.ban)),
          h('div.cell.empty'), emz(5, 6), h('div.cell.turn', `T${v.turn}`), emz(6, 5), h('div.cell.empty'),
          pile('Band.', me.ban.length, me.ban[me.ban.length - 1], () => openPile('Le tue carte bandite', 0, LOC.REMOVED, me.ban)));
        row(zone(me.s[5], false, 0, LOC.SZONE, 5), ...[0, 1, 2, 3, 4].map(i => zone(me.m[i], true, 0, LOC.MZONE, i)),
          pile('Cimit.', me.gy.length, me.gy[me.gy.length - 1], () => openPile('Il tuo Cimitero', 0, LOC.GRAVE, me.gy), actions.some(a => a.card?.pl === 0 && (a.card.loc & 0x7f) === LOC.GRAVE)));
        row(pile('Extra', me.extraCount, null, () => openPile('Il tuo Extra Deck', 0, LOC.EXTRA, me.ex), actions.some(a => (a.card?.loc & 0x7f) === LOC.EXTRA)),
          ...[0, 1, 2, 3, 4].map(i => zone(me.s[i], false, 0, LOC.SZONE, i)), pile('Deck', me.deck, null, null));
        root.appendChild(f);

        // stato
        root.appendChild(h('div.status-row',
          h('span.gold.small.grow', (v.turnPlayer === 0 ? 'Tuo turno' : 'Turno avversario') + ' · ' + phaseName(v.phase) + (v.chain.length ? ` · Catena: ${v.chain.length}` : '')),
          h('button.text.small', { onclick: optionsDialog }, 'Opzioni'),
          h('button.text.small', { onclick: logDialog }, 'Registro'),
          h('button.text.small.danger', { onclick: () => history.back() }, 'Esci')));
        if (busy) root.appendChild(h('div.busy', h('div.bar'), h('span.muted.tiny', "L'avversario sta giocando…")));
        if (v.error && v.winner == null) root.appendChild(h('div.warn.small.pad-x', v.error));
        const log = h('div.log', session.log.map(l => h('div' + (l.startsWith('──') ? '.gold' : ''), l)));
        root.appendChild(log);
        setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);

        // barra azioni
        const quiet = p && isQuietWindow(p, v);
        if (!busy && v.winner == null && quiet && !(Store.opts.smartChain && shouldAutoPass(p, v))) {
          root.appendChild(h('div.gold.tiny.pad-x', `Momento libero (${phaseName(v.phase)}): puoi attivare una carta o un effetto. Le carte attivabili sono evidenziate.`));
          root.appendChild(h('div.actionbar',
            h('button.outline', { disabled: !actions.length, onclick: () => showActions(actions) }, `Attiva (${actions.length})`),
            h('button.primary', { onclick: () => send(response({ a: -1 })) }, 'Passa')));
        } else if (!busy && v.winner == null && (kind === 'idle' || kind === 'battle')) {
          const bar = h('div.actionbar', h('button.outline', { disabled: !actions.length, onclick: () => showActions(actions) }, `Azioni (${actions.length})`));
          if (kind === 'idle') {
            if (p.bp) bar.appendChild(h('button.primary', { onclick: () => send(response({ a: 6 })) }, 'Battle'));
            if (p.ep) bar.appendChild(h('button.primary', { onclick: () => send(response({ a: 7 })) }, 'Fine turno'));
          } else {
            if (p.m2) bar.appendChild(h('button.primary', { onclick: () => send(response({ a: 2 })) }, 'Main 2'));
            if (p.ep) bar.appendChild(h('button.primary', { onclick: () => send(response({ a: 3 })) }, 'Fine turno'));
          }
          root.appendChild(bar);
        } else if (p && ui.minimized && !busy) {
          root.appendChild(h('div.actionbar', h('button.primary', { onclick: () => { ui.minimized = false; draw(); } }, 'Torna alla scelta')));
        }

        // mano
        const hand = h('div.hand');
        me.hand.forEach((c, i) => {
          const code = c?.code || 0;
          const el = h('div.hand-card' + (hl(0, LOC.HAND, i) ? '.hl' : ''), { onclick: () => tap(0, LOC.HAND, i, code) }, cardImg(code));
          onLongPress(el, () => code && cardDetail(code));
          hand.appendChild(el);
        });
        root.appendChild(hand);
        root.appendChild(playerBar('Tu', me.lp, v.turnPlayer === 0, 'me'));

        // finestre
        if (v.winner != null) {
          const w = v.winner;
          modal({ title: w === 0 ? 'Hai vinto! 🏆' : w === 1 ? 'Hai perso' : 'Pareggio', dismissable: false,
            body: h('p', (v.error ? v.error + '\n' : '') + `Turni giocati: ${v.turn} · LP finali: tu ${me.lp}, avversario ${opp.lp}`),
            buttons: [
              { label: 'Home', onclick: c => { c(); session?.close(); home(homeScreen); } },
              { label: 'Cambia', onclick: c => { c(); session?.close(); session = null; back(); } },
              { label: 'Rivincita', kind: 'text.gold', onclick: c => { c(); session?.close(); replace(DuelScreen(config, homeScreen)); } },
            ] });
        } else if (p && !busy && kind !== 'idle' && kind !== 'battle' && !ui.minimized && !autoPassing && !quiet) {
          promptDialog(p, v, send, () => { ui.minimized = true; draw(); });
        }

        function showActions(list) {
          const close = modal({ title: 'Cosa vuoi fare?', body: h('div.col', list.map(a => h('div.action', { onclick: () => { close(); send(a.json); } },
            a.card ? cardImg(a.card.code, { cls: 'thumb' }) : null,
            h('div.grow', h('div.ellipsis', a.card ? cardName(a.card.code) : ''), h('div.gold.small', a.label))))),
          buttons: [
            new Set(list.map(a => a.card?.code)).size === 1 && list[0].card?.code ? { label: 'Dettagli', onclick: c => { c(); cardDetail(list[0].card.code); } } : null,
            { label: 'Annulla', onclick: c => c() },
          ] });
        }
        function openPile(title, pl, loc, cards) {
          const close = modal({ title: `${title} (${cards.length})`, wide: true, body: cards.length ? h('div.col', [...cards.entries()].reverse().map(([i, c]) => {
            const code = c?.code || 0;
            const acts = actions.filter(a => matches(a.card, pl, loc, i));
            return h('div.action', { onclick: () => { if (acts.length && !busy) { close(); showActions(acts); } else if (code) cardDetail(code); } },
              cardImg(code, { cls: 'thumb' }), h('div.grow', h('div.ellipsis', code ? cardName(code) : 'Carta coperta'), acts.length ? h('div.gold.tiny', 'Ha un effetto attivabile') : null));
          })) : h('p', 'Nessuna carta.'), buttons: [{ label: 'Chiudi', onclick: c => c() }] });
        }
        function logDialog() {
          modal({ title: 'Registro del duello', wide: true, body: h('div.col.small', [...session.log].reverse().map(l => h('div', l))), buttons: [{ label: 'Chiudi', onclick: c => c() }] });
        }
        function optionsDialog() {
          const opt = (title, sub, key) => h('label.option', h('div.grow', h('div', title), h('div.muted.small', sub)),
            h('input', { type: 'checkbox', checked: Store.opts[key] ? true : null, onchange: e => { Store.opts[key] = e.target.checked; Store.saveOpts(); } }));
          modal({ title: 'Opzioni del duello', body: h('div.col',
            opt('Salta i momenti liberi', 'Passa da solo quando non è successo nulla e puoi attivare solo carte coperte.', 'smartChain'),
            opt('Scegli le zone in automatico', 'Mette le carte nella zona libera più centrale (spegnilo per i mostri Link).', 'autoZones')),
          buttons: [{ label: 'Fatto', onclick: c => { c(); draw(); } }] });
        }
      }

      return { el: root, cleanup: () => { closed = true; session?.close(); } };
    },
  };
}

function playerBar(name, lp, active, who) {
  return h('div.pbar.' + who + (active ? '.active' : ''), h('span.grow.ellipsis', name), h('b', `LP ${lp}`));
}

function zoneCell(c, monster, highlight, onclick) {
  const el = h('div.cell' + (highlight ? '.hl' : ''), { onclick: onclick || null });
  if (c) {
    const down = !faceUp(c.pos);
    const def = monster && isDefense(c.pos);
    const img = cardImg(down && !c.code ? 0 : c.code);
    if (down && c.code) img.classList.add('dim');
    el.appendChild(h('div.cimg' + (def ? '.def' : ''), img));
    if (monster && !down) el.appendChild(h('div.stat', (c.type & T.LINK) ? `${c.atk}` : `${c.atk}/${c.def}`));
    if (c.overlays) el.appendChild(h('div.ov', String(c.overlays)));
  }
  return el;
}

function pileCell(label, count, top, onclick, hl = false) {
  return h('div.cell.pile' + (hl ? '.hl' : ''), { onclick: onclick || null },
    top ? cardImg(top.code) : (count && (label === 'Deck' || label === 'Extra')) ? h('div.card-back') : null,
    h('div.pile-label', h('span', label), h('b', String(count))));
}

// ------------------------------------------------------------------ richieste di scelta
function whereLabel(c) {
  const who = c.pl === 0 ? 'Tuo' : 'Avv.';
  if (c.loc & LOC.OVERLAY) return `${who} · Materiale`;
  const l = c.loc & 0x7f;
  const w = l === LOC.MZONE ? (c.seq >= 5 ? 'Zona Extra' : 'Mostri') : l === LOC.SZONE ? (c.seq === 5 ? 'Terreno' : 'M/T')
    : l === LOC.HAND ? 'Mano' : l === LOC.GRAVE ? 'Cimitero' : l === LOC.REMOVED ? 'Bandita' : l === LOC.DECK ? 'Deck' : l === LOC.EXTRA ? 'Extra' : '';
  return `${who} · ${w}`;
}
const hintText = (p, fb) => (p.hint ? descText(p.hint) : '') || fb;

function dlg(title, body, buttons, onMinimize) {
  return modal({ title, body, dismissable: false, buttons: [{ label: 'Guarda il campo', kind: 'text.muted', onclick: c => { c(); onMinimize(); } }, ...buttons] });
}

function cardGrid(cards, selected, { showValue = false, order = [], onTap }) {
  return h('div.pgrid', cards.map((c, i) => {
    const on = selected.has(i);
    const el = h('div.pcell' + (on ? '.on' : ''), { onclick: () => onTap(i) },
      h('div.pimg', cardImg(c.code), on && order.length ? h('span.badge', String(order.indexOf(i) + 1)) : null),
      h('div.tiny.center.clamp2', c.code ? cardName(c.code) : 'Coperta'),
      h('div.muted.tiny.center', whereLabel(c)),
      showValue && c.param ? h('div.gold.tiny.center', ((c.param >>> 16) && (c.param >>> 16) !== (c.param & 0xffff)) ? `val. ${c.param & 0xffff}/${c.param >>> 16}` : `val. ${c.param & 0xffff}`) : null);
    onLongPress(el, () => c.code && cardDetail(c.code));
    return el;
  }));
}

function promptDialog(p, v, send, onMinimize) {
  const k = p.k;
  if (k === 'effyn') {
    const code = p.card?.c || 0;
    return dlg("Attivare l'effetto?", h('div.row', h('div.thumb-lg', { onclick: () => code && cardDetail(code) }, cardImg(code)),
      h('div.grow', h('b', `«${cardName(code)}»`), p.d ? h('div.small', descText(p.d, code)) : null)),
      [{ label: 'No', onclick: c => { c(); send(response({ a: 0 })); } }, { label: 'Sì', kind: 'text.gold', onclick: c => { c(); send(response({ a: 1 })); } }], onMinimize);
  }
  if (k === 'yesno') {
    const text = p.d === 31 ? 'Vuoi attaccare direttamente?' : descText(p.d) || 'Confermi?';
    return dlg('Scelta', h('p', text), [{ label: 'No', onclick: c => { c(); send(response({ a: 0 })); } }, { label: 'Sì', kind: 'text.gold', onclick: c => { c(); send(response({ a: 1 })); } }], onMinimize);
  }
  if (k === 'option' || k === 'number') {
    const isNum = k === 'number';
    let close;
    close = dlg(isNum ? 'Dichiara un numero' : hintText(p, "Scegli un'opzione"),
      h('div.col', (p.opts || []).map((o, i) => h('button.outline.block', { onclick: () => { close(); send(response({ a: i })); } }, isNum ? String(o) : descText(o)))), [], onMinimize);
    return close;
  }
  if (k === 'card' || k === 'tribute' || k === 'sum') {
    const cards = pcards(p, 'cards'), must = pcards(p, 'must');
    const min = p.min || 0, max = Math.max(1, p.max || 0);
    const title = k === 'tribute' ? hintText(p, 'Scegli i mostri da offrire come Tributo')
      : k === 'sum' ? hintText(p, 'Scegli le carte') + ` (totale ${p.acc})` : hintText(p, 'Scegli le carte');
    const sub = k === 'sum' ? (must.length ? 'Già incluse: ' + must.map(m => cardName(m.code)).join(', ') : `La somma dei valori deve essere ${p.acc}`)
      : k === 'tribute' ? `Servono ${min} ${min === 1 ? 'Tributo' : 'Tributi'}`
      : min === max ? `Seleziona ${min} ${min === 1 ? 'carta' : 'carte'}` : `Seleziona da ${min} a ${max} carte`;
    const single = k === 'card' && max === 1 && min <= 1;
    const chosen = [];
    const holder = h('div');
    // per i Tributi conta il valore (alcuni mostri valgono 2 Tributi)
    const tributeValue = () => chosen.reduce((a, i) => a + Math.max(1, cards[i].param || 1), 0);
    const canConfirm = () => {
      const n = chosen.length;
      if (k === 'card') return (n >= Math.max(1, min) && n <= max) || (n === 0 && min === 0);
      if (k === 'tribute') return n >= 1 && n <= max && tributeValue() >= min;
      return n >= 1;
    };
    const confirmLabel = () => k === 'tribute' ? `Conferma (${tributeValue()}/${min})` : k === 'card' && min === max ? `Conferma (${chosen.length}/${min})` : `Conferma (${chosen.length})`;
    const confirmBtn = { label: confirmLabel(), kind: 'text.gold', onclick: c => {
      if (canConfirm()) { c(); send(response({ a: 0, idx: [...chosen] })); }
    } };
    let close;
    const redraw = () => {
      clear(holder);
      holder.appendChild(cardGrid(cards, new Set(chosen), { showValue: k !== 'card', order: chosen, onTap: i => {
        if (single) { close(); send(response({ a: 0, idx: [i] })); return; }
        const j = chosen.indexOf(i); if (j >= 0) chosen.splice(j, 1); else chosen.push(i);
        redraw();
        const b = document.querySelector('.overlay:last-child .modal-buttons button:last-child');
        if (b) { b.textContent = confirmLabel(); b.disabled = !canConfirm(); }
      } }));
    };
    redraw();
    const buttons = [];
    if (p.cancel) buttons.push({ label: 'Annulla', onclick: c => { c(); send(response({ a: -1 })); } });
    if (!single) buttons.push(confirmBtn);
    close = dlg(title, h('div.col', h('div.small', sub + (single ? '' : ' · tieni premuto per i dettagli')), holder), buttons, onMinimize);
    if (!single) { const b = document.querySelector('.overlay:last-child .modal-buttons button:last-child'); if (b) b.disabled = !canConfirm(); }
    return close;
  }
  if (k === 'unselect') {
    const cards = pcards(p, 'cards'), sel = pcards(p, 'sel');
    let close;
    const body = h('div.col',
      h('div.small', `Tocca una carta per sceglierla (min ${p.min}, max ${p.max})`),
      cardGrid(cards, new Set(), { onTap: i => { close(); send(response({ a: 1, b: i })); } }),
      sel.length ? [h('div.gold.small', 'Già scelte (tocca per togliere):'), cardGrid(sel, new Set(sel.map((_, i) => i)), { onTap: j => { close(); send(response({ a: 1, b: cards.length + j })); } })] : null);
    const buttons = p.finish ? [{ label: 'Fine', kind: 'text.gold', onclick: c => { c(); send(response({ a: -1 })); } }]
      : p.cancel ? [{ label: 'Annulla', onclick: c => { c(); send(response({ a: -1 })); } }] : [];
    close = dlg(hintText(p, 'Scegli le carte'), body, buttons, onMinimize);
    return close;
  }
  if (k === 'chain') {
    const cards = pcards(p, 'cards');
    const last = v.chain[v.chain.length - 1];
    let close;
    const body = h('div.col',
      last ? h('div.muted.small', `In risposta a «${cardName(last[0])}» (${last[1] === 0 ? 'tua' : "dell'avversario"})`) : null,
      cards.map((c, i) => {
        const d = descText(c.desc);
        const el = h('div.action', { onclick: () => { close(); send(response({ a: i })); } },
          cardImg(c.code, { cls: 'thumb' }),
          h('div.grow', h('div.ellipsis', cardName(c.code)), d ? h('div.gold.tiny.clamp3', d) : null, h('div.muted.tiny', whereLabel(c))));
        onLongPress(el, () => c.code && cardDetail(c.code));
        return el;
      }));
    close = dlg(p.forced ? 'Devi attivare un effetto' : 'Vuoi attivare una carta o un effetto?', body,
      p.forced ? [] : [{ label: 'No', kind: 'text.gold', onclick: c => { c(); send(response({ a: -1 })); } }], onMinimize);
    return close;
  }
  if (k === 'place') {
    const count = Math.max(1, p.count || 1);
    const zones = p.zones || [];
    const chosen = [];
    const sendZ = sel => send(response({ places: sel.flatMap(z => [z.pl, z.l, z.s]) }));
    let close;
    const box = h('div.col');
    const redraw = () => {
      clear(box);
      zones.forEach(z => {
        const on = chosen.includes(z);
        box.appendChild(h('button.outline.block' + (on ? '.on' : ''), { onclick: () => {
          if (count === 1) { close(); sendZ([z]); return; }
          const i = chosen.indexOf(z); if (i >= 0) chosen.splice(i, 1); else if (chosen.length < count) chosen.push(z);
          redraw();
        } }, zoneName(z.pl, z.l, z.s)));
      });
    };
    redraw();
    const buttons = [{ label: 'Automatica', onclick: c => { c(); sendZ(zones.slice(0, count)); } }];
    if (count > 1) buttons.push({ label: 'Conferma', kind: 'text.gold', onclick: c => { if (chosen.length === count) { c(); sendZ(chosen); } } });
    close = dlg(hintText(p, p.dis ? 'Scegli le zone da rendere inutilizzabili' : 'Scegli la zona'), box, buttons, onMinimize);
    return close;
  }
  if (k === 'position') {
    const code = p.c || 0;
    let close;
    const btns = [POS.FU_ATK, POS.FU_DEF, POS.FD_DEF, POS.FD_ATK].filter(x => p.pos & x)
      .map(x => h('button.primary.block', { onclick: () => { close(); send(response({ a: x })); } }, positionName(x)));
    close = dlg('Scegli la posizione', h('div.row', h('div.thumb-lg', { onclick: () => code && cardDetail(code) }, cardImg(code)), h('div.grow.col', h('b', cardName(code)), btns)), [], onMinimize);
    return close;
  }
  if (k === 'counter') {
    const cards = pcards(p, 'cards');
    const vals = cards.map(() => 0);
    const total = p.count;
    const box = h('div.col');
    const redraw = () => {
      clear(box);
      cards.forEach((c, i) => box.appendChild(h('div.row', h('span.grow.ellipsis', `${cardName(c.code)} (${c.param})`),
        h('button.text', { onclick: () => { if (vals[i] > 0) { vals[i]--; redraw(); } } }, '−'), h('b', String(vals[i])),
        h('button.text', { onclick: () => { if (vals[i] < c.param && vals.reduce((a, b) => a + b, 0) < total) { vals[i]++; redraw(); } } }, '+'))));
    };
    redraw();
    return dlg(`Rimuovi ${total} segnalini`, box, [{ label: 'Conferma', kind: 'text.gold', onclick: c => { if (vals.reduce((a, b) => a + b, 0) === total) { c(); send(response({ idx: vals })); } } }], onMinimize);
  }
  if (k === 'race' || k === 'attrib') {
    const isRace = k === 'race';
    const count = Math.max(1, p.count || 1);
    const avail = p.avail || 0;
    const opts = (isRace ? RACES : ATTRIBUTES).filter(([b]) => (avail & b) !== 0);
    const chosen = new Set();
    const box = h('div.chips.wrap');
    const redraw = () => { clear(box); opts.forEach(([b, l]) => box.appendChild(h('button.chip' + (chosen.has(b) ? '.on' : ''), { onclick: () => { if (chosen.has(b)) chosen.delete(b); else if (chosen.size < count) chosen.add(b); redraw(); } }, l))); };
    redraw();
    return dlg(isRace ? `Dichiara ${count} Tipo` : `Dichiara ${count} Attributo`, box,
      [{ label: 'Conferma', kind: 'text.gold', onclick: c => { if (chosen.size === count) { c(); send(response({ mask: [...chosen].reduce((a, b) => a | b, 0) })); } } }], onMinimize);
  }
  if (k === 'anncard') {
    const inp = h('input.field', { type: 'search', placeholder: 'Cerca per nome' });
    const res = h('div.col');
    let close;
    inp.oninput = () => { clear(res); if (inp.value.trim().length < 2) return; for (const c of search(inp.value, 30)) res.appendChild(h('button.menu-item', { onclick: () => { close(); send(response({ a: c.id })); } }, c.name)); };
    close = dlg('Dichiara il nome di una carta', h('div.col', inp, res, h('div.muted.tiny', "Se la carta non è valida per l'effetto, il gioco te la farà scegliere di nuovo.")), [], onMinimize);
    return close;
  }
  if (k === 'rps') {
    return dlg('Sasso, carta, forbici', h('p', 'Scegli la tua mano'), [1, 2, 3].map(x => ({ label: ['Sasso', 'Carta', 'Forbici'][x - 1], onclick: c => { c(); send(response({ a: x })); } })), onMinimize);
  }
  return dlg('Scelta non supportata', h('p', "Il motore ha chiesto una scelta che l'app non sa mostrare. Prova la scelta predefinita."),
    [{ label: 'Predefinita', onclick: c => { c(); send(response({ a: 0 })); } }], onMinimize);
}
