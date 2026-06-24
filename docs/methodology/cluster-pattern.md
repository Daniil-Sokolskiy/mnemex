# Cluster ingest

Ingesting books **one at a time** produces a wiki of disconnected islands. Each
book's concepts sit alone until, much later, another book happens to touch the
same idea. Concepts stay at `sources: 1` forever.

**Cluster ingest** fixes this: pick 4–6 books on one theme and ingest them as a
deliberate batch, so concepts accumulate sources and cross-links rapidly and
the cluster matures together.

## How to run a cluster

1. **Pick a coherent theme and 4–6 books that cover it from different angles.**
   A good cluster spans layers, not duplicates. Example — a *DevOps/SRE* cluster:

   | Book | Layer it covers |
   |---|---|
   | *The Phoenix Project* | doctrine / narrative (the *why*) |
   | *Accelerate* | research-validated metrics (DORA) |
   | *Site Reliability Engineering* | role & process model |
   | *Release It!* | engineering stability patterns |
   | *Continuous Delivery* | deployment-pipeline mechanics |

2. **Ingest them in dependency order** — foundations first, so later books can
   cross-link back into established concepts.

3. **Plant sibling hooks.** When ingesting book 1, the agent knows books 2–6 are
   coming. It pre-references concepts they'll introduce (e.g. Phoenix Project's
   pages link forward to `[[DORA-Four-Key-Metrics]]` before Accelerate is
   ingested). When book 2 lands, those links resolve.

4. **Augment, don't duplicate.** If book 3 covers a concept book 1 already
   created, the agent *augments* the existing page (adds the new source's
   framing, bumps the `sources:` count) instead of making a near-duplicate.
   This is where concepts climb toward `mature`.

5. **Write a synthesis at the end.** Once the cluster is in, the highest-value
   artifact is a `wiki/syntheses/` page answering the question the cluster was
   really about — e.g. *"What does the full DevOps stack look like and where
   does each book fit?"* The synthesis is what you'll actually re-read.

## Why it's worth the discipline

- **Concepts mature fast.** A concept touched by 3 books in one cluster reaches
  `mature` (3+ sources, reviewed) immediately, instead of over months.
- **Cross-links are dense from day one.** Sibling hooks mean the cluster is a
  connected graph, not islands.
- **The synthesis captures the real value.** Individual book summaries are
  useful; the cross-book synthesis is what no single book gives you.

## Bookkeeping at cluster scale

Run each book through the [two-phase ingest](two-phase-ingest.md). After the
last book, do a short **cluster close**: update any synthesis pages, promote
concepts that crossed 3 sources to `mature`, and log a cluster-complete entry.
