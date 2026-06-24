#!/usr/bin/env bash
# reindex.sh — re-scan brain/ and update qmd's index + embeddings.
#
# Run after adding new books/articles to brain/raw/ or after the LLM has
# touched a lot of wiki pages.

set -euo pipefail

export QMD_EMBED_MODEL="${QMD_EMBED_MODEL:-hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf}"

echo "==> Updating qmd index"
qmd update

echo "==> Updating embeddings"
qmd embed

echo "==> Done."
qmd status
