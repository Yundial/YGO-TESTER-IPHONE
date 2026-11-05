#!/usr/bin/env bash
# Unisce interfaccia web, motore WebAssembly e dati in un'unica cartella pronta per GitHub Pages.
# uso: assemble_site.sh <cartella motore (ygt.js/ygt.wasm)> <cartella dati (data/, scripts/)> <uscita> [versione]
set -euo pipefail
ENGINE=$1; DATA=$2; OUT=$3; VER=${4:-$(date +%Y%m%d%H%M)}
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r web/index.html web/style.css web/manifest.webmanifest web/sw.js web/worker.js web/icon-*.png web/js "$OUT"/
cp "$ENGINE"/ygt.js "$ENGINE"/ygt.wasm "$OUT"/
cp -r "$DATA"/data "$DATA"/scripts "$OUT"/
echo "{\"v\":\"$VER\"}" > "$OUT"/data/version.json
# i nomi dei file dell'app nel service worker cambiano a ogni versione, così l'aggiornamento arriva subito
sed -i "s/ygt-app-v1/ygt-app-$VER/; s/ygt-data-v1/ygt-data-$VER/" "$OUT"/sw.js
touch "$OUT"/.nojekyll
echo "sito pronto in $OUT"
