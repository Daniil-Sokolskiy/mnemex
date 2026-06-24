# Your LLM Wiki

This folder is your personal, LLM-maintained knowledge base. You add sources
(books, articles); an LLM agent reads them and builds a cross-linked wiki of
sources, entities, concepts, and syntheses.

## Layout

```
CLAUDE.md          ← operating manual the LLM reads first
templates/         ← page templates (source / entity / concept / synthesis)
index.md           ← catalog of everything (LLM keeps it current)
log.md             ← chronological journal of every operation
scripts/           ← ingest-book.sh (epub/pdf → markdown), setup-converters.sh
raw/
  books/           ← downloaded book texts (one folder per book)
  articles/        ← single-file articles / papers
  assets/          ← images, diagrams, PDFs
wiki/
  sources/         ← one page per ingested source
  entities/        ← people, companies, tools, books
  concepts/        ← ideas, patterns, frameworks
  syntheses/       ← cross-source analyses you derive
```

## First steps

1. Make sure the MCP servers are configured in your LLM client (see the main
   [mnemex README](https://github.com/Daniil-Sokolskiy/mnemex)).
2. Open a conversation and say: **"help me ingest my first book — <title>"**.
3. The agent will search for it, download it into `raw/books/`, read it, and
   build the wiki pages. Watch `index.md` grow.

## Privacy

Everything here is local and yours. `raw/books/**` and all `wiki/**` content is
git-ignored by default — nothing you ingest is committed unless you choose to.
