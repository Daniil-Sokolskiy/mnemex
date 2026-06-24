#!/usr/bin/env bash
# setup-qmd.sh — one-time setup for the mnemex knowledge base search.
#
# Installs qmd globally, configures collections over your wiki, downloads the
# multilingual embedding model (needed for Russian-language books), and runs
# the initial embed. Idempotent — safe to re-run.
#
# Requirements (install first if missing):
#   - Node.js >= 22  (brew install node)
#   - SQLite via Homebrew  (brew install sqlite)

set -euo pipefail

WIKI_ROOT="${WIKI_ROOT:-${WIKI_ROOT:-$HOME/mnemex}}"

echo "==> brain/ location: $WIKI_ROOT"

if [ ! -d "$WIKI_ROOT" ]; then
  echo "ERROR: $WIKI_ROOT not found. Edit WIKI_ROOT at the top of this script."
  exit 1
fi

# ---- 1. Check Node ----
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Run: brew install node"
  exit 1
fi
NODE_VER="$(node -v | sed 's/v//;s/\..*//')"
if [ "$NODE_VER" -lt 22 ]; then
  echo "ERROR: Node.js $NODE_VER detected; qmd requires >= 22. Run: brew upgrade node"
  exit 1
fi

# ---- 2. Check SQLite (macOS) ----
if [ "$(uname)" = "Darwin" ]; then
  if ! brew list sqlite >/dev/null 2>&1; then
    echo "==> Installing Homebrew sqlite (required for qmd extensions)"
    brew install sqlite
  fi
fi

# ---- 3. Install qmd globally ----
if ! command -v qmd >/dev/null 2>&1; then
  echo "==> Installing qmd globally via npm"
  npm install -g @tobilu/qmd
else
  echo "==> qmd already installed: $(qmd --version 2>/dev/null || echo unknown)"
fi

# ---- 4. Use multilingual embedding model (Russian + English) ----
# Add to your shell rc once. Idempotent check below.
ZRC="$HOME/.zshrc"
EMBED_LINE='export QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"'
if [ -f "$ZRC" ] && ! grep -q "QMD_EMBED_MODEL" "$ZRC"; then
  echo "==> Adding QMD_EMBED_MODEL to $ZRC (multilingual model for Russian books)"
  printf '\n# qmd: multilingual embeddings for brain/\n%s\n' "$EMBED_LINE" >> "$ZRC"
fi
export QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"

# ---- 5. Register the brain collection ----
echo "==> Registering brain/wiki and brain/raw as qmd collections"
qmd collection add "$WIKI_ROOT/wiki" --name mnemex-wiki --mask "**/*.md" 2>/dev/null || \
  echo "    (mnemex-wiki already registered)"
qmd collection add "$WIKI_ROOT/raw"  --name mnemex-raw  --mask "**/*.md" 2>/dev/null || \
  echo "    (mnemex-raw already registered)"

# ---- 6. Add context — improves search quality ----
qmd context add qmd://mnemex-wiki "Synthesized knowledge: LLM-maintained markdown wiki built from books and articles. Includes pages for entities, concepts, sources, and syntheses (DDD, architecture, psychology, leadership)." 2>/dev/null || true
qmd context add qmd://mnemex-raw  "Raw source materials: full text of books and articles in markdown. The truth layer — cite these for direct quotation." 2>/dev/null || true

# ---- 7. Index + embed ----
echo "==> Indexing"
qmd update
echo "==> Generating embeddings (downloads ~2GB of models on first run)"
qmd embed

echo
echo "==> Done. Try a search:"
echo "    qmd query 'bounded context' "
echo "    qmd query 'lead a team through change' "
echo
echo "==> Next: connect qmd as an MCP server. See README-MCP-setup.md."
