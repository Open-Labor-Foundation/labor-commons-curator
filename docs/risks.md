# Risks — Labor Commons Specialist Contract

## Technical risks

**Consumers still diverge even with one schema, if nothing enforces
conformance beyond publish time.**
A shared schema only prevents drift if every consumer actually validates
against it — and keeps validating as the schema evolves. If validation only
runs on newly-changed records (rather than the whole catalog, on every
schema version bump), already-published records can silently stop
conforming and nobody notices until a consumer breaks on them.
*Mitigation:* full-catalog validation in CI, not diff-scoped; consumers
derive types from the schema rather than hand-rolling their own.

**The freshness sweep doesn't scale indefinitely.**
"Sweep the entire collection at once" is simple and honest, but its cost
grows with the catalog. At some catalog size, a full sweep becomes slow or
expensive enough to run less often than intended, quietly weakening the
freshness guarantee.
*Mitigation:* revisit sweep architecture (sharding, incremental passes)
once catalog size or sweep duration crosses a defined threshold — don't
solve for it prematurely, but don't ignore it either.

## Design risks

**Self-derived certification can be gamed.**
Test scenarios "built from the profile's own claims" mean a record's author
controls both the claim and the test of the claim. A weak or narrow set of
self-authored scenarios could pass certification without meaningfully
proving competence — and this project has already lived through exactly this
failure mode once, outside this contract (a pipeline "fix" was reported
resolved because the test artifact was patched to pass, not because the
underlying generator was fixed).
*Mitigation (v1, not deferred):* three independent passes — authoring,
scenario generation, grading — none sharing session/context with the others,
with `generated_by`/`graded_by` on the record so independence is auditable.
See `data_model.md` and `api.md`.

**Handoff chains can loop.**
Boundary handoffs are a graph between records; nothing described during
capture prevents A → B → A cycles, which would strand a task in an infinite
redirect instead of reaching a real answer or an honest failure.
*Mitigation:* cycle detection at resolution time (already reflected in
`data_model.md` / `api.md`); a detected cycle should surface as an explicit
error, not fail silently.

**"Honest no-match" is only honest if the fit threshold is well-tuned.**
Too strict, and useful-but-imperfect specialists get needlessly excluded,
frustrating users who'd have been fine with a close match. Too loose, and
"no-match" stops meaning anything.
*Mitigation:* treat the threshold as a tunable, monitored value — track
no-match rate and downstream complaint rate as competing signals, not a
fixed constant set once.

## Scope risks

**The NAICS seed maps industries, not tasks.**
Industry/job classification codes were the tool used to find the *starting*
set of specialists, but NAICS classifies industries and occupations, not the
boundary-drawing granularity a specialist record actually needs. Treating
the seed's boundaries as authoritative long-term structure (rather than a
rough starting map, later refined by real matching and certification
results) risks baking industry-classification artifacts into the catalog's
shape permanently.
*Mitigation:* the contract explicitly does not require ongoing NAICS
alignment (see `product.md` out-of-scope) — seed-derived records should be
free to have their boundaries refined post-seed like any other record.
