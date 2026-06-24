#!/usr/bin/env bash
# ingest-book.sh — universal book → markdown converter for brain/raw/books/
#
# Supported input formats (auto-detected):
#   .epub                 → pandoc                        ⭐⭐⭐⭐⭐
#   .pdf (text layer)     → pandoc (or marker if --marker)⭐⭐⭐⭐
#   .pdf (scanned)        → ocrmypdf → pandoc/marker      ⭐⭐⭐
#   .mobi, .azw3, .azw    → calibre → epub → pandoc       ⭐⭐⭐⭐
#   .fb2, .fb2.zip        → calibre → epub → pandoc       ⭐⭐⭐⭐
#   .djvu                 → calibre → pdf → pandoc        ⭐⭐⭐
#
# Usage:
#   ingest-book.sh <file> <slug> [options]
#
# Options:
#   --marker   Force marker (Python ML) for PDF — better tables/formulas.
#   --ocr      Force OCR pass on PDF (use if you know it's scanned).
#   --keep     Don't clean up intermediate files.
#
# Output: brain/raw/books/<slug>/{book.md, meta.yaml, images/}
#
# Install converters first: ./scripts/setup-converters.sh

set -euo pipefail

# ---- args ----
if [ "$#" -lt 2 ]; then
  sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

SRC="$1"
SLUG="$2"
shift 2

USE_MARKER=0
FORCE_OCR=0
KEEP_INTERMEDIATE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --marker) USE_MARKER=1 ;;
    --ocr)    FORCE_OCR=1 ;;
    --keep)   KEEP_INTERMEDIATE=1 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

WIKI_ROOT="${WIKI_ROOT:-${BRAIN_DIR:-$HOME/mnemex}}"
OUT_DIR="$WIKI_ROOT/raw/books/$SLUG"
TMP_DIR="$OUT_DIR/.tmp"

if [ ! -f "$SRC" ]; then
  echo "ERROR: $SRC not found"
  exit 1
fi

mkdir -p "$OUT_DIR" "$TMP_DIR"

# ---- helpers ----
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: $1 not installed. Run scripts/setup-converters.sh"
    exit 1
  fi
}

log() { printf '==> %s\n' "$*"; }

# Convert EPUB (or anything pandoc-compatible) → markdown with image extraction
epub_to_md() {
  local epub="$1"
  log "Converting EPUB → markdown via pandoc"
  pandoc "$epub" \
    --from=epub --to=markdown \
    --extract-media="$OUT_DIR/images" \
    --wrap=none \
    -o "$OUT_DIR/book.md"
}

# Convert text PDF → markdown via pandoc
pdf_to_md_pandoc() {
  local pdf="$1"
  log "Converting PDF → markdown via pandoc"
  pandoc "$pdf" --to=markdown --wrap=none -o "$OUT_DIR/book.md"
}

# Convert PDF → markdown via marker (Python ML, best quality)
pdf_to_md_marker() {
  local pdf="$1"
  log "Converting PDF → markdown via marker (slow, high quality)"
  need marker_single
  marker_single "$pdf" "$TMP_DIR" --output_format markdown
  # marker creates a subdirectory matching the input filename
  local marker_md
  marker_md="$(find "$TMP_DIR" -name '*.md' | head -1)"
  if [ -z "$marker_md" ]; then
    echo "ERROR: marker produced no output"; exit 1
  fi
  cp "$marker_md" "$OUT_DIR/book.md"
  # Move images alongside if any
  local marker_dir
  marker_dir="$(dirname "$marker_md")"
  if find "$marker_dir" -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' 2>/dev/null | grep -q .; then
    mkdir -p "$OUT_DIR/images"
    find "$marker_dir" \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) -exec cp {} "$OUT_DIR/images/" \;
  fi
}

# Convert MOBI/AZW3/AZW/FB2/DJVU → EPUB via calibre, then pandoc
calibre_to_epub_to_md() {
  local src="$1"
  need ebook-convert
  log "Converting $src → EPUB via calibre"
  ebook-convert "$src" "$TMP_DIR/intermediate.epub" >/dev/null 2>&1
  epub_to_md "$TMP_DIR/intermediate.epub"
}

