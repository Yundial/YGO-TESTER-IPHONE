// Archivio mazzi, editor (ricerca + filtri), mazzi dell'avversario, backup.
import { DB, T, card, cardName, playableCode, search, searchFiltered, searchSetCode, emptyFilter, filterCount, filterActive,
  typeLine, statLine, ATTRIBUTES, RACES } from './data.js';
import { Store, parseYdk, toYdk, deckProblems } from './store.js';
import { h, clear, go, back, modal, toast, confirmBox, cardImg, cardDetail, topBar, download, rerender } from './ui_core.js';

const coverOf = ids => ids.find(id => card(id)?.isMonster) || ids[0] || 0;

// ------------------------------------------------------------------ archivio
export function DecksScreen() {
  return {
    render() {
      const list = h('div.list');
      const fill = () => {
        clear(list);
        if (!Store.decks.length) list.appendChild(h('p.muted.pad', 'Nessun mazzo in archivio. Creane uno con il tasto in basso oppure importa una lista .ydk.'));
        for (const d of Store.decks) {
          const probs = deckProblems(d);
          list.appendChild(h('div.row-card', { onclick: () => go(EditorScreen(d.id)) },
            cardImg(coverOf(d.main), { cls: 'thumb' }),
            h('div.grow',
              h('div.title', d.name),
              h('div.muted.small', `Main ${d.main.length} · Extra ${d.extra.length}`),
              probs.length ? h('div.warn.small.ellipsis', '⚠ ' + probs[0]) : null),
            h('button.icon', { onclick: e => { e.stopPropagation(); deckMenu(d, fill); }, 'aria-label': 'Opzioni' }, '⋮')));
        }
      };
      fill();
      const el = h('div.screen',
        topBar('I miei mazzi', back, h('button.text', { onclick: () => importDialog(fill) }, 'Importa .ydk')),
        list,
        h('button.fab', { onclick: () => { const d = Store.create(); go(EditorScreen(d.id)); } }, '+ Nuovo mazzo'));
      return { el };
    },
  };
}

function deckMenu(d, refresh) {
  let close = () => {};
  close = modal({ title: d.name, body: h('div.menu',
    h('button.menu-item', { onclick: () => { close(); go(EditorScreen(d.id)); } }, 'Modifica'),
    h('button.menu-item', { onclick: () => { close(); Store.duplicate(d.id); toast(`Creata una copia di «${d.name}»`); refresh(); } }, 'Duplica'),
    h('button.menu-item', { onclick: () => { close(); renameDialog(d, refresh); } }, 'Rinomina'),
    h('button.menu-item', { onclick: async () => { close(); try { await navigator.clipboard.writeText(toYdk(d)); toast('Lista copiata negli appunti'); } catch (_) { download(d.name + '.ydk', toYdk(d), 'text/plain'); } } }, 'Copia lista (.ydk)'),
    h('button.menu-item', { onclick: () => { close(); download(d.name.replace(/[^\w\- ]+/g, '_') + '.ydk', toYdk(d), 'text/plain'); } }, 'Esporta file .ydk'),
    h('button.menu-item.danger', { onclick: () => { close(); confirmBox(`Eliminare «${d.name}»?`, "Il mazzo verrà cancellato dall'archivio.", 'Elimina', () => { Store.remove(d.id); refresh(); }); } }, 'Elimina')),
    buttons: [{ label: 'Chiudi', onclick: c => c() }] });
}

function renameDialog(d, refresh) {
  const inp = h('input.field', { value: d.name, maxlength: 60 });
  modal({ title: 'Rinomina mazzo', body: inp, buttons: [
    { label: 'Annulla', onclick: c => c() },
    { label: 'Salva', onclick: c => { d.name = inp.value.trim() || d.name; Store.upsert(d); c(); refresh(); } },
  ] });
  setTimeout(() => inp.focus(), 50);
}

