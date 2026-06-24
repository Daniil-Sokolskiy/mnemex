# @mnemex/cli

The `mnemex` command — scaffold an LLM-curated knowledge wiki, check dependencies, and wire up the MCP servers for Claude Desktop.

```bash
npm install -g @mnemex/cli @mnemex/library-mcp
mnemex init ~/mnemex        # scaffold a wiki
mnemex doctor              # check pandoc / chromium / qmd / etc
mnemex mcp install         # print the Claude Desktop config snippet
mnemex setup-search        # set up qmd-powered search (optional)
```

Full docs, the turnkey installer, and the methodology live in the main repo:
👉 **https://github.com/Daniil-Sokolskiy/mnemex**

## Commands

| Command | What it does |
| --- | --- |
| `mnemex init [dir]` | Scaffold a wiki (CLAUDE.md, templates, scripts) at `dir` (default `~/mnemex`). |
| `mnemex doctor` | Check required + optional dependencies. |
| `mnemex mcp install` | Print the Claude Desktop `mcpServers` snippet (both servers). |
| `mnemex mcp status` | Show expected wiki root + config path. |
| `mnemex setup-search` | Install qmd, register collections, build the index. |
| `mnemex reindex` | Refresh the search index after ingesting. |
| `mnemex search <query>` | Query the wiki from the terminal. |

MIT © contributors
