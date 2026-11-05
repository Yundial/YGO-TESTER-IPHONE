#!/usr/bin/env python3
"""Costruisce app/src/main/assets/bot_decks.json dai nomi delle carte (database EDOPro)."""
import json, os, sqlite3, sys
CDB = sys.argv[1]; WINDBOT = sys.argv[2]; SCRIPTS = sys.argv[3]; OUT = sys.argv[4]
c = sqlite3.connect(CDB)
byname = {}
for cid, name, typ, alias in c.execute("select t.id, t.name, d.type, d.alias from texts t join datas d on d.id=t.id order by d.alias != 0"):
    byname.setdefault(name.lower(), (cid, typ))
EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000

def ydk(fn):
    main, extra, sec = [], [], 'main'
    for l in open(os.path.join(WINDBOT, fn), encoding='utf8'):
        l = l.strip()
        if l.startswith('#main'): sec = 'main'
        elif l.startswith('#extra'): sec = 'extra'
        elif l.startswith('!side'): sec = 'side'
        elif l.isdigit():
            if sec == 'main': main.append(int(l))
            elif sec == 'extra': extra.append(int(l))
    return main, extra

def build(spec):
    main, extra, missing = [], [], []
    for name, n in spec:
        r = byname.get(name.lower())
        if not r: missing.append(name); continue
        cid, typ = r
        (extra if typ & EXTRA else main).extend([cid] * n)
    return main, extra, missing

def ids(main_list, extra_list):
    """Liste per codice (passcode), come esportate da YGOPRODeck"""
    main, extra, missing = [], [], []
    for lst, out in ((main_list, main), (extra_list, extra)):
        for cid, n in lst:
            if not c.execute("select 1 from datas where id=?", (cid,)).fetchone(): missing.append(cid); continue
            out.extend([cid] * n)
    return main, extra, missing

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meta_lists import META

D = {}
D['acqua'] = ("Acqua", 0, "Mostri ACQUA e Oceano Leggendario: picchia duro, poche sorprese", build([
    ("Atlantean Marksman", 3), ("Atlantean Heavy Infantry", 3), ("Atlantean Dragoons", 3), ("Atlantean Attack Squad", 2),
    ("Atlantean Pikeman", 2), ("Poseidra, the Atlantean Dragon", 2), ("Deep Sea Diva", 3), ("Spined Gillman", 2),
    ("Fishborg Blaster", 2), ("A Legendary Ocean", 2), ("Salvage", 2), ("Monster Reborn", 1),
    ("Mystical Space Typhoon", 2), ("Moray of Greed", 2), ("Terraforming", 1), ("Mirror Force", 1),
    ("Sakuretsu Armor", 3), ("Call of the Haunted", 1), ("Torrential Tribute", 1), ("Dimensional Prison", 2),
    ("Bahamut Shark", 1), ("Number 101: Silent Honor ARK", 1), ("Brionac, Dragon of the Ice Barrier", 1),
    ("Abyss Dweller", 1), ("Number 17: Leviathan Dragon", 1), ("Daigusto Emeral", 1), ("Toadally Awesome", 1),
    ("Number 39: Utopia", 1), ("Castel, the Skyblaster Musketeer", 1)]))
m, e = ydk('AI_Evilswarm.ydk')
D['brancomalvagio'] = ("Brancomalvagio", 0, "Evilswarm: Xyz di Rango 4 e trappole di negazione", (m, e, []))
D['gagaga'] = ("Gagaga", 0, "Gagaga: Evocazioni Xyz rapide di Rango 4", build([
    ("Gagaga Magician", 3), ("Gagaga Girl", 2), ("Gagaga Gardna", 2), ("Gagaga Mancer", 2), ("Gagaga Child", 2),
    ("Gagaga Head", 2), ("Gagaga Clerk", 2), ("Gagaga Sister", 1), ("Gagaga Ganbara Knight", 1), ("Gagaga Caesar", 1), ("Goblindbergh", 2),
    ("Zubaba Knight", 2), ("Gagagabolt", 2), ("Gagaga Academy Emergency Network", 1), ("Onomatopia", 1),
    ("Gagagadraw", 2), ("Reinforcement of the Army", 1), ("Mystical Space Typhoon", 1), ("Gagagarush", 1),
    ("Gagagashield", 1), ("Gagagaback", 1), ("Gagagarevenge", 2), ("Gagagaguard", 1), ("Torrential Tribute", 1),
    ("Mirror Force", 1), ("Sakuretsu Armor", 2),
    ("Number 39: Utopia", 1), ("Gagagaga Magician", 1), ("Gagagaga Girl", 1), ("Gagaga Cowboy", 1), ("Gagaga Samurai", 1),
    ("Number 17: Leviathan Dragon", 1), ("Daigusto Emeral", 1), ("Number C39: Utopia Ray", 1), ("Abyss Dweller", 1),
    ("Castel, the Skyblaster Musketeer", 1), ("Number S39: Utopia the Lightning", 1)]))