function importDialog(refresh) {
  const name = h('input.field', { value: 'Mazzo importato' });
  const text = h('textarea.field', { rows: 8, placeholder: 'Incolla qui il contenuto del file .ydk' });
  const file = h('input', { type: 'file', accept: '.ydk,.txt,text/plain', onchange: async () => {
    const f = file.files[0]; if (!f) return;
    text.value = await f.text();
    name.value = f.name.replace(/\.ydk$/i, '');
  } });
  const err = h('div.warn.small');
  modal({ title: 'Importa lista .ydk', body: h('div.col', h('label.small', 'Nome del mazzo'), name, h('label.small', 'Scegli un file .ydk…'), file, h('label.small', '…oppure incolla il testo'), text, err),
    buttons: [
      { label: 'Annulla', onclick: c => c() },
      { label: 'Importa', onclick: c => {
        const d = parseYdk(name.value.trim() || 'Mazzo importato', text.value);
        if (!d) { err.textContent = 'Nessuna carta trovata nel testo.'; return; }
        Store.upsert(d); c(); toast(`Importato «${d.name}»`); refresh();
      } },
    ] });
}

// ------------------------------------------------------------------ editor
const sortCards = ids => [...ids].sort((a, b) => {
  const ca = card(a), cb = card(b);
  const g = c => !c ? 3 : c.isMonster ? 0 : c.isSpell ? 1 : 2;
  return g(ca) - g(cb) || (cb?.level || 0) - (ca?.level || 0) || cardName(a).localeCompare(cardName(b));
});

export function EditorScreen(deckId) {
  return {
    render() {
      const d = Store.get(deckId);
      if (!d) { setTimeout(back, 0); return { el: h('div') }; }
      return deckEditor({ deck: d, title: 'Modifica mazzo', nameEditable: true, onSave: x => Store.upsert(x) });
    },
  };
}

export function BotEditorScreen(botId) {
  return {
    render() {
      const b = Store.botDeck(botId);
      if (!b) { setTimeout(back, 0); return { el: h('div') }; }
      const deck = { id: 'bot:' + botId, name: b.name, main: [...b.main], extra: [...b.extra] };
      const header = () => h('p.muted.small.pad-x',
        (Store.isBotModified(botId) ? '✎ Versione modificata da te. ' : 'Versione originale. ') +
        'Le modifiche si salvano subito e valgono per tutti i prossimi duelli contro questo mazzo.');
      return deckEditor({
        deck, title: 'Mazzo avversario: ' + b.name, nameEditable: false, startTab: 1, header,
        onSave: x => Store.saveBot(botId, x.main, x.extra),
        actions: () => Store.isBotModified(botId) ? h('button.text', { onclick: () => confirmBox('Ripristinare il mazzo originale?', `Le tue modifiche a «${b.name}» andranno perse.`, 'Ripristina', () => { Store.resetBot(botId); rerender(); }) }, 'Ripristina') : null,
      });
    },
  };
}

