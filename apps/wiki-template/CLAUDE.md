# LLM Wiki — Operating Manual

This directory is a **persistent, LLM-maintained knowledge base** built on Andrej Karpathy's LLM Wiki pattern (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

You are reading this because you are an LLM agent (Claude Code, Cowork, or similar) operating inside this wiki. **This file is your operating manual.** Read it fully before touching any files here.

The owner of this wiki is the human; you are the librarian. Your job is everything tedious about maintaining a knowledge base — summarizing, cross-referencing, filing, lint, bookkeeping. The owner curates sources, asks questions, and directs the analysis.

---

## Core idea

Most LLM+documents setups are RAG: chunk → embed → retrieve at query time → generate. Knowledge is never accumulated; the LLM rediscovers it on every question.

This wiki is the opposite: **knowledge is compiled once and then kept current.** When a new source arrives, you (the LLM) read it, extract what matters, and integrate it into the existing wiki — updating entity pages, revising topic summaries, flagging contradictions. Future questions search the **already-synthesized** wiki, not raw sources.

The wiki is a compounding artifact. Every ingest makes it richer. Every good answer is filed back in as a new page.

---

## Three layers

### `raw/` — immutable sources
Original materials. You read these but **never modify them**.

- `raw/books/` — full book texts, converted to markdown (PDF/EPUB → .md). One subdirectory per book: `raw/books/<slug>/{book.md, meta.yaml, cover.jpg}`.
- `raw/articles/` — single-file articles, blog posts, papers. Naming: `YYYY-MM-DD__<slug>.md`.
- `raw/assets/` — images, diagrams, PDFs that pages reference.

### `wiki/` — LLM-owned synthesis
Markdown files you write and maintain. The owner reads; you write. Subfolders by **type of page** (not by topic — topics emerge through wikilinks and tags).

- `wiki/entities/` — concrete things: people, companies, books, libraries, tools (e.g. `Eric-Evans.md`, `Daniel-Kahneman.md`).
- `wiki/concepts/` — abstract ideas, patterns, frameworks (e.g. `Bounded-Context.md`, `Cognitive-Dissonance.md`).
- `wiki/sources/` — one page per ingested source. Bridge between `raw/` and the rest of the wiki. Contains: meta (author, year, ISBN), TOC, chapter-by-chapter summary, extracted claims with locations, key entities/concepts mentioned (as wikilinks).
- `wiki/syntheses/` — cross-source analyses, comparisons, evolving theses. Born from queries. Examples: `DDD-vs-Clean-Architecture.md`, `What-makes-a-good-tech-lead.md`.

### Schema layer (this file + templates)
- `CLAUDE.md` — this file. Operating manual.
- `templates/` — page templates you use when creating new pages.
- `index.md` — content catalog. Updated on every ingest.
- `log.md` — chronological journal. Appended after every operation.

---

## Naming conventions

**Pages:** `Title-Case-With-Dashes.md` for entities and concepts (e.g. `Bounded-Context.md`, not `bounded_context.md`). This makes wikilinks readable: `[[Bounded-Context]]`.

**Sources:** match the book or article's natural identity: `Domain-Driven-Design-Evans-2003.md`, `Thinking-Fast-and-Slow-Kahneman-2011.md`.

**Raw books:** `raw/books/<author-lastname>-<short-title>-<year>/book.md`. Example: `raw/books/evans-ddd-2003/book.md`.

**Slugs:** lowercase, kebab-case, no diacritics. Non-Latin titles are transliterated (`myshlenie-bystroe-i-medlennoe`).

---

## Frontmatter (YAML)

Every wiki page starts with YAML frontmatter. This is read by Obsidian's Dataview plugin and by you when answering queries.

```yaml
---
type: concept            # entity | concept | source | synthesis
domain: tech             # tech | psychology | leadership | other (can be a list)
status: stub             # stub | draft | mature
sources: 3               # how many sources reference this page
created: 2026-05-22
updated: 2026-05-22
tags: [ddd, architecture]
aliases: ["DDD", "Domain Driven Design"]
---
```

`aliases` is **important** — it solves the "duplicate concepts under slightly different names" problem flagged in the gist comments. Always check existing aliases before creating a new concept page.

---

## Operations

### Ingest (when the owner adds a source)

When a new file appears in `raw/` (or the owner asks you to ingest something):

1. **Read the source.** For books, read the whole thing — don't skim. For long books, you may need multiple passes.
2. **Discuss key takeaways** with the owner in 3–5 bullet points before writing anything. Wait for direction on what to emphasize.
3. **Create a source page** in `wiki/sources/` using `templates/source.md`. Fill in: bibliographic meta, TOC, chapter-by-chapter summary, list of extracted claims with locations (chapter/page), list of key entities and concepts mentioned (as wikilinks).
4. **Update or create entity pages** for people, books, companies, tools mentioned. Use `templates/entity.md`.
5. **Update or create concept pages** for ideas, patterns, frameworks. Use `templates/concept.md`. **Before creating a new concept page, search `index.md` and all `aliases:` fields for synonyms.** If a similar concept exists, extend the existing page or add an alias rather than creating a duplicate.
6. **Update `index.md`** — add new pages to their category section.
7. **Append a log entry** to `log.md` with format `## [YYYY-MM-DD HH:MM] ingest | <source title>` followed by a one-line summary and list of pages touched.
8. **Flag contradictions.** If a new source contradicts an existing claim, add a `> [!warning] Contradiction` callout on the relevant page with citations to both sources. Don't silently overwrite.

