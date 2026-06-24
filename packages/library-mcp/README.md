# @mnemex/library-mcp

MCP server that searches and downloads books from **Project Gutenberg** and
**Anna's Archive** straight into your LLM wiki's `raw/books/` folder, then
(optionally) converts them to Markdown for ingestion.

Its headline feature is a **Playwright-based Anna's Archive search** that works
against Anna's current client-side-rendered pages — plain HTTP scraping no
longer returns results since Anna's moved search rendering to JavaScript.

## Tools

| Tool | What it does |
|---|---|
| `library_search` | Search Gutenberg + Anna's at once, ranked candidates from both |
| `library_gutenberg_top` | Top-N most-downloaded Gutenberg books (by language) |
| `library_gutenberg_get` | Full metadata for a Gutenberg book by id |
| `library_gutenberg_download` | Download a Gutenberg book → `raw/books/<slug>/` (+ optional convert) |
| `library_annas_search` | Anna's-only search with language/extension filters; returns md5 + download URL |
| `library_annas_download` | Member-only fast download by md5 (requires `ANNAS_ARCHIVE_KEY`) |

## Install

```bash
npm install -g @mnemex/library-mcp
npx playwright install chromium     # required for Anna's search
```

## Configure (Claude Desktop)

Add to your `claude_desktop_config.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "mnemex-library": {
      "command": "npx",
      "args": ["@mnemex/library-mcp"],
      "env": {
        "WIKI_ROOT": "/absolute/path/to/your/mnemex"
      }
    }
  }
}
```

Optional env vars:

| Var | Default | Purpose |
|---|---|---|
| `WIKI_ROOT` | `~/mnemex` | Root of your wiki; books land in `$WIKI_ROOT/raw/books/` |
| `ANNAS_ARCHIVE_KEY` | _(unset)_ | Paid Anna's member secret key — enables `library_annas_download` fast path. Without it, use the returned `download_page_url` in a browser. |
| `ANNAS_BASE_URL` | `https://annas-archive.gl` | Override if the default mirror is blocked |

> `BRAIN_DIR` is accepted as a legacy alias for `WIKI_ROOT`.

## How the Anna's search works

Anna's Archive moved its search results to client-side rendering, so a plain
`fetch` of the search URL returns an empty JavaScript shell. This package
launches a headless Chromium (via Playwright), waits for the results to render
in the DOM, then extracts each result card (`md5`, title, authors, language,
extension, filesize, year). A shared browser instance is reused across queries
for speed.

If Anna's changes its markup, the DOM extractor in `src/annas.ts` may need a
small update — the selectors live in one `page.evaluate()` block.

## ⚠️ Legal

This is an HTTP/automation client. It hosts and distributes nothing. Anna's
Archive is the subject of ongoing legal action; use of this tool to download
copyrighted material may be unlawful in your jurisdiction. See
[`docs/annas-disclaimer.md`](../../docs/annas-disclaimer.md). For a fully
copyright-clean workflow, use the Project Gutenberg tools (~70,000 public-domain
texts).

## License

MIT
