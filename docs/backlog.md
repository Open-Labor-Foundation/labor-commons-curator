# Backlog — Labor Commons Specialist Contract

No ideas were raised and deferred during idea capture — the conversation
stayed on-topic throughout, and every element the user described was scoped
directly into v1.0 (see `roadmap.md`). This file is reserved for future
expansion rather than padded with invented items.

The closest things to forward-looking items are the maturity improvements
already noted in `roadmap.md`'s "Future versions" section (richer
track-record signals, schema migration tooling) — those are refinements of
v1 mechanisms, not deferred scope, and are tracked there rather than
duplicated here.

## Deferred from the discard/rebuild decision

Of the existing catalog, 96 files were confirmed to carry fabricated
"shared meta-agent" content and are slated for discard-and-rebuild from the
NAICS catalog (sequenced after the schema and certification gate exist — see
`project_labor-commons-specialist-contract-path-forward` in project memory).
A separate ~56-file tail carries a looser, unconfirmed set of extra fields
(`boundaries`, `evaluation`, `governance`, `deployment`, etc.) that was not
established as part of the same hallucination.

**Decision:** leave the ~56-file tail as-is for now. Revisit once the
generation system has stabilized (schema + certification gate built and the
96-file rebuild done) — don't spend review effort on it while the system
producing/consuming it is still changing underneath it.