A single ingest typically touches **10–15 wiki pages**. That's correct — it's the bookkeeping you exist to do.

> **Tip for large books — the two-phase ingest pattern.** Splitting the ingest into
> (1) a content phase delegated to a sub-agent (read source + write source/entity/concept
> pages, but NOT index.md/log.md/meta.yaml) and (2) a short bookkeeping phase done by the
> parent (update index.md counts, append log.md, flip meta.yaml `llm_ingested: true`)
> avoids socket timeouts that long single-agent ingests hit on the finalization steps.
> See `../docs/methodology/two-phase-ingest.md`.

### Query (when the owner asks a question)

1. **Read `index.md` first** to locate relevant pages.
2. If the search MCP is connected (`mnemex-search`, powered by qmd — `brain.query`), use it for full-text + semantic search across `wiki/` and `raw/`. Otherwise use `Grep`/`Read` directly.
3. **Read relevant wiki pages, not raw sources.** The wiki is the synthesis; only drop to `raw/` for direct quotation or fact-checking.
4. **Synthesize with citations.** Every claim should link `[[Source-Page]]` so the owner can trace it.
5. **Offer to file the answer.** If the synthesis is non-trivial — a comparison, a thesis, a "how do these books agree" — propose creating a new page in `wiki/syntheses/`. Don't let valuable analysis disappear into chat history.

### Lint (periodic health check)

When the owner asks for lint, or proactively after every ~20 ingests:

- Find **contradictions** between pages that aren't already flagged.
- Find **stale claims** (a `source: 1` page where the only source has been superseded by newer reading).
- Find **orphan pages** — no inbound wikilinks. Either delete or integrate.
- Find **implicit concepts** — terms used on 3+ pages with no concept page of their own.
- Find **broken wikilinks**.
- Find **duplicate concepts** — pages with similar titles or overlapping aliases. Propose merges.
- Report findings as a list. Don't fix without owner approval.

---

## Domain-specific guidance

### Technical sources (DDD, architecture, code)

- Code examples go in fenced blocks with language tag.
- For patterns, always include a `When to use` and `When NOT to use` section.
- Diagrams: text descriptions in the page, image files in `raw/assets/`, referenced by relative path.
- Cross-reference between patterns aggressively: a `[[Bounded-Context]]` page should link to `[[Aggregate-Root]]`, `[[Ubiquitous-Language]]`, etc.
- When answering coding questions, **cite the book and chapter**, not just the concept name.

### Psychology / self-improvement

- Distinguish **claim** from **evidence**. Psychology has lots of "popular truths" that don't replicate. Note when a claim is supported by studies cited in the source vs. asserted as folk wisdom.
- Use `> [!note]` callouts for the author's main thesis, `> [!example]` for case studies the author gives.
- Build entity pages for cited researchers (Kahneman, Tversky, etc.) so cross-book references compound.

---

## Relationships (avoid the "everything is `related`" trap)

When linking concepts, prefer typed sections over bare wikilinks. Conventions:

- `## See also` — loose association.
- `## Subsumes` — this concept contains the linked ones.
- `## Contrasted with` — the linked concept is an alternative or opposite.
- `## Builds on` — the linked concept is a prerequisite.
- `## Contradicts` — the linked source disagrees with claims on this page.

This is the fix for the "Similar, contains, contradicts — all collapsed into one word" problem from the gist comments.

---

## Levels (avoid flat hierarchy)

Tag pages with `status:` in frontmatter:

- `stub` — placeholder; created because something linked to it but no real content yet.
- `draft` — has content from 1–2 sources, not yet stable.
- `mature` — synthesized from 3+ sources, owner has reviewed.

This gives a sense of which pages are heavyweight anchors vs. lightweight references. Heavyweight pages may grow their own sub-pages (e.g. `Domain-Driven-Design.md` plus `Domain-Driven-Design-Strategic.md`, `Domain-Driven-Design-Tactical.md`).

---

## Working agreements

- **Never edit `raw/`.** It's the source of truth.
- **Never silently overwrite contradictory claims** — flag them.
- **Never create a concept page without checking `index.md` for synonyms.**
- **Always update `index.md` and append to `log.md`** as part of any ingest. These are not optional bookkeeping; they're how the system stays navigable.
- **When unsure, ask the owner.** This file co-evolves with the wiki; if a convention is missing or wrong, propose an update to `CLAUDE.md`.

---

## Tools

If the search MCP server is connected (`mnemex-search`, powered by qmd), you have hybrid BM25 + vector search over `wiki/` and `raw/` via `brain.query` / `brain.get` / `brain.multi_get` / `brain.status`. Use it for any non-trivial query.

If filesystem access is available (Cowork / Claude Code with direct file access), you can `Read`/`Grep`/`Glob` directly.

To download and ingest books into `raw/books/`, the `@mnemex/library-mcp` server provides search + download tools for Project Gutenberg and Anna's Archive. The conversion script lives at `scripts/ingest-book.sh` (run `scripts/setup-converters.sh` once to install pandoc/calibre/etc).
