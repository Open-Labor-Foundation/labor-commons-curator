# Data Model — Labor Commons Specialist Contract

Field names below are proposals derived independently from the captured idea,
for comparison against whatever field names already exist in the current
catalog — they are intentionally not copied from any existing implementation.

## Entity: SpecialistRecord

The core entity. One per specialist.

| Field | Description |
|---|---|
| `id` | Stable unique identifier for the record |
| `name` | Plain-language name of the specialist |
| `description` | What it does, in plain terms |
| `knowledge` | See **KnowledgeClaim** (one or more) |
| `boundary.in_scope` | What the specialist is allowed / expected to handle |
| `boundary.out_of_scope` | What it explicitly does not handle |
| `boundary.handoffs` | See **HandoffRule** (zero or more) |
| `certification` | See **CertificationResult** |
| `freshness` | See **FreshnessState** |
| `seed_provenance` | See **SeedProvenance** (nullable — only present if the record originated from the initial seed) |
| `status` | `draft` \| `certified` \| `published` \| `flagged` \| `stale` \| `retired` |
| `schema_version` | Which version of this contract the record conforms to |

**On `flagged`:** a record that predates the certification gate and fails its
retroactive backfill certification moves to `flagged`, not `retired` —
availability is not pulled on a failed backfill result. It stays visible with
its `certification.passed = false` and `origin = backfill_sweep` state
attached, so consumers can see it's under review rather than trusting it
silently. Retirement is a separate, later decision, not automatic.

## Entity: KnowledgeClaim

A discrete piece of what the specialist knows, and where that knowledge comes
from.

| Field | Description |
|---|---|
| `topic` | What this claim of knowledge covers |
| `source_reference` | Attributable, real source backing the claim (not a description of a source — the actual reference) |
| `source_checked_at` | When this specific source was last confirmed current |

## Entity: HandoffRule

Defines where a task goes when it falls outside this record's boundary.

| Field | Description |
|---|---|
| `trigger` | What kind of out-of-boundary situation this rule applies to |
| `target_specialist_id` | The neighboring `SpecialistRecord.id` to hand off to |

Self-referential: `target_specialist_id` points to another `SpecialistRecord`.
Consumers should be able to detect handoff cycles (A → B → A) rather than
loop.

## Entity: TestScenario

A test the record must pass before certification. Built from the record's own
stated claims (`knowledge`, `boundary.in_scope`), not an externally-imposed
generic test.

**Independence requirement:** a scenario must be produced by a separate pass
from the one that authored the record's claims — not the same session/context,
ideally not the same model — and framed adversarially ("find where this claim
doesn't hold up"), not confirmatorily. This is load-bearing, not a nice-to-
have: a record's author controlling both the claim and the test of the claim
is how a broken record passes anyway. `generated_by` exists specifically so
this independence is auditable, not just assumed.

| Field | Description |
|---|---|
| `scenario_id` | Identifier |
| `derived_from` | Which claim(s) in the record this scenario tests |
| `input` | The situation presented to the specialist |
| `expected_behavior` | What a correct response looks like |
| `generated_by` | Identifier for the scenario-generation pass/session, distinct from the record's authoring pass — proves independence rather than asserting it |

## Entity: CertificationResult

| Field | Description |
|---|---|
| `passed` | Boolean — must be true before `status` can become `published` (pre-publish gate), or before a backfilled record clears `flagged` review |
| `scenario_results` | Per-`TestScenario` pass/fail |
| `graded_by` | Identifier for the grading pass/session — must be independent of both the authoring pass and the scenario-generation pass, for the same reason `TestScenario.generated_by` exists |
| `certified_at` | When certification last ran |
| `origin` | `pre_publish_gate` (record went through certification before ever publishing) \| `backfill_sweep` (record predates the gate and was certified retroactively) |

## Entity: FreshnessState

| Field | Description |
|---|---|
| `last_full_sweep_at` | When the catalog-wide sweep last covered this record |
| `sweep_result` | `current` \| `stale` from the last sweep |
| `flagged_stale_by_use` | Boolean — set by any consumer in the moment, independent of the sweep |
| `flagged_at` | When an in-the-moment flag was raised, if any |
| `flag_reason` | Free text — what the flagging consumer observed |

## Entity: SeedProvenance

Only present on records from the initial catalog. Marks origin; does not
affect ongoing structure or growth.

| Field | Description |
|---|---|
| `source` | `naics_seed` |
| `naics_code` | The classification code this record was curated from |
| `automation_fit_rationale` | Why this code was judged a good candidate (e.g. knowledge-heavy, process-driven) |

## Relationships

```
SpecialistRecord 1───* KnowledgeClaim
SpecialistRecord 1───* HandoffRule ──> SpecialistRecord (self-referential)
SpecialistRecord 1───* TestScenario
SpecialistRecord 1───1 CertificationResult
SpecialistRecord 1───1 FreshnessState
SpecialistRecord 1───0..1 SeedProvenance
```
