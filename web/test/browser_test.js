// Prova completa nel browser con la vista di un iPhone: import mazzo, ricerca, filtri, duello fino alla fine.
// uso: node browser_test.js <url> <cartella screenshot> <file ydk> <difficoltà 0-3> [passi max]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [url, shots, ydkPath, diff, maxSteps = '1500'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/images\.ygoprodeck|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const shot = async n => page.screenshot({ path: `${shots}/${n}.png` });
  await page.goto(url);
  await page.waitForSelector('.home-btn', { timeout: 60000 });
  await shot('01_home');
  // import mazzo
  await page.click('text=I miei mazzi');
  await page.click('text=Importa .ydk');
  await page.fill('.modal input.field', 'Mazzo di prova');
  await page.fill('.modal textarea', fs.readFileSync(ydkPath, 'utf8'));
  await page.click('.modal-buttons >> text=Importa');
  await page.waitForSelector('.row-card');
  await shot('02_decks');
  // editor: ricerca per nome e filtri
  await page.click('.row-card');
  await page.fill('.search input.field', 'drago');
  await page.waitForTimeout(500);
  const n1 = await page.locator('.result').count();
  await shot('03_search');
  await page.click('text=Filtri per caratteristiche');
  await page.click('.filters button.chip:text-is("Mostri")');
  await page.click('.filters button.chip:text-is("Synchro")');
  await page.click('.filters button.chip:text-is("FUOCO")');
  await page.fill('.search input.field', '');
  await page.waitForTimeout(500);
  await shot('04_filters');
  const label = await page.locator('.search > .primary.block').textContent();
  await page.click('.search > .primary.block');
  const n2 = await page.locator('.result').count();
  console.log('ricerca "drago":', n1, 'risultati; Synchro FUOCO:', label, n2);
  await page.click('.tab >> nth=1');
  await shot('05_main');
  await page.goBack(); await page.goBack();
  await page.waitForSelector('.home-btn');
  // nuova partita
  await page.click('text=Gioca una partita di prova');
  await page.click('.row-card');
  await page.click(`.row-card >> nth=${diff}`);
  await shot('06_opponents');
  // vedi/modifica mazzo avversario e torna
  await page.click('button:has-text("Vedi") >> nth=0');
  await page.waitForSelector('.grid5');
  await shot('07_bot_deck');
  await page.goBack();
  await page.waitForSelector('.row-card:has-text("Casuale")');
  await page.click('.row-card:has-text("Casuale")');
  await page.click('text=Inizio io');
  await page.waitForSelector('.board', { timeout: 120000 });
  await shot('08_duel_start');
  // gioca
  const rnd = (n) => Math.floor(Math.random() * n);
  let step = 0, end = null, shotDone = { prompt: false, mid: false };
  while (step++ < Number(maxSteps)) {
    await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 180000 });
    await page.waitForTimeout(60);
    const titles = page.locator('.modal h2');
    const title = (await titles.count()) ? await titles.last().textContent() : null;
    if (title && /Hai vinto|Hai perso|Pareggio/.test(title)) { end = title; break; }
    if (title) {
      if (!shotDone.prompt && !/Cosa vuoi fare/.test(title)) { await shot('09_prompt'); shotDone.prompt = true; }
      const m = page.locator('.overlay').last();
      const cells = m.locator('.pcell'), acts = m.locator('.action'), outl = m.locator('.modal-body button.outline, .modal-body button.primary'), chips = m.locator('.chip'), menu = m.locator('.menu-item');
      if (await acts.count()) { await acts.nth(rnd(await acts.count())).click(); continue; }
      if (await outl.count()) { await outl.nth(0).click(); continue; }
      if (await cells.count()) {
        const btns = m.locator('.modal-buttons button');
        const names = await btns.allTextContents();
        const ci = names.findIndex(t => t.startsWith('Conferma'));
        if (ci < 0) { await cells.nth(0).click(); continue; }
        // seleziona carte finché la conferma viene accettata
        const total = await cells.count();
        for (let i = 0; i < total; i++) {
          await cells.nth(i).click();
          if (await btns.nth(ci).isDisabled()) continue;
          await btns.nth(ci).click();
          await page.waitForTimeout(30);
          if (!(await m.isVisible().catch(() => false))) break;
        }
        if (await m.isVisible().catch(() => false)) { const all = await btns.allTextContents(); const ai = all.findIndex(t => t.startsWith('Annulla')); if (ai >= 0) await btns.nth(ai).click(); }
        continue;
      }
      if (await chips.count()) { await chips.nth(0).click(); const b = m.locator('.modal-buttons button'); await b.nth(await b.count() - 1).click(); continue; }
      if (await menu.count()) { await menu.nth(0).click(); continue; }
      const b = m.locator('.modal-buttons button');
      const texts = await b.allTextContents();
      const pref = ['Sì', 'No', 'Automatica', 'Conferma', 'Fine', 'Predefinita', 'Sasso', 'Annulla'];
      const idx = pref.map(p => texts.findIndex(t => t.startsWith(p))).find(i => i >= 0);
      if (idx != null) { await b.nth(idx).click(); continue; }
      console.log('finestra sconosciuta', title, texts); await b.last().click(); continue;
    }
    if (!(await page.locator('.board').count())) { await page.waitForTimeout(200); continue; }
    const bar = page.locator('.actionbar button');
    const names = await bar.allTextContents();
    if (!names.length) { await page.waitForTimeout(200); continue; }
    if (!shotDone.mid && step > 30) { await shot('10_duel_mid'); shotDone.mid = true; }
    const pick = t => names.findIndex(x => x.startsWith(t));
    const actI = names.findIndex(x => /^(Azioni|Attiva) \((\d+)\)/.test(x) && !x.includes('(0)'));
    if (pick('Passa') >= 0) { if (actI >= 0 && Math.random() < 0.3) await bar.nth(actI).click(); else await bar.nth(pick('Passa')).click(); continue; }
    if (actI >= 0 && Math.random() < 0.7) { await bar.nth(actI).click(); continue; }
    const order = ['Battle', 'Main 2', 'Fine turno'];
    const oi = order.map(pick).find(i => i >= 0);
    if (oi != null) { await bar.nth(oi).click(); continue; }
    if (pick('Torna alla scelta') >= 0) { await bar.nth(pick('Torna alla scelta')).click(); continue; }
  }
  await shot('11_end');
  const logLines = await page.locator('.log div').count();
  console.log('FINE:', end || 'non finita', '| passi', step, '| righe registro', logLines);
  console.log('errori:', errors.length ? errors.slice(0, 10) : 'nessuno');
  await browser.close();
  process.exit(end && !errors.length ? 0 : 1);
})();
