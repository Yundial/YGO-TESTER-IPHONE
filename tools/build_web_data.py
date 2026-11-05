#!/usr/bin/env python3
"""Prepara i dati statici della web app (eseguito da GitHub Actions).

Uso:
  build_web_data.py --out DIR --cdb cards.cdb [release-x.cdb ...] --scripts CardScripts
                    [--it it.json] [--en en.json] --assets app/src/main/assets

Produce in DIR:
  data/cards.bin     dati di gioco per il motore (stesso formato dell'app Android)
  data/cards.json    nomi/testi (italiano se disponibile) e caratteristiche per ricerca e filtri
  data/sets.json     codice di stampa (inglese) -> id carta
  data/strings.json  testi di sistema di EDOPro (italiano, con l'inglese come riserva)
  data/bot_decks.json
  scripts/*.lua      script degli effetti (versione fissata)
"""
import argparse, json, os, shutil, sqlite3, struct, sys

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--cdb", nargs="+", required=True)
ap.add_argument("--scripts", required=True)
ap.add_argument("--it")
ap.add_argument("--en")
ap.add_argument("--assets", required=True)
a = ap.parse_args()

data_dir = os.path.join(a.out, "data")
os.makedirs(data_dir, exist_ok=True)

# ---- carte (i database successivi aggiornano i precedenti)
datas, texts = {}, {}
for path in a.cdb:
    c = sqlite3.connect(path)
    for r in c.execute("select id, alias, setcode, type, level, attribute, race, atk, def, category from datas"):
        datas[r[0]] = [x or 0 for x in r]
    for r in c.execute("select * from texts"):
        texts[r[0]] = r
print("carte nel database:", len(datas))

with open(os.path.join(data_dir, "cards.bin"), "wb") as f:
    f.write(b"YGTC" + struct.pack("<II", 1, len(datas)))
    for r in datas.values():
        cid, alias, setcode, typ, level, attr, race, atk, dfn, cat = r
        f.write(struct.pack("<IIQIIIQiiQ", cid & 0xffffffff, alias & 0xffffffff, setcode & 0xffffffffffffffff,
                            typ & 0xffffffff, level & 0xffffffff, attr & 0xffffffff, race & 0xffffffffffffffff,
                            atk, dfn, cat & 0xffffffffffffffff))

# ---- testi italiani (YGOPRODeck)
it_name, it_desc = {}, {}
if a.it:
    for card in json.load(open(a.it, encoding="utf-8"))["data"]:
        ids = [card["id"]] + [img["id"] for img in card.get("card_images", [])]
        for i in ids:
            it_name.setdefault(i, card["name"])
            it_desc.setdefault(i, card.get("desc", ""))
    print("carte con testo italiano:", len(it_name))
    if len(it_name) < 5000:
        sys.exit("Troppe poche carte italiane: il download da YGOPRODeck non è andato a buon fine")

sets = {}
if a.en:
    for card in json.load(open(a.en, encoding="utf-8"))["data"]:
        for s in card.get("card_sets", []) or []:
            code = (s.get("set_code") or "").upper().replace(" ", "")
            if code: sets.setdefault(code, card["id"])
    print("codici di stampa:", len(sets))

rows = []
for cid, r in datas.items():
    t = texts.get(cid)
    if not t: continue
    _, alias, _, typ, level, attr, race, atk, dfn, _ = r
    name_en, desc_en = t[1] or "", t[2] or ""
    strs = [s or "" for s in t[3:19]]
    while strs and not strs[-1]: strs.pop()
    name = it_name.get(cid) or (it_name.get(alias) if alias else None) or name_en
    desc = it_desc.get(cid) or (it_desc.get(alias) if alias else None) or desc_en
    row = [cid, alias, typ, atk, dfn, level, race, attr, name, name_en if name_en != name else 0, desc]
    if strs: row.append(strs)
    rows.append(row)
json.dump({"v": 1, "cards": rows}, open(os.path.join(data_dir, "cards.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
json.dump(sets, open(os.path.join(data_dir, "sets.json"), "w"), separators=(",", ":"))

# ---- testi di sistema
strings = {}
for fn in ("strings_en.conf", "strings_it.conf"):
    for line in open(os.path.join(a.assets, fn), encoding="utf-8"):
        if line.startswith("!system "):
            rest = line[8:].rstrip("\n")
            num, _, text = rest.partition(" ")
            if num.isdigit(): strings[num] = text
json.dump(strings, open(os.path.join(data_dir, "strings.json"), "w", encoding="utf-8"), ensure_ascii=False)
shutil.copy(os.path.join(a.assets, "bot_decks.json"), os.path.join(data_dir, "bot_decks.json"))

# ---- script degli effetti
sdir = os.path.join(a.out, "scripts")
os.makedirs(sdir, exist_ok=True)
n = 0
for fn in os.listdir(a.scripts):
    if fn.endswith(".lua"):
        shutil.copy(os.path.join(a.scripts, fn), sdir); n += 1
for sub in ("official", "pre-errata"):
    d = os.path.join(a.scripts, sub)
    for fn in os.listdir(d):
        if fn.endswith(".lua") and not os.path.exists(os.path.join(sdir, fn)):
            shutil.copy(os.path.join(d, fn), sdir); n += 1
print("script copiati:", n)
