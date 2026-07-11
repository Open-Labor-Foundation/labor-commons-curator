# Product Spec — Labor Commons Specialist Contract

## Name

Labor Commons Specialist Contract

## Type

A data contract / publishing standard — not an application. It defines what a
"specialist" record must contain to be published into the labor-commons
catalog and reliably consumed by any platform that matches, assembles, or
activates specialists.

## Description

The specialist record is the atomic unit of labor-commons: a written profile
of one kind of expertise. It is not itself the working expert — it is the
description that any platform can turn into a working expert. The contract's
job is to make that description complete and unambiguous enough that every
consumer derives the same meaning from it, rather than each consumer inventing
its own partial reading.

## Target audience

- **Publishers** — the process (automated gap-detection, or a person) that
  authors or generates a new specialist record
- **Team-assembly consumers** — platforms that query the catalog in bulk to
  build a roster of specialists for an organization ahead of time
- **On-demand consumers** — platforms that query the catalog for a single
  best-fit specialist to handle one task right now
- **Activation platforms** — whatever turns a matched record into a real
  working expert (chat agent, single-shot task runner, etc.) — the contract
  does not prescribe how activation looks, only what it's built from
- **End users** — the people ultimately relying on the specialist's output,
  who are the actual beneficiaries of the trust/certification/freshness
  guarantees below

## Core features (v1)

1. **Identity & purpose** — what the specialist is and does, in plain terms
2. **Knowledge & sourcing** — what it knows, and the real, attributable
   sources that knowledge is built on
3. **Boundaries & handoff** — explicit in-scope and out-of-scope statement,
   plus named neighbor specialists to hand off to when a task falls outside
   the boundary
4. **Certification gate** — test scenarios derived from the record's own
   stated claims; a record cannot be published/go live until it passes them
5. **Freshness** — supports both a full-catalog periodic sweep and an
   in-the-moment "flagged stale by use" signal; a record always carries its
   current freshness state
6. **Match support** — enough structure that a consumer can score fit for
   both bulk (team-assembly) and single (on-demand) queries, and can honestly
   report "no good match" rather than forcing one
7. **Seed provenance** — the initial catalog is marked as having originated
   from a one-time NAICS-based curation pass; this is recorded but does not
   constrain how records are structured or how the catalog grows afterward

## Explicitly out of scope

- **How activation looks or feels** (conversational vs. single-shot result) —
  this is a property of the consuming platform, not the record
- **How matching is scored/ranked internally** — the contract defines what
  data is available to score against, not the scoring algorithm itself
- **Ongoing catalog-growth sourcing** (NAICS or otherwise) — the contract only
  needs to represent *that* a record has a seed origin, not re-run that
  process
- **UI for browsing/authoring records** — covered by whatever tooling
  publishes/consumes the contract, not the contract itself

## Success criteria

- Any two independent consumers built against this contract derive the
  *same* meaning from the same record — no consumer-specific reinterpretation
- A record cannot be marked "live" without having passed its certification
  gate
- Staleness is always knowable from the record's own state (sweep result or
  flag), never something a consumer has to infer
- End users trust results enough to stop double-checking them elsewhere
- The catalog keeps expanding into new fields without requiring contract
  changes to accommodate normal growth
