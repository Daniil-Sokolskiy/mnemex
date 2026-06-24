# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.1] — 2026-06-25

### Fixed
- `@mnemex/library-mcp`: the MCP server now identifies itself as `mnemex-library`
  (previously `brain-library`, a leftover internal name). This is the name that
  shows up in Claude Desktop's tool list.

### Added
- `@mnemex/cli`: a package README (the npm page was previously empty).
- README: documented free vs. paid downloading from Anna's Archive.

## [0.1.0] — 2026-06-24

### Added
- Initial public release.
- `@mnemex/library-mcp` — MCP server to search and download books from Project
  Gutenberg and Anna's Archive into your wiki. Includes a Playwright-based Anna's
  search that works against their current client-side-rendered pages.
- `@mnemex/cli` — `mnemex init` / `doctor` / `mcp install` / `setup-search` /
  `reindex` / `search` to scaffold a wiki and wire up the MCP servers.
- `apps/wiki-template` — the starter wiki: `CLAUDE.md` operating manual, page
  templates, ingest scripts, and an empty directory structure.
- `mnemex-search` via [qmd](https://www.npmjs.com/package/@tobilu/qmd) — local
  hybrid BM25 + vector search exposed as an MCP server over the wiki.
- Turnkey `install.sh`, methodology docs, and an Anna's Archive legal disclaimer.

[0.1.1]: https://github.com/Daniil-Sokolskiy/mnemex/releases/tag/v0.1.1
[0.1.0]: https://github.com/Daniil-Sokolskiy/mnemex/releases/tag/v0.1.0
