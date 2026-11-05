// Backup/ripristino e uso senza rete (service worker).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [url, ydkPath] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url);
  await page.waitForSelector('.home-btn');
  // crea un mazzo e modifica un mazzo avversario
  await page.evaluate(async (ydk) => {
    const { Store, parseYdk } = await import('./js/store.js');
    Store.upsert(parseYdk('Backup test', ydk));
    const b = Store.botDeck('acqua'); Store.saveBot('acqua', b.main.slice(1), b.extra);
  }, fs.readFileSync(ydkPath, 'utf8'));
  await page.reload(); await page.waitForSelector('.home-btn');
  await page.click('text=Backup e dati');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Salva backup')]);
  const file = await dl.path();
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('backup:', json.app, 'mazzi', json.decks.length, 'avversari modificati', Object.keys(json.botOverrides).length);
  // cancella tutto e ripristina
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForSelector('.home-btn');
  await page.click('text=Backup e dati');
  await page.setInputFiles('input[type=file]', file);
  await page.waitForSelector('.toast');
  console.log('ripristino:', await page.locator('.toast').textContent());
  // senza rete: ricarica e avvia un duello
  await page.waitForTimeout(1500); // il service worker salva i file
  await page.goto(url); await page.waitForSelector('.home-btn');
  await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  // primo duello online per salvare gli effetti delle carte
  const startDuel = async () => {
    await page.click('text=Gioca una partita di prova');
    await page.click('.row-card');
    await page.click('.row-card >> nth=1');
    await page.click('.row-card:has-text("Custode di Tombe")');
    await page.click('text=Inizio io');
    await page.waitForSelector('.board', { timeout: 60000 });
  };
  await startDuel();
  await ctx.setOffline(true);
  await page.goto(url).catch(() => {});
  await page.waitForSelector('.home-btn', { timeout: 30000 });
  await startDuel();
  console.log('senza rete: duello avviato, carte in campo:', await page.locator('.board .cell').count());
  console.log('errori:', errs.length ? errs : 'nessuno');
  await browser.close();
})();
