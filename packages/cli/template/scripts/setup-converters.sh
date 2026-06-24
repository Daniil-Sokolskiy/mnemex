#!/usr/bin/env bash
# setup-converters.sh — install everything ingest-book.sh needs.
#
# Required:
#   pandoc           — base converter (always)
#
# Optional but recommended:
#   calibre          — MOBI / AZW3 / FB2 / DJVU → EPUB
#   ocrmypdf         — OCR for scanned PDFs (with Russian+English)
#   marker-pdf       — Python ML tool, much better for complex PDFs
#                      (tables, formulas, two-column scientific)

set -euo pipefail

log() { printf '==> %s\n' "$*"; }
ok()  { printf '   ✓ %s\n' "$*"; }
warn(){ printf '   ! %s\n' "$*"; }

# ---- 0. brew ----
if ! command -v brew >/dev/null 2>&1; then
  echo "ERROR: Homebrew required. Install from https://brew.sh"
  exit 1
fi

# ---- 1. pandoc (required) ----
log "pandoc"
if command -v pandoc >/dev/null 2>&1; then
  ok "already installed: $(pandoc --version | head -1)"
else
  brew install pandoc
  ok "installed"
fi

# ---- 2. calibre (MOBI / AZW3 / FB2 / DJVU) ----
log "calibre (for MOBI / AZW3 / FB2 / DJVU)"
if command -v ebook-convert >/dev/null 2>&1; then
  ok "already installed"
else
  brew install --cask calibre
  # calibre installs to /Applications/calibre.app — symlink CLI
  if [ -d "/Applications/calibre.app/Contents/MacOS" ] && ! command -v ebook-convert >/dev/null 2>&1; then
    sudo ln -sf /Applications/calibre.app/Contents/MacOS/ebook-convert /usr/local/bin/ebook-convert 2>/dev/null \
      || ln -sf /Applications/calibre.app/Contents/MacOS/ebook-convert /opt/homebrew/bin/ebook-convert 2>/dev/null \
      || warn "could not symlink ebook-convert — add /Applications/calibre.app/Contents/MacOS to PATH manually"
  fi
  ok "installed"
fi

# ---- 3. ocrmypdf (scanned PDF) ----
log "ocrmypdf (for scanned PDFs)"
if command -v ocrmypdf >/dev/null 2>&1; then
  ok "already installed"
else
  brew install ocrmypdf
  # Russian language pack for tesseract
  brew install tesseract-lang 2>/dev/null || true
  ok "installed (with Russian + English language packs)"
fi

# ---- 4. pdftotext + pdfinfo (for scan-detection in ingest-book.sh) ----
log "poppler (pdftotext / pdfinfo)"
if command -v pdftotext >/dev/null 2>&1; then
  ok "already installed"
else
  brew install poppler
  ok "installed"
fi

# ---- 5. marker (optional, Python ML, best PDF quality) ----
log "marker-pdf (optional — best for complex PDFs)"
if command -v marker_single >/dev/null 2>&1; then
  ok "already installed: $(marker_single --version 2>&1 | head -1 || echo present)"
else
  cat <<EOF
   ! marker not installed. It's heavy (~5 GB of ML models) but gives
     dramatically better results for academic / two-column / table-heavy PDFs.

     To install (optional, takes 5–10 min and disk space):
       pip3 install marker-pdf --break-system-packages

     Or in a virtualenv:
       python3 -m venv ~/.venvs/marker
       source ~/.venvs/marker/bin/activate
       pip install marker-pdf

     After install, use:  ingest-book.sh <book.pdf> <slug> --marker
EOF
fi

# ---- summary ----
echo
log "Status check"
for tool in pandoc ebook-convert ocrmypdf pdftotext marker_single; do
  if command -v "$tool" >/dev/null 2>&1; then
    ok "$tool"
  else
    warn "$tool — NOT installed"
  fi
done

echo
log "Ready. Try:"
echo "   ./scripts/ingest-book.sh ~/Downloads/some-book.epub slug-name"
