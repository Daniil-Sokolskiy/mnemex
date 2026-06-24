---
type: log
---

# Log

Append-only chronological journal. Every ingest, query that produced a new
synthesis, and lint pass is recorded here.

**Format:** entries start with `## [YYYY-MM-DD HH:MM] <op> | <subject>` so that
`grep "^## \[" log.md | tail -N` gives the last N operations as a clean list.

Operations: `ingest`, `query`, `synthesis`, `lint`, `schema-update`.

---

## [2026-01-01 00:00] schema-update | initial setup

Created wiki from the mnemex template.

- Structure: `raw/{books,articles,assets}`, `wiki/{entities,concepts,sources,syntheses}`, `templates/`.
- Schema: `CLAUDE.md` operating manual + page templates.
- Service files: `index.md` (catalog), `log.md` (this file).

Ready for first ingest.
