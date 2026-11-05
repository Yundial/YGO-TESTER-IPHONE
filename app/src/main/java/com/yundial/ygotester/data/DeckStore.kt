package com.yundial.ygotester.data

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

data class Deck(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val main: List<Int> = emptyList(),
    val extra: List<Int> = emptyList(),
    val updated: Long = System.currentTimeMillis(),
)

/** Mazzo dell'avversario virtuale (assets/bot_decks.json) */
data class BotDeck(val id: String, val name: String, val level: Int, val desc: String, val main: List<Int>, val extra: List<Int>)

/** Archivio dei mazzi salvato in un file JSON nella memoria dell'app. */
object DeckStore {
    private lateinit var file: File
    private lateinit var botFile: File
    val decks = mutableStateListOf<Deck>()
    val botDecks = ArrayList<BotDeck>()
    /** Modifiche dell'utente ai mazzi dell'avversario (id mazzo -> main, extra) */
    private val botOverrides = androidx.compose.runtime.mutableStateMapOf<String, Pair<List<Int>, List<Int>>>()

    fun init(ctx: Context) {
        file = File(ctx.filesDir, "decks.json")
        botFile = File(ctx.filesDir, "bot_decks_mod.json")
        load()
        loadBotOverrides()
        try {
            val arr = JSONArray(ctx.assets.open("bot_decks.json").bufferedReader().readText())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                botDecks.add(BotDeck(o.getString("id"), o.getString("name"), o.getInt("level"), o.getString("desc"),
                    ints(o.getJSONArray("main")), ints(o.getJSONArray("extra"))))
            }
        } catch (_: Exception) {}
    }

    private fun ints(a: JSONArray) = List(a.length()) { a.getInt(it) }

    private fun load() {
        decks.clear()
        if (!file.exists()) return
        try {
            val arr = JSONArray(file.readText())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                decks.add(Deck(o.getString("id"), o.getString("name"), ints(o.getJSONArray("main")),
                    ints(o.getJSONArray("extra")), o.optLong("updated")))
            }
        } catch (_: Exception) {}
    }

    private fun save() {
        val arr = JSONArray()
        for (d in decks) {
            arr.put(JSONObject().apply {
                put("id", d.id); put("name", d.name); put("updated", d.updated)
                put("main", JSONArray(d.main)); put("extra", JSONArray(d.extra))
            })
        }
        val tmp = File(file.parentFile, "decks.json.tmp")
        tmp.writeText(arr.toString())
        tmp.renameTo(file)
    }

    private fun loadBotOverrides() {
        botOverrides.clear()
        if (!botFile.exists()) return
        try {
            val o = JSONObject(botFile.readText())
            for (k in o.keys()) {
                val d = o.getJSONObject(k)
                botOverrides[k] = ints(d.getJSONArray("main")) to ints(d.getJSONArray("extra"))
            }
        } catch (_: Exception) {}
    }

    private fun saveBotOverrides() {
        val o = JSONObject()
        for ((k, v) in botOverrides) o.put(k, JSONObject().put("main", JSONArray(v.first)).put("extra", JSONArray(v.second)))
        val tmp = File(botFile.parentFile, "bot_decks_mod.json.tmp")
        tmp.writeText(o.toString())
        tmp.renameTo(botFile)
    }

    /** Mazzo dell'avversario così come verrà usato: la versione modificata, se c'è */
    fun botDeck(id: String): BotDeck? {
        val b = botDecks.firstOrNull { it.id == id } ?: return null
        val o = botOverrides[id] ?: return b
        return b.copy(main = o.first, extra = o.second)
    }

    fun isBotModified(id: String) = botOverrides.containsKey(id)

    fun saveBotOverride(id: String, main: List<Int>, extra: List<Int>) {
        val orig = botDecks.firstOrNull { it.id == id } ?: return
        if (orig.main.sorted() == main.sorted() && orig.extra.sorted() == extra.sorted()) botOverrides.remove(id)
        else botOverrides[id] = main to extra
        saveBotOverrides()
    }

    fun resetBot(id: String) {
        botOverrides.remove(id)
        saveBotOverrides()
    }

    fun get(id: String) = decks.firstOrNull { it.id == id }

    fun upsert(d: Deck) {
        val nd = d.copy(updated = System.currentTimeMillis())
        val i = decks.indexOfFirst { it.id == d.id }
        if (i >= 0) decks[i] = nd else decks.add(0, nd)
        save()
    }

    fun delete(id: String) {
        decks.removeAll { it.id == id }
        save()
    }

    fun duplicate(id: String): Deck? {
        val d = get(id) ?: return null
        val copy = d.copy(id = UUID.randomUUID().toString(), name = d.name + " (copia)", updated = System.currentTimeMillis())
        decks.add(0, copy)
        save()
        return copy
    }

    // ---- backup (stesso formato della versione web)
    fun backupJson(): String {
        val o = JSONObject()
        o.put("app", "ygotester"); o.put("version", 1)
        o.put("created", java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).format(java.util.Date()))
        val arr = JSONArray()
        for (d in decks) arr.put(JSONObject().apply {
            put("id", d.id); put("name", d.name); put("updated", d.updated)
            put("main", JSONArray(d.main)); put("extra", JSONArray(d.extra))
        })
        o.put("decks", arr)
        val bots = JSONObject()
        for ((k, v) in botOverrides) bots.put(k, JSONObject().put("main", JSONArray(v.first)).put("extra", JSONArray(v.second)))
        o.put("botOverrides", bots)
        return o.toString(1)
    }

    /** Ripristina un backup: i mazzi con lo stesso id vengono sostituiti, gli altri restano. Ritorna (mazzi, mazzi avversari) */
    fun restore(text: String): Pair<Int, Int> {
        val o = try { JSONObject(text) } catch (e: Exception) { throw IllegalArgumentException("Il file non è un backup valido.") }
        if (o.optString("app") != "ygotester" || !o.has("decks")) throw IllegalArgumentException("Il file non è un backup di YGO Tester.")
        val arr = o.getJSONArray("decks")
        var n = 0
        for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i) ?: continue
            if (!d.has("id") || !d.has("main")) continue
            val deck = Deck(d.getString("id"), d.optString("name", "Mazzo"), ints(d.getJSONArray("main")),
                d.optJSONArray("extra")?.let { ints(it) } ?: emptyList(), d.optLong("updated", System.currentTimeMillis()))
            val idx = decks.indexOfFirst { it.id == deck.id }
            if (idx >= 0) decks[idx] = deck else decks.add(deck)
            n++
        }
        save()
        var b = 0
        o.optJSONObject("botOverrides")?.let { bo ->
            for (k in bo.keys()) {
                val v = bo.optJSONObject(k) ?: continue
                botOverrides[k] = ints(v.getJSONArray("main")) to (v.optJSONArray("extra")?.let { ints(it) } ?: emptyList())
                b++
            }
            saveBotOverrides()
        }
        return n to b
    }

    /** Importa una lista in formato .ydk (EDOPro / YGOPRODeck) */
    fun parseYdk(name: String, text: String): Deck? {
        val main = ArrayList<Int>(); val extra = ArrayList<Int>()
        var sec = 0
        for (raw in text.lines()) {
            val l = raw.trim()
            when {
                l.startsWith("#main") -> sec = 0
                l.startsWith("#extra") -> sec = 1
                l.startsWith("!side") -> sec = 2
                l.isNotEmpty() && l.all { it.isDigit() } -> {
                    val id = CardRepository.playableCode(l.toInt())
                    when (sec) { 0 -> main.add(id); 1 -> extra.add(id) }
                }
            }
        }
        if (main.isEmpty() && extra.isEmpty()) return null
        return Deck(name = name, main = main, extra = extra)
    }

    fun toYdk(d: Deck): String = buildString {
        append("#created by YGO Tester\n#main\n")
        d.main.forEach { append(it).append('\n') }
        append("#extra\n")
        d.extra.forEach { append(it).append('\n') }
        append("!side\n")
    }

    /** Problemi del mazzo per il regolamento base (40-60 Main, max 15 Extra, max 3 copie) */
    fun problems(d: Deck): List<String> {
        val out = ArrayList<String>()
        if (d.main.size < 40) out.add("Il Main Deck ha ${d.main.size} carte: ne servono almeno 40.")
        if (d.main.size > 60) out.add("Il Main Deck ha ${d.main.size} carte: massimo 60.")
        if (d.extra.size > 15) out.add("L'Extra Deck ha ${d.extra.size} carte: massimo 15.")
        val counts = HashMap<Int, Int>()
        for (id in d.main + d.extra) {
            val base = CardRepository.get(id)?.baseId ?: id
            counts[base] = (counts[base] ?: 0) + 1
        }
        for ((id, n) in counts) if (n > 3) out.add("«${CardRepository.name(id)}» compare $n volte (massimo 3).")
        return out
    }
}