function deckEditor({ deck, title, nameEditable, onSave, header = null, actions = null, startTab = 0 }) {
  let tab = startTab;
  const state = { mode: 'name', query: '', filter: emptyFilter(), showFilters: false, results: [] };
  const msg = h('div.gold.small.pad-x');
  const status = h('div.small.pad-x');
  const tabs = h('div.tabs');
  const content = h('div.tab-content');
  const headerBox = h('div');
  const actionBox = h('div.actions');

  const copies = id => { const base = card(id)?.baseId ?? id; return [...deck.main, ...deck.extra].filter(x => (card(x)?.baseId ?? x) === base).length; };
  function save() { onSave(deck); refreshHead(); }
  function add(c) {
    const id = playableCode(c.id);
    if (copies(id) >= 3) msg.textContent = `Hai già 3 copie di «${c.name}».`;
    else if (c.isExtra && deck.extra.length >= 15) msg.textContent = "L'Extra Deck è pieno (15).";
    else if (!c.isExtra && deck.main.length >= 60) msg.textContent = 'Il Main Deck è pieno (60).';
    else if (c.isExtra) { deck.extra.push(id); msg.textContent = `Aggiunta all'Extra: ${c.name}`; save(); }
    else { deck.main.push(id); msg.textContent = `Aggiunta al Main: ${c.name}`; save(); }
  }
  function removeOne(id) {
    const fromExtra = card(id)?.isExtra || (deck.extra.includes(id) && !deck.main.includes(id));
    const l = fromExtra ? deck.extra : deck.main;
    const i = l.indexOf(id); if (i >= 0) l.splice(i, 1);
    msg.textContent = `Tolta: ${cardName(id)}`;
    save();
  }
  function detail(id) {
    const c = card(id);
    const btns = [];
    if (deck.main.includes(id) || deck.extra.includes(id)) btns.push({ label: 'Togli 1', onclick: cl => { removeOne(id); cl(); if (tab) drawTab(); } });
    if (c && !c.isToken) btns.push({ label: `Aggiungi 1 (${copies(id)})`, onclick: cl => { add(c); cl(); if (tab) drawTab(); else drawResults(); } });
    cardDetail(id, btns);
  }
  function refreshHead() {
    const probs = deckProblems(deck);
    status.textContent = probs.length ? '⚠ ' + probs.join(' ') : '✓ Mazzo valido';
    status.className = 'small pad-x ' + (probs.length ? 'warn' : 'ok');
    clear(tabs);
    [['Cerca carte', 0], [`Main (${deck.main.length})`, 1], [`Extra (${deck.extra.length})`, 2]].forEach(([l, i]) =>
      tabs.appendChild(h('button.tab' + (tab === i ? '.on' : ''), { onclick: () => { tab = i; refreshHead(); drawTab(); } }, l)));
    clear(headerBox); if (header) headerBox.appendChild(header());
    clear(actionBox); const a = actions?.(); if (a) actionBox.appendChild(a);
  }

  // ---- ricerca
  const resultsBox = h('div.results');
  const note = h('div.muted.small.pad');
  const filtersBox = h('div.filters');
  const filterToggle = h('button.text');
  const resetBtn = h('button.text.danger', 'Azzera');
  const showBtn = h('button.primary.block');
  let timer = null;
  function runSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      note.textContent = '';
      const useFilters = state.mode === 'name' && filterActive(state.filter);
      if (state.mode === 'set') return;
      if (!useFilters && state.query.trim().length < 2) { state.results = []; drawResults(); return; }
      state.results = useFilters ? searchFiltered(state.filter, state.query) : search(state.query);
      if (!state.results.length) note.textContent = 'Nessun risultato.';
      drawResults();
    }, 200);
  }
  function runSetSearch() {
    state.results = searchSetCode(state.query);
    note.textContent = state.results.length ? '' : `Nessuna carta trovata per «${state.query}».`;
    drawResults();
  }
  function drawResults() {
    clear(resultsBox);
    showBtn.textContent = `Mostra ${state.results.length}${state.results.length >= 300 ? '+' : ''} risultati`;
    for (const c of state.results) {
      const n = copies(c.id);
      resultsBox.appendChild(h('div.result', { onclick: () => detail(c.id) },
        cardImg(c.id, { cls: 'thumb' }),
        h('div.grow',
          h('div.ellipsis', c.name),
          h('div.muted.tiny.ellipsis', typeLine(c)),
          statLine(c) ? h('div.muted.tiny', statLine(c)) : null),
        n ? h('span.gold', '×' + n) : null,
        h('button.icon.add', { onclick: e => { e.stopPropagation(); add(c); drawResults(); }, 'aria-label': 'Aggiungi' }, '+')));
    }
  }
  function drawFilters() {
    filterToggle.textContent = (state.showFilters ? '▲ ' : '▼ ') + 'Filtri per caratteristiche' + (filterCount(state.filter) ? ` (${filterCount(state.filter)})` : '');
    resetBtn.style.display = filterActive(state.filter) ? '' : 'none';
    clear(filtersBox);
    filtersBox.style.display = state.showFilters ? '' : 'none';
    showBtn.style.display = state.showFilters ? '' : 'none';
    if (!state.showFilters) return;
    filtersBox.appendChild(filterPanel(state.filter, f => { state.filter = f; drawFilters(); runSearch(); }));
  }
  filterToggle.onclick = () => { state.showFilters = !state.showFilters; drawFilters(); };
  resetBtn.onclick = () => { state.filter = emptyFilter(); drawFilters(); runSearch(); };
  showBtn.onclick = () => { state.showFilters = false; drawFilters(); };

  const qInput = h('input.field', { type: 'search', enterkeyhint: 'search', autocomplete: 'off',
    oninput: e => { state.query = e.target.value; runSearch(); },
    onkeydown: e => { if (e.key === 'Enter') { e.target.blur(); if (state.mode === 'set') runSetSearch(); else { state.showFilters = false; drawFilters(); } } } });
  const modeRow = h('div.chips');
  const setBtn = h('button.primary', { onclick: runSetSearch }, 'Cerca');
  const filterRow = h('div.row.between', filterToggle, resetBtn);
  function drawModes() {
    clear(modeRow);
    [['name', 'Nome'], ['id', 'Codice ID'], ['set', 'Codice stampa']].forEach(([m, l]) =>
      modeRow.appendChild(h('button.chip' + (state.mode === m ? '.on' : ''), { onclick: () => { state.mode = m; state.results = []; drawModes(); drawResults(); runSearch(); } }, l)));
    qInput.placeholder = { name: 'Nome della carta (anche solo una parte)', id: 'Numero in basso a sinistra (es. 89631139)', set: 'Codice di stampa (es. LOB-IT001)' }[state.mode];
    qInput.inputMode = state.mode === 'id' ? 'numeric' : 'text';
    setBtn.style.display = state.mode === 'set' ? '' : 'none';
    filterRow.style.display = state.mode === 'name' ? '' : 'none';
    if (state.mode !== 'name') { state.showFilters = false; }
    drawFilters();
  }
  const searchPanel = h('div.search',
    modeRow, h('div.row', qInput, setBtn), filterRow, filtersBox, showBtn, note, resultsBox);

  function drawTab() {
    clear(content);
    if (tab === 0) { content.appendChild(searchPanel); return; }
    const ids = sortCards(tab === 1 ? deck.main : deck.extra);
    if (!ids.length) { content.appendChild(h('p.muted.pad', 'Vuoto. Aggiungi carte dalla scheda «Cerca carte».')); return; }
    const grid = h('div.grid5');
    for (const id of ids) grid.appendChild(h('div.grid-cell', { onclick: () => detail(id) }, cardImg(id)));
    content.appendChild(grid);
  }

  const nameInput = nameEditable ? h('input.field.pad-m', { value: deck.name, maxlength: 60, oninput: e => { deck.name = e.target.value; save(); } }) : null;
  drawModes(); refreshHead(); drawTab();
  const el = h('div.screen', topBar(title, back, actionBox), nameInput, headerBox, status, tabs, msg, content);
  return { el };
}