m, e = ydk('AI_Gravekeeper.ydk')
D['custode'] = ("Custode di Tombe", 1, "Gravekeeper's con la Valle Necro: blocca il Cimitero", (m, e, []))
m, e = ydk('AI_Lightsworn.ydk')
D['luce'] = ("Fedele della Luce", 1, "Lightsworn: macina il Deck e chiude col Drago del Giudizio", (m, e, []))
D['eroe'] = ("Eroe Malvagio", 1, "Evil HERO: Fusioni Oscure aggressive", build([
    ("Evil HERO Malicious Edge", 3), ("Evil HERO Infernal Gainer", 2), ("Evil HERO Infernal Prodigy", 2),
    ("Evil HERO Adusted Gold", 3), ("Evil HERO Sinister Necrom", 2), ("Evil HERO Infernal Rider", 1),
    ("Evil HERO Vicious Claws", 2), ("Elemental HERO Shadow Mist", 2), ("Elemental HERO Stratos", 1),
    ("Vision HERO Vyon", 1), ("Elemental HERO Bubbleman", 1), ("Elemental HERO Sparkman", 1), ("Dark Fusion", 3), ("Dark Calling", 2),
    ("Polymerization", 1), ("E - Emergency Call", 2), ("Reinforcement of the Army", 1), ("Fusion Destiny", 1),
    ("Evil Mind", 1), ("Dark Calling", 0), ("Supreme King's Castle", 1), ("Pot of Desires", 1), ("Evil HERO Dead-End Prison", 1),
    ("Solemn Judgment", 1), ("Mirror Force", 1), ("Solemn Strike", 1), ("Hero Signal", 1),
    ("Torrential Tribute", 1), ("Infinite Impermanence", 1),
    ("Evil HERO Dark Gaia", 1), ("Evil HERO Inferno Wing", 1), ("Evil HERO Lightning Golem", 1),
    ("Evil HERO Malicious Bane", 2), ("Evil HERO Malicious Fiend", 1), ("Evil HERO Wild Cyclone", 1),
    ("Evil HERO Infernal Sniper", 1), ("Evil HERO Darkest Knight", 1), ("Evil HERO Neos Lord", 1),
    ("Evil HERO Inferno Wing - Backfire", 1), ("Xtra HERO Cross Crusader", 1), ("Xtra HERO Wonder Driver", 1),
    ("Xtra HERO Dread Decimator", 1)]))
D['mayakashi'] = ("Mayakashi", 2, "Mayakashi + Shiranui: Synchro Zombie che tornano dal Cimitero", build([
    ("Yuki-Musume, the Ice Mayakashi", 3), ("Yasha, the Skeletal Mayakashi", 2), ("Shafu, the Wheeled Mayakashi", 2),
    ("Hajun, the Winged Mayakashi", 1), ("Dakki, the Graceful Mayakashi", 1), ("Tsukahagi, the Poisonous Mayakashi", 2),
    ("Shiranui Solitaire", 3), ("Shiranui Spectralsword", 1), ("Shiranui Squire", 1), ("Uni-Zombie", 2),
    ("Glow-Up Bloom", 1), ("Ash Blossom & Joyous Spring", 3), ("Mayakashi Return", 1), ("Mayakashi Winter", 1),
    ("Ghost Meets Girl - A Mayakashi's Manuscript", 1), ("Book of Life", 1), ("Foolish Burial", 1),
    ("Called by the Grave", 2), ("Pot of Desires", 1), ("Shiranui Style Synthesis", 1), ("Mayakashi Metamorphosis", 1),
    ("Mayakashi Mayhem", 1), ("Ghost Belle & Haunted Mansion", 1), ("Infinite Impermanence", 3), ("Solemn Strike", 1), ("Torrential Tribute", 1),
    ("Evenly Matched", 1),
    ("Gashadokuro, the Skeletal Mayakashi", 1), ("Tsuchigumo, the Poisonous Mayakashi", 1),
    ("Oboro-Guruma, the Wheeled Mayakashi", 1), ("Yoko, the Graceful Mayakashi", 1), ("Tengu, the Winged Mayakashi", 1),
    ("Yuki-Onna, the Absolute Zero Mayakashi", 1), ("Yuki-Onna, the Icicle Mayakashi", 1), ("Yuki-Onna, the Ice Mayakashi", 1),
    ("Shiranui Sunsaga", 1), ("Shiranui Shogunsaga", 1), ("Shiranui Samuraisaga", 1), ("Shiranui Squiresaga", 1),
    ("Shiranui Swordsaga", 1), ("Shiranui Skillsaga Supremacy", 1)]))
