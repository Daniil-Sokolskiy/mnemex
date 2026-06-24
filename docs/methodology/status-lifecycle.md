# Status lifecycle: stub → draft → mature

Every wiki page carries a `status:` field in its frontmatter. It tells you (and
the agent) how much to trust a page and how heavyweight it is. This avoids the
flat-hierarchy trap where a one-line placeholder looks the same as a deeply
synthesized anchor page.

## The three levels

| Status | Meaning | Created when |
|---|---|---|
| `stub` | Placeholder. Something linked to it, but there's no real content yet. | An ingest references a concept/entity that doesn't have a page. The agent creates a stub so the wikilink isn't broken. |
| `draft` | Real content, from 1–2 sources. Not yet stable. | A source page is written, or a concept gets its first substantive treatment. |
| `mature` | Synthesized from 3+ sources, **and the owner has reviewed it**. | A concept has accumulated 3+ sources and you've confirmed the synthesis is right. |

## The `sources:` counter

Concept and entity pages track how many sources reference them via the
`sources:` frontmatter field. This is the mechanical signal behind status:

- `sources: 1–2` → `draft`
- `sources: 3+` → **mature candidate** — eligible for promotion, but not
  automatically mature.

## Why "mature" requires owner review

Three sources touching a concept doesn't guarantee the page is *correct* — it
guarantees it's *well-attested*. Promotion to `mature` is the one step the agent
should **not** do unilaterally. The agent marks a page as a "mature candidate"
when it crosses 3 sources; the owner confirms the synthesis holds before it
becomes `mature`. This keeps `mature` meaningful: it's the set of pages you'd
stake an answer on.

## How status is used

- **In queries:** prefer `mature` pages as anchors; treat `draft` as provisional;
  `stub` means "go read a source, this is empty".
- **In lint:** stale `draft` pages (single source superseded by newer reading)
  and long-lived `stub`s (still empty after many ingests) are flagged for
  attention.
- **In growth:** heavyweight `mature` pages may spawn sub-pages
  (`Domain-Driven-Design.md` → `…-Strategic.md`, `…-Tactical.md`) rather than
  growing unboundedly.
