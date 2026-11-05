// Interfaccia del motore per la versione web (WebAssembly, eseguita in un Web Worker).
// Gli script delle carte si chiedono a JavaScript in modo sincrono (XHR sincrono nel worker).
#include <emscripten.h>
#include <cstdlib>
#include <memory>
#include <string>
#include "../engine/duel_host.h"

using namespace ygt;

// Chiede a JavaScript il testo di uno script (stringa allocata con malloc, oppure 0)
EM_JS(char*, js_load_script, (const char* name), {
	var text = Module.loadScript ? Module.loadScript(UTF8ToString(name)) : null;
	if(!text) return 0;
	return stringToNewUTF8(text);
});

namespace {
CardDB* gDb = nullptr;
std::string gOut;
std::string gError;

struct Session {
	std::unique_ptr<DuelHost> host;
};

std::vector<uint32_t> toVec(const uint32_t* p, int n) {
	return std::vector<uint32_t>(p, p + (n > 0 ? n : 0));
}

const char* out(std::string s) {
	gOut = std::move(s);
	return gOut.c_str();
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int ygt_load_cards(const uint8_t* data, int len) {
	auto* db = new CardDB();
	if(!db->loadFromMemory(data, (size_t)len)) { delete db; return 0; }
	delete gDb;
	gDb = db;
	return 1;
}

EMSCRIPTEN_KEEPALIVE Session* ygt_create(const uint32_t* hMain, int nhm, const uint32_t* hExtra, int nhe,
                                         const uint32_t* bMain, int nbm, const uint32_t* bExtra, int nbe,
                                         int difficulty, int humanFirst, uint32_t seedLo, uint32_t seedHi) {
	if(!gDb) { gError = "Database delle carte non caricato"; return nullptr; }
	ScriptLoader loader = [](const std::string& name) {
		char* t = js_load_script(name.c_str());
		if(!t) return std::string();
		std::string s(t);
		free(t);
		return s;
	};
	auto* s = new Session();
	s->host = std::make_unique<DuelHost>(*gDb, loader);
	Deck h{toVec(hMain, nhm), toVec(hExtra, nhe)};
	Deck b{toVec(bMain, nbm), toVec(bExtra, nbe)};
	uint64_t seed = ((uint64_t)seedHi << 32) | seedLo;
	std::string err;
	if(!s->host->start(h, b, difficulty, humanFirst != 0, seed, err)) {
		gError = err;
		delete s;
		return nullptr;
	}
	return s;
}

// Solo per le prove: il lato del giocatore viene giocato da un bot
EMSCRIPTEN_KEEPALIVE void ygt_set_auto_human(Session* s, int difficulty, uint32_t seed) {
	if(s) s->host->setAutoHuman(difficulty, seed);
}

EMSCRIPTEN_KEEPALIVE const char* ygt_last_error() { return gError.c_str(); }
EMSCRIPTEN_KEEPALIVE const char* ygt_advance(Session* s) { return out(s ? s->host->advance() : "{}"); }
EMSCRIPTEN_KEEPALIVE const char* ygt_respond(Session* s, const char* json) { return out(s ? s->host->respond(json ? json : "") : "{}"); }
EMSCRIPTEN_KEEPALIVE const char* ygt_surrender(Session* s) { return out(s ? s->host->surrender() : "{}"); }
EMSCRIPTEN_KEEPALIVE void ygt_destroy(Session* s) { delete s; }

}