m, e = ydk('AI_BlueEyes.ydk')
D['occhiblu'] = ("Drago Bianco (Occhi Blu)", 2, "Drago Bianco Occhi Blu: mostri giganti e Rango 8", (m, e, []))
D['occhirossi'] = ("Drago Nero (Occhi Rossi)", 2, "Drago Nero Occhi Rossi: Fusioni e Dragoon", build([
    ("Red-Eyes Black Dragon", 3), ("Red-Eyes Darkness Metal Dragon", 2), ("Red-Eyes Wyvern", 1), ("Red-Eyes Retro Dragon", 1),
    ("Red-Eyes Black Meteor Dragon", 1), ("Red-Eyes Archfiend of Lightning", 1), ("Red-Eyes Baby Dragon", 1),
    ("Red-Eyes Black Fullmetal Dragon", 1), ("Red-Eyes Alternative Black Dragon", 2), ("Red-Eyes Black Flare Dragon", 1),
    ("Black Metal Dragon", 2), ("Ash Blossom & Joyous Spring", 3), ("Effect Veiler", 1),
    ("Red-Eyes Fusion", 2), ("Red-Eyes Insight", 2), ("Return of the Red-Eyes", 1), ("Cards of the Red Stone", 2),
    ("Dragon Shrine", 2), ("Harpie's Feather Duster", 1), ("Monster Reborn", 1), ("Called by the Grave", 1),
    ("Red-Eyes Spirit", 1), ("Red-Eyes Burn", 1), ("Infinite Impermanence", 3), ("Solemn Strike", 1),
    ("Torrential Tribute", 1), ("Mirror Force", 1),
    ("Red-Eyes Slash Dragon", 1), ("Red-Eyes Dark Dragoon", 2), ("Red-Eyes Flare Metal Dragon", 1),
    ("Red-Eyes Black Dragon Sword", 1), ("Meteor Black Comet Dragon", 1), ("Black Skull Dragon", 1),
    ("Red-Eyes Zombie Dragon Lord", 1), ("Number 11: Big Eye", 1), ("Dark Rebellion Xyz Dragon", 1),
    ("Red-Eyes Zombie Necro Dragon", 1), ("Meteor Black Dragon", 1), ("Black Dragon Collapserpent", 0)]))

# ---- Facile: aggiunte da edizioni passate (liste di WindBot)
for key, fn, name, desc in [
    ("rane", "AI_Frog.ydk", "Rane", "Frog: rane che si scambiano dal Deck e Gravity Bind, un classico anni 2000"),
    ("classico", "AI_OldSchool.ydk", "Classico anni 2000", "Mazzo vecchia scuola: mostri forti e magie storiche"),
    ("cyber", "AI_CyberDragon.ydk", "Drago Cyber", "Cyber Dragon: Fusioni Macchina e Drago Cyber Finale"),
    ("blackwing", "AI_Blackwing.ydk", "Blackwing (Alanera)", "Blackwing: Synchro rapidi con le ali nere"),
    ("magonero", "AI_DarkMagician.ydk", "Mago Nero", "Dark Magician: il mago leggendario e le sue magie"),
]:
    m, e = ydk(fn); D[key] = (name, 0, desc, (m, e, []))
# ---- Medio: mazzi competitivi delle stagioni passate (liste di WindBot)
for key, fn, name, desc in [
    ("salamangreat", "AI_Salamangreat.ydk", "Salamangreat", "Salamangreat: Link di FUOCO che si reincarnano"),
    ("swordsoul", "AI_Swordsoul.ydk", "Swordsoul", "Swordsoul: Synchro Wyrm con i Token Spadanima"),
    ("trickstar", "AI_Trickstar.ydk", "Trickstar", "Trickstar: Fate che bruciano gli LP a ogni carta aggiunta"),
    ("ryzeal", "AI_Ryzeal.ydk", "Ryzeal", "Ryzeal: Xyz di Rango 4 del meta 2025"),
    ("orcust", "AI_Orcust.ydk", "Orcust", "Orcust: Link e combo dal Cimitero"),
]:
    m, e = ydk(fn); D[key] = (name, 1, desc, (m, e, []))
# ---- Difficile: meta attuale (top cut YCS / WCQ, ottobre-novembre 2026)
for key, (name, desc, main_l, extra_l) in META.items():
    D[key] = (name, 2, desc, ids(main_l, extra_l))
m, e = ydk('AI_Maliss.ydk')
D['maliss'] = ("@Ignister Maliss", 2, "Maliss: Link che bandiscono e tornano, meta 2025-2026", (m, e, []))

out = []
ok = True
for key, (name, lvl, desc, (main, extra, missing)) in D.items():
    def script_id(i):
        a = c.execute("select alias from datas where id=?", (i,)).fetchone()[0]
        return a if a and abs(a - i) < 10 else i
    noscript = [i for i in set(main + extra)
                if not any(os.path.exists(os.path.join(SCRIPTS, d, f"c{script_id(i)}.lua")) for d in ("official", "pre-errata"))
                and not (c.execute("select type from datas where id=?", (i,)).fetchone()[0] & 0x10)]
    print(f"{key:15} {name:28} main {len(main):2} extra {len(extra):2} mancanti {missing} senza script {noscript}")
    if missing or not (40 <= len(main) <= 60) or len(extra) > 15 or noscript: ok = False
    out.append({"id": key, "name": name, "level": lvl, "desc": desc, "main": main, "extra": extra[:15]})
json.dump(out, open(OUT, "w"), indent=1)
print("OK" if ok else "CONTROLLARE")