# Detect if PDF is scanned (almost no extractable text)
is_pdf_scanned() {
  local pdf="$1"
  if ! command -v pdftotext >/dev/null 2>&1; then return 1; fi
  local pages text_chars
  pages="$(pdfinfo "$pdf" 2>/dev/null | awk '/^Pages:/ {print $2; exit}')"
  text_chars="$(pdftotext "$pdf" - 2>/dev/null | wc -c | tr -d ' ')"
  [ -z "$pages" ] && pages=1
  [ -z "$text_chars" ] && text_chars=0
  # Less than 100 chars per page → almost certainly scanned
  [ "$((text_chars / pages))" -lt 100 ]
}

ocr_pdf() {
  local in_pdf="$1"
  local out_pdf="$TMP_DIR/ocr.pdf"
  need ocrmypdf
  log "Running OCR via ocrmypdf (Russian + English)"
  # -l rus+eng — auto-detect both. Skip pages already with text.
  ocrmypdf -l rus+eng --skip-text "$in_pdf" "$out_pdf" >/dev/null 2>&1 || \
    ocrmypdf -l rus+eng --force-ocr "$in_pdf" "$out_pdf"
  echo "$out_pdf"
}

# ---- main ----
need pandoc

EXT="${SRC##*.}"
EXT_LOWER="$(echo "$EXT" | tr '[:upper:]' '[:lower:]')"

case "$EXT_LOWER" in
  epub)
    epub_to_md "$SRC"
    ;;

  pdf)
    PDF_TO_USE="$SRC"
    if [ "$FORCE_OCR" -eq 1 ] || is_pdf_scanned "$SRC"; then
      log "Scanned PDF detected (or --ocr forced)"
      PDF_TO_USE="$(ocr_pdf "$SRC")"
    fi
    if [ "$USE_MARKER" -eq 1 ]; then
      pdf_to_md_marker "$PDF_TO_USE"
    else
      pdf_to_md_pandoc "$PDF_TO_USE"
    fi
    ;;

  mobi|azw3|azw|fb2|djvu)
    calibre_to_epub_to_md "$SRC"
    ;;

  zip)
    # FB2.zip pattern
    if [[ "$SRC" == *.fb2.zip ]]; then
      calibre_to_epub_to_md "$SRC"
    else
      echo "ERROR: unsupported .zip (expected .fb2.zip)"; exit 1
    fi
    ;;

  *)
    echo "ERROR: unsupported extension .$EXT"
    echo "Supported: epub, pdf, mobi, azw3, azw, fb2, djvu"
    exit 1
    ;;
esac

# ---- meta.yaml stub ----
cat > "$OUT_DIR/meta.yaml" <<EOF
slug: $SLUG
source_file: $(basename "$SRC")
source_format: $EXT_LOWER
converter: $([ "$USE_MARKER" -eq 1 ] && echo "marker" || echo "pandoc")
ingested_at_md: $(date +%Y-%m-%d)
title: ""
author: []
year:
isbn: ""
language: ""
pages:
llm_ingested: false
EOF

# ---- cleanup ----
if [ "$KEEP_INTERMEDIATE" -eq 0 ]; then
  rm -rf "$TMP_DIR"
fi

# ---- summary ----
LINES="$(wc -l < "$OUT_DIR/book.md" | tr -d ' ')"
WORDS="$(wc -w < "$OUT_DIR/book.md" | tr -d ' ')"
SIZE="$(du -h "$OUT_DIR/book.md" | awk '{print $1}')"
IMGCOUNT=0
if [ -d "$OUT_DIR/images" ]; then
  IMGCOUNT="$(find "$OUT_DIR/images" -type f | wc -l | tr -d ' ')"
fi

cat <<EOF

==> Done.
    output:  $OUT_DIR/book.md
    size:    $SIZE ($LINES lines, $WORDS words)
    images:  $IMGCOUNT
    meta:    $OUT_DIR/meta.yaml — fill in title/author/year

==> Next: tell your agent
    "Ingest raw/books/$SLUG/book.md into the wiki."
EOF