function filterPanel(f, onChange) {
  const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  const group = (title, opts, isOn, onTog) => h('div.fgroup', h('div.gold.small', title),
    h('div.chips.scroll', opts.map(([v, l]) => h('button.chip' + (isOn(v) ? '.on' : ''), { onclick: () => onTog(v) }, l))));
  const out = [];
  out.push(group('Carta', [[1, 'Mostri'], [2, 'Magie'], [3, 'Trappole']], k => k === f.kind, k => onChange(f.kind === k ? emptyFilter() : { ...emptyFilter(), kind: k })));
  if (f.kind === 0) out.push(h('p.muted.small', 'Scegli Mostri, Magie o Trappole per vedere i filtri specifici.'));
  if (f.kind === 1) {
    out.push(h('p.muted.tiny', 'Nei gruppi «Tipo» e «Abilità» devono valere tutte le scelte (es. Synchro + Tuner); negli altri basta una.'));
    out.push(group('Tipo', [[T.NORMAL, 'Normale'], [T.EFFECT, 'Effetto'], [T.RITUAL, 'Rituale'], [T.FUSION, 'Fusione'], [T.SYNCHRO, 'Synchro'], [T.XYZ, 'Xyz'], [T.PENDULUM, 'Pendulum'], [T.LINK, 'Link']],
      v => f.frames.includes(v), v => onChange({ ...f, frames: toggle(f.frames, v) })));
    out.push(group('Abilità', [[T.TUNER, 'Tuner'], [T.FLIP, 'Scoperta'], [T.TOON, 'Toon'], [T.SPIRIT, 'Spirit'], [T.UNION, 'Union'], [T.GEMINI, 'Gemello']],
      v => f.frames.includes(v), v => onChange({ ...f, frames: toggle(f.frames, v) })));
    out.push(group('Attributo', ATTRIBUTES, v => (f.attributes & v) !== 0, v => onChange({ ...f, attributes: f.attributes ^ v })));
    out.push(group('Tipo di mostro', RACES, v => (f.races & v) !== 0, v => onChange({ ...f, races: f.races ^ v })));
    out.push(group('Livello / Rango / Link', Array.from({ length: 13 }, (_, i) => [i + 1, String(i + 1)]), v => f.levels.includes(v), v => onChange({ ...f, levels: toggle(f.levels, v) })));
    const num = (label, key) => h('label.numbox', h('span.tiny', label), h('input.field', { inputmode: 'numeric', value: f[key] ?? '',
      onchange: e => { const v = e.target.value.replace(/\D/g, '').slice(0, 5); onChange({ ...f, [key]: v === '' ? null : Number(v) }); } }));
    out.push(h('div.row4', num('ATK min', 'atkMin'), num('ATK max', 'atkMax'), num('DEF min', 'defMin'), num('DEF max', 'defMax')));
  }
  if (f.kind === 2) out.push(group('Tipo di Magia', [[0, 'Normale'], [T.QUICKPLAY, 'Rapida'], [T.CONTINUOUS, 'Continua'], [T.EQUIP, 'Equipaggiamento'], [T.FIELD, 'Terreno'], [T.RITUAL, 'Rituale']],
    v => f.spellKinds.includes(v), v => onChange({ ...f, spellKinds: toggle(f.spellKinds, v) })));
  if (f.kind === 3) out.push(group('Tipo di Trappola', [[0, 'Normale'], [T.CONTINUOUS, 'Continua'], [T.COUNTER, 'Contro-Trappola']],
    v => f.trapKinds.includes(v), v => onChange({ ...f, trapKinds: toggle(f.trapKinds, v) })));
  return h('div', out);
}

