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
- print a Claude Desktop config snippet

## 2. Wire up Claude Desktop

Open the config file the installer pointed at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Paste the printed snippet under `"mcpServers"`. It looks like:

```json
{
  "mcpServers": {
    "mnemex-library": {
      "command": "npx",
      "args": ["@mnemex/library-mcp"],
      "env": { "WIKI_ROOT": "/Users/you/mnemex" }
    }
  }
}
```

Restart Claude Desktop.

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
