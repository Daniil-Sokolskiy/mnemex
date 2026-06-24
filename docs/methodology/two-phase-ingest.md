# Two-phase ingest

The single most useful operational pattern for ingesting large books without
hitting agent timeouts.

## The problem

A naïve ingest is one long agent run:

> read the whole book → write the source page → create 10 entity pages →
> create 15 concept pages → update `index.md` → append `log.md` →
> flip `meta.yaml`

For a 600-page book this is a very long single agent invocation. The failure
mode is real: the agent does all the hard, valuable work (reading + writing 25
pages), and then the run dies on a socket timeout during the *finalization*
steps — leaving `index.md` and `log.md` out of sync with the pages that were
actually written. You're left reconciling by hand.

## The fix: split content from bookkeeping

**Phase 1 — content (delegate to a sub-agent).**
The sub-agent reads `CLAUDE.md` + the page templates + `book.md`, and writes:

- `wiki/sources/<Source>.md`
- new/updated `wiki/entities/*`
- new/updated `wiki/concepts/*`

The sub-agent is told **explicitly not to touch** `index.md`, `log.md`, or
`meta.yaml`. Its scope is content only. When it returns, it reports exactly
which files it created and modified.

**Phase 2 — bookkeeping (done by the parent, inline).**
The parent agent takes the sub-agent's report and does the short, mechanical
finalization:

- update `index.md` sections + the header counts (`Sources · Entities · Concepts · Syntheses`)
- append a `## [YYYY-MM-DD HH:MM] ingest | <title>` entry to `log.md`, listing every page touched
- flip `meta.yaml` `llm_ingested: true` and fill `title` / `author` / `year` / `language`

## Why it works

- **The expensive, timeout-prone part (Phase 1) is isolated.** If it dies, you
  retry just the content phase; bookkeeping never ran, so nothing is half-done.
- **Bookkeeping is fast and deterministic.** The parent already has the
  sub-agent's file list, so Phase 2 is a handful of edits — no re-reading the
  book.
- **The invariant holds:** `index.md` and `log.md` are only ever updated
  *after* the content they describe exists on disk.

## Rule of thumb

Use two-phase for any book over ~150 pages, or any ingest you expect to touch
10+ wiki pages. For a short article, a single-phase ingest is fine.

## Sibling-aware variant

When ingesting a **cluster** of related books (see
[cluster-pattern.md](cluster-pattern.md)), the Phase 1 sub-agent should also
plant "sibling hooks" — cross-links to concepts that *will* exist once the
other books in the cluster are ingested. The parent resolves and verifies these
during each book's Phase 2.
