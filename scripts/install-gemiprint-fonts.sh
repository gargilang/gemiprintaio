#!/usr/bin/env bash
# Pasang font branding Gemiprint ke profil pengguna (Linux).
# Font asli ada di public/assets/fonts — dipakai web app & cetak browser.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT_SRC="$ROOT/public/assets/fonts"
FONT_DEST="${HOME}/.local/share/fonts/gemiprint"

if [[ ! -d "$FONT_SRC" ]]; then
  echo "Folder font tidak ditemukan: $FONT_SRC" >&2
  exit 1
fi

mkdir -p "$FONT_DEST"

install -m 0644 \
  "$FONT_SRC/BAUHS93.ttf" \
  "$FONT_SRC/Bauhaus 93 Regular.ttf" \
  "$FONT_SRC/Tw Cen MT.ttf" \
  "$FONT_SRC/TwCenMTStdBold.otf" \
  "$FONT_DEST/"

if command -v fc-cache >/dev/null 2>&1; then
  fc-cache -fv "$FONT_DEST" >/dev/null
  echo "Font Gemiprint terpasang di $FONT_DEST (fc-cache diperbarui)."
else
  echo "Font disalin ke $FONT_DEST. Jalankan: fc-cache -fv ~/.local/share/fonts"
fi
