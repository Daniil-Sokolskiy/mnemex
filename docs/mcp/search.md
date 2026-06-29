# Search (mnemex-search, powered by qmd)

mnemex doesn't reinvent search — it wires up **[qmd](https://www.npmjs.com/package/@tobilu/qmd)**, a local hybrid BM25 + vector search engine, as an MCP server over your wiki. The agent gets `brain.query` / `brain.get` / `brain.multi_get` / `brain.status` tools for fast retrieval across `wiki/` and `raw/`.

This is the read/query half of mnemex. The write/ingest half is `@mnemex/library-mcp`.

## One-time setup

```bash
mnemex setup-search --wiki ~/mnemex
```

This will:
1. install `qmd` globally (`npm install -g @tobilu/qmd`) if missing
2. register `~/mnemex/wiki` and `~/mnemex/raw` as qmd collections (`mnemex-wiki`, `mnemex-raw`)
3. download a multilingual embedding model (~2GB, handles non-English sources)
4. build the index + embeddings

Requires Node ≥ 22 and (on macOS) Homebrew SQLite — the setup script checks and tells you if anything's missing.

### Windows

`mnemex setup-search` runs a bash script (macOS/Homebrew-shaped), so on Windows
do the same four steps natively in PowerShell (Node ≥ 22 required — `winget
install OpenJS.NodeJS.LTS`):

```powershell
$model = "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"
$env:QMD_EMBED_MODEL = $model
npm install -g @tobilu/qmd
qmd collection add "$env:USERPROFILE\mnemex\wiki" --name mnemex-wiki --mask "**/*.md"
qmd collection add "$env:USERPROFILE\mnemex\raw"  --name mnemex-raw  --mask "**/*.md"
qmd update
qmd embed          # downloads the embedding model on first run
```

> **Windows + reranking:** node-llama-cpp defaults to the **Vulkan** backend on
> Windows (CUDA needs a separate toolkit/build and isn't auto-selected), and
> qmd's reranker fails to allocate a context there — a hard crash on an Intel
> Iris Xe iGPU, or a silent Vulkan out-of-memory + non-reranked fallback even
> with an RTX 3070 Ti present. Embedding still works on the GPU; only rerank
> needs CPU. Force it with `QMD_FORCE_CPU=1` (CLI: `--no-gpu`). `mnemex mcp
> install` already adds this env var to the `mnemex-search` block on Windows,
> so the MCP server is covered; set it in your shell too if you run `qmd query`
> directly.

## Keeping the index fresh

After ingesting books or editing many pages:

```bash
mnemex reindex      # qmd update && qmd embed
```

## Searching from the terminal

```bash
mnemex search "bounded context"
```

## Wiring it into Claude

`mnemex mcp install` already emits the `mnemex-search` server block:

```json
"mnemex-search": {
  "command": "qmd",
  "args": ["mcp"],
  "env": { "QMD_EMBED_MODEL": "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf" }
}
```

**Claude Desktop:** paste it under `mcpServers`, then quit and reopen Claude.

**Claude Code:** skip the JSON —

```bash
claude mcp add mnemex-search -e QMD_EMBED_MODEL=hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf -- qmd mcp
```

Either way the `brain.*` tools appear once the client reconnects.

## Transport: stdio vs HTTP

- **stdio (default):** each client spawns its own `qmd mcp` subprocess. Simple, no daemon. Model loads on cold start (~5s).
- **HTTP:** one shared daemon (`qmd mcp --http`, port 8181) keeps the model hot — better if you use it from multiple clients in parallel.

Start with stdio; switch to HTTP if cold-start lag bothers you.

## Why a separate engine?

Search quality (good chunking, multilingual embeddings, reranking) is a real piece of engineering. qmd does it well and is actively maintained, so mnemex integrates it rather than shipping a weaker reimplementation. mnemex's unique value is the **acquisition + curation** layer (library-mcp + the wiki methodology); qmd is the retrieval layer underneath.
