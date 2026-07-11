# Roadmap — Labor Commons Specialist Contract

## Version 1.0

The idea capture described one coherent steady-state system, not a phased
build — nearly everything below is v1, with only the seed process being
inherently a one-time, day-one activity.

**v1.0 scope:**

- Full `SpecialistRecord` schema (identity, knowledge, boundary, handoffs,
  certification, freshness, seed provenance)
- Certification gate enforced before any record can reach `published` status,
  via three independent passes (author, scenario generation, grading) — not
  self-certification. Independent scenario review is pulled forward into v1
  itself, not deferred to v1.x, given prior lived experience in this project
  with a self-graded "fix" being reported as resolved when it wasn't.
- Backfill certification sweep (labor-commons-curator, non-blocking) for the
  existing catalog published before the gate existed — see `api.md`
- Both match modes: single (on-demand) and bulk (team-assembly), including
  honest no-match / partial-coverage reporting
- Handoff resolution with cycle detection
- Freshness: full-catalog periodic sweep, plus in-the-moment stale flagging
  from any consumer
- One-time NAICS-based seed curation to populate the initial catalog,
  recorded via `SeedProvenance` on the resulting records
- Ongoing growth via two parallel paths, both part of steady-state operation,
  not deferred features:
  - **System-detected gap-filling** — the system notices coverage gaps and
    generates a record to fill them
  - **Curated/human-identified sourcing** — a person identifies a need and
    authors a record, drawing on continued NAICS coverage expansion (beyond
    the one-time seed) or other identified sources, not only ad-hoc requests

## Future versions

Nothing was explicitly deferred by the user during idea capture (no
tangential features were raised and set aside) — see `backlog.md`. Future
versions would most naturally focus on maturing v1's mechanisms rather than
adding new ones:

- **v1.x** — track-record signals beyond pass/fail certification (usage
  history, outcome quality over time) feeding into match scoring
- **v2** — schema versioning/migration tooling, once the contract has been
  in use long enough to need its first breaking change
