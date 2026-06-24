# Quickstart

From zero to your first ingested book in about 10 minutes.

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/Daniil-Sokolskiy/mnemex/main/install.sh | bash
```

The installer will:
- check/install Node 20+, pandoc, git
- install `@mnemex/library-mcp` + `@mnemex/cli` globally
- install `qmd` (search backend) and index your wiki
- install Chromium for Playwright
- scaffold a wiki (default `~/mnemex`)
- print client-specific setup instructions

The last step (`mnemex mcp install`) prints setup blocks for **both** Claude
Desktop and Claude Code. It never edits any config silently — you copy the block
for your client. You can re-run it anytime: `mnemex mcp install --wiki ~/mnemex`.

## 2. Wire up your client

These are **local** MCP servers — they read your filesystem and run Chromium, so
they need a client running on your machine. Pick one:

### Claude Desktop

Open the config file the installer pointed at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Merge the printed block under `"mcpServers"` (don't duplicate the key if it's
already there):

```json
{
  "mcpServers": {
    "mnemex-library": {
      "command": "npx",
      "args": ["@mnemex/library-mcp"],
      "env": { "WIKI_ROOT": "/Users/you/mnemex" }
    },
    "mnemex-search": {
      "command": "qmd",
      "args": ["mcp"],
      "env": { "QMD_EMBED_MODEL": "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf" }
    }
  }
}
```

Then fully **quit and reopen** Claude Desktop (not just close the window).

### Claude Code (CLI)

No file editing — just run the two commands the installer printed:

```bash
claude mcp add mnemex-library -e WIKI_ROOT=~/mnemex -- npx @mnemex/library-mcp
claude mcp add mnemex-search  -e QMD_EMBED_MODEL=hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf -- qmd mcp
```

Check with `claude mcp list`. Add `--scope user` to enable them in every project.

### Claude on the web (claude.ai)

Not supported directly — the web app can't launch local programs. Use Claude
Desktop or Claude Code. (Advanced: you could host an MCP server remotely and add
it as a web connector, but that's outside this guide.)

> `mnemex-search` only activates after you've run `mnemex setup-search` (it
> downloads a ~2GB embedding model). Skip it if you only want book download for
> now — `mnemex-library` works on its own.

## 3. Verify

```bash
mnemex doctor
```

All required rows should be green. In Claude Desktop, the `mnemex-library`
tools should now appear.

## 4. Ingest your first book

In a Claude conversation:

> **"Help me ingest my first book — Meditations by Marcus Aurelius. It's public domain on Project Gutenberg."**

The agent will:
1. search for it with `library_search`
2. download it into `~/mnemex/raw/books/meditations-aurelius/`
3. read `CLAUDE.md`, then the book
4. write a source page, entity pages, concept pages
5. update `index.md` and `log.md`

Open `~/mnemex/index.md` — it's no longer empty.

## 5. Ask a question

> **"What does Marcus Aurelius say about things outside our control?"**

The agent reads the *wiki* (not the raw book) and answers with citations back to
the source page.

## Optional: Anna's Archive membership

Project Gutenberg covers public-domain classics. For copyrighted books, Anna's
Archive has a much larger catalog. If you have a paid Anna's membership, add
your secret key so downloads happen automatically:

```json
"env": {
  "WIKI_ROOT": "/Users/you/mnemex",
  "ANNAS_ARCHIVE_KEY": "your-secret-key"
}
```

Without a key, `library_annas_search` still works — it returns a download page
URL you open in a browser. See [annas-disclaimer.md](annas-disclaimer.md) for
the legal context.
