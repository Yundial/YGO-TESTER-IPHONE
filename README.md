# YGO Tester

App per provare i propri mazzi di Yu-Gi-Oh! contro un avversario virtuale:
- **Android**: APK compilato da GitHub Actions;
- **iPhone (e qualsiasi browser)**: web app pubblicata gratis su GitHub Pages, da aggiungere alla schermata Home.

- **Archivio mazzi**: crea, modifica, duplica, rinomina, elimina, importa/esporta liste `.ydk`.
- **Ricerca carte** in italiano per nome, per codice ID (le cifre in basso a sinistra) o per codice di stampa (es. `LOB-IT001`).
- **Duelli con le regole ufficiali**: usa il motore di EDOPro (`ocgcore`) con gli script di tutte le carte, quindi ogni effetto funziona davvero.
- **Avversario a 4 livelli** (Difficile e Incubo usano gli stessi mazzi), 8 mazzi per gruppo:
  - *Facile* – gioca per divertirsi: Acqua, Brancomalvagio, Gagaga, Rane, Classico anni 2000, Drago Cyber, Blackwing, Mago Nero
  - *Medio* – gioca per vincere ma con calma, ideale per provare i mazzi: Custode di Tombe, Fedele della Luce, Eroe Malvagio, Salamangreat, Swordsoul, Trickstar, Ryzeal, Orcust
  - *Difficile* – competitivo, nega spesso ma non calcola le sequenze; *Incubo* – simula più sequenze di gioco e nega appena può: Mayakashi, Drago Bianco Occhi Blu, Drago Nero Occhi Rossi, Rituale Luce e Oscurità, Elfnote Ars Magna, Radiant Typhoon, Despia Branded, @Ignister Maliss (liste dei top cut di fine 2026)
- **Mazzi dell'avversario modificabili**: prima del duello puoi vederli e cambiarli; la versione modificata resta salvata finché non la cambi o la ripristini.

- **Backup / Ripristino**: tutti i mazzi e le modifiche ai mazzi avversari in un file .json, valido sia per Android sia per la web app.

## Versione web (iPhone)

Il motore delle regole è lo stesso dell'app Android, compilato in WebAssembly (`app/src/main/cpp/web/wasm_api.cpp`)
e fatto girare in un Web Worker; l'interfaccia è in `web/` (HTML/CSS/JavaScript senza librerie).
Il job `web` del workflow compila il motore con Emscripten 3.1.50, prepara i dati
(`tools/build_web_data.py`: carte con testi italiani, codici di stampa, script degli effetti) e pubblica il sito.

Per attivarlo: nel repo **Settings → Pages → Source: GitHub Actions**. Il sito sarà su
`https://<utente>.github.io/<repo>/`.

## Compilare l'APK

Il workflow `.github/workflows/build.yml` compila tutto su GitHub Actions a ogni push:
1. crea un repository (anche privato) e carica questa cartella;
2. apri la scheda **Actions** → *Compila APK* → scarica l'artefatto **YGO-Tester-APK**;
3. installa l'APK sul telefono (consenti le app da origini sconosciute).

L'APK è firmato con la chiave in `keystore/` (sempre la stessa), così gli aggiornamenti si installano sopra la versione precedente.

Il secondo job del workflow (*motore*) compila il motore C++ su Linux e fa giocare tra loro i bot con tutti i mazzi dell'app per verificare che nulla si blocchi.

## Primo avvio

L'app scarica una volta sola (serve internet):
- il database delle regole di EDOPro (BabelCDB, ~8 MB);
- nomi e testi italiani da YGOPRODeck (~20 MB).

Gli script degli effetti si scaricano quando una carta entra in partita e restano salvati; le immagini vengono da YGOPRODeck e restano in cache.

## Struttura

```
app/src/main/cpp/
  third_party/ocgcore/   motore delle regole di EDOPro (AGPL-3.0) + Lua 5.4
  engine/                duello, lettura messaggi, bot a 4 livelli
  jni/                   ponte verso Kotlin
  test/duel_test.cpp     banco di prova da riga di comando (bot contro bot)
app/src/main/java/...    app Kotlin / Jetpack Compose
app/src/main/assets/     mazzi del bot, testi di sistema italiani di EDOPro
tools/                   script per generare i mazzi e provare il motore
```

## Licenze

Il motore `ocgcore` e gli script delle carte (Project Ignis) sono AGPL-3.0: questo progetto è per uso personale.
Yu-Gi-Oh! è un marchio di Konami; le immagini delle carte vengono da YGOPRODeck.