// ------------------------------------------------------------------ backup
export function BackupScreen() {
  return {
    render() {
      const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async () => {
        const f = fileIn.files[0]; if (!f) return;
        try {
          const r = Store.restore(await f.text());
          toast(`Ripristinati ${r.decks} mazzi` + (r.bots ? ` e ${r.bots} mazzi avversari modificati` : ''));
          rerender();
        } catch (e) { modal({ title: 'Ripristino non riuscito', body: h('p', e.message), buttons: [{ label: 'OK', onclick: c => c() }] }); }
        fileIn.value = '';
      } });
      const date = new Date().toISOString().slice(0, 10);
      const el = h('div.screen', topBar('Backup e dati', back),
        h('div.pad.col',
          h('p', `Hai ${Store.decks.length} mazzi e ${Object.keys(Store.botMods).length} mazzi avversari modificati.`),
          h('p.muted.small', "Il backup salva tutto in un file .json che puoi tenere in File/iCloud, mandarti per messaggio o aprire con l'app Android (I miei mazzi → Ripristina)."),
          h('button.primary.block', { onclick: () => download(`ygotester-backup-${date}.json`, Store.backupJson()) }, 'Salva backup'),
          h('button.outline.block', { onclick: () => fileIn.click() }, 'Ripristina da file'),
          fileIn,
          h('p.muted.small', 'Il ripristino aggiunge i mazzi del file: quelli già presenti con lo stesso nome interno vengono aggiornati, gli altri restano.'),
          h('hr'),
          h('p.muted.small', `Dati delle carte: ${DB.list.length} carte` + (DB.version ? ` (versione ${DB.version})` : '') + '. Si aggiornano da soli a ogni nuova pubblicazione del sito.')));
      return { el };
    },
  };
}

export { coverOf };
