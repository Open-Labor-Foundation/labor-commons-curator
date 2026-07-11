# Architecture — Labor Commons Specialist Contract

## Technology approach

This is a **schema-first contract**, not a service. The deliverable is a
single, versioned, machine-validated schema definition that is the one source
of truth for what a specialist record is. Every consuming codebase (matching
platforms, activation platforms, publishing tooling) derives its working types
from that schema rather than hand-authoring its own parallel interpretation of
it.

This is a deliberate, best-practice choice, not an incidental one: a contract
that exists only as prose documentation invites every consumer to encode its
own partial reading of that prose, and those readings will drift from each
other and from the schema itself over time with no mechanism to catch it.
Making the schema the executable source of truth — and requiring every
consumer to validate against it, not just be inspired by it — is what keeps
multiple independent platforms in agreement about what a record means.

## Recommended stack

- **Schema format**: a structural, machine-checkable schema definition
  (e.g. JSON Schema or an equivalent typed schema language) checked into the
  catalog repository as the canonical artifact
- **Validation**: every record in the catalog is validated against the full
  current schema on every change, and CI additionally re-validates the
  *entire* catalog on a schedule — not only the files touched in a given
  change — so that a schema version bump surfaces every record that no longer
  conforms, not just newly-touched ones
- **Type derivation**: build-time codegen pull, not a published package. Each
  consumer (commons-board, commons-crew) pulls the canonical schema file
  directly from labor-commons at build time and generates its own working
  types from it then — no `@olf/...`-style package to version and keep in
  sync separately. This still eliminates hand-written, independently-drifting
  interfaces (the actual problem), without adding a package-publishing step
  as a new maintenance burden.
- **Versioning**: the schema itself is versioned; a record declares which
  schema version it conforms to, so consumers can support a migration window
  rather than breaking instantly on a schema change

## Certification pipeline orchestration: labor-commons-curator

Resolved 2026-07-11. A new, dedicated repo —
[labor-commons-curator](https://github.com/Open-Labor-Foundation/labor-commons-curator)
— owns the isolated certification container/agent (scenario generation +
grading), invoked in two modes: gate-mode during initial generation, and
sweep-mode for backfilling the existing catalog. Grading reuses commons-crew's
real materialization rather than reimplementing it. This repo is scoped
*only* to labor-commons — it is not a general cross-repo tool, and it is not
commons-keeper (see below).

Built fresh against this spec, not migrated from commons-keeper's existing
catalog loop: that code predates this contract entirely (no canonical schema,
no certification concept, no independence requirement), so porting it would
import undocumented, unspecified behavior into a component whose entire
purpose is to stop that pattern. The old loop is a behavior-parity reference
at most (e.g. don't silently drop gap-detection), never a source to build
from. commons-keeper's catalog loop is decommissioned only after
labor-commons-curator is built and independently verified — replaced, not
migrated into.

## Core concepts

- **Specialist record** — the full profile: identity, knowledge, boundaries,
  certification state, freshness state, seed provenance
- **Catalog** — the full collection of specialist records
- **Certification gate** — the pass/fail check, run before a record is
  publishable, that proves the record's own claims hold up against test
  scenarios derived from those claims
- **Freshness state** — attached to every record; updated either by the
  periodic full-catalog sweep or by an in-the-moment stale-flag from a
  consumer
- **Handoff graph** — the boundary/neighbor relationships between records,
  used when a task falls outside one record's lane

## System structure

```
Publisher (auto gap-fill | human-authored)
        │
        ▼
  Certification Gate ──(fail)──> rejected, not published
        │ (pass)
        ▼
      Catalog  <───────────────┐
        │                      │
        ├── queried by ──> Match layer (bulk / single)
        │                      │
        │                 honest "no match" if nothing fits
        │
        ├── swept by ──> Freshness sweep (periodic, full-catalog)
        │
        └── flagged by ──> any consumer, in-the-moment staleness signal
                      │
                      ▼
              Activation layer (platform-specific — out of contract scope)
```

## Repo-level curation (labor-commons-curator)

Several responsibilities in this contract belong at the repo level, not in
any consuming platform (commons-board, commons-crew) at query/activation
time, and not in commons-keeper — which was found, in the course of this
design, to be bundling two genuinely unrelated domains (labor-commons content
quality, and cross-repo security posture) into one process. Segmenting them
is itself part of this design, not a side effect of it.
**labor-commons-curator** is the owner of the labor-commons-specific half:

- **Sourcing verification** — validating `knowledge_baseline` source
  references stay real and current
- **Freshness sweep** — the periodic full-catalog pass over `FreshnessState`
- **Adjacency maintenance** — inferring/updating `HandoffRule` targets over
  time, so older records gain new neighbors as the catalog grows, rather
  than being frozen at authoring time
- **Certification** — the isolated author/scenario-gen/grade pipeline, both
  gate-mode (new records) and sweep-mode (backfill) — see above

commons-keeper keeps only its cross-repo security-review loop; its catalog
loop is decommissioned once labor-commons-curator is built and verified.
This is a deliberate pattern, not four unrelated features: labor-commons-
curator owns *maintaining record state over time at the repo level, for
labor-commons only*; commons-board owns *matching*; commons-crew owns
*activation, including live handoff execution*. Keeping that division
explicit is what stops the next platform from re-inventing its own partial
copy of curation logic, the same failure mode that produced the schema
divergence this contract exists to fix.

## Performance targets

Not specified during idea capture — no throughput, latency, or catalog-size
numbers were discussed. Recommend deferring concrete targets until real
catalog size and query volume are known, rather than fabricating numbers here;
the one structural requirement that *is* implied is that the freshness sweep
must scale to "the entire catalog in one pass," so its cost should be
revisited as the catalog grows past whatever size makes a full sweep
expensive.
