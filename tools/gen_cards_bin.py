#!/usr/bin/env python3
"""Genera cards.bin (formato letto dal motore) da un database .cdb di EDOPro.
Stesso formato prodotto dall'app Android (CardRepository.writeEngineBin).
uso: gen_cards_bin.py cards.cdb [release-xxx.cdb ...] cards.bin  (i database successivi aggiornano i precedenti)"""
import sqlite3, struct, sys
*srcs, dst = sys.argv[1:]
byid = {}
for src in srcs:
    c = sqlite3.connect(src)
    for r in c.execute("select id, alias, setcode, type, level, attribute, race, atk, def, category from datas"):
        byid[r[0]] = r
rows = list(byid.values())
with open(dst, "wb") as f:
    f.write(b"YGTC" + struct.pack("<II", 1, len(rows)))
    for r in rows:
        cid, alias, setcode, typ, level, attr, race, atk, dfn, cat = [x or 0 for x in r]
        f.write(struct.pack("<IIQIIIQiiQ", cid & 0xffffffff, alias & 0xffffffff, setcode & 0xffffffffffffffff,
                            typ & 0xffffffff, level & 0xffffffff, attr & 0xffffffff, race & 0xffffffffffffffff,
                            atk, dfn, cat & 0xffffffffffffffff))
print(len(rows), "carte")
