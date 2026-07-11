# Interface — Labor Commons Specialist Contract

No specific transport (REST, RPC, etc.) was discussed during idea capture, so
this describes the conceptual operations any implementing platform must
support — not literal endpoint paths. Treat this as the interface contract
between publishers, the catalog, and consumers.

## Publish

**Intent:** submit a new or updated specialist record.

- Input: a `SpecialistRecord` (see `data_model.md`)
- Behavior: runs the record through the **Certification Gate** before
  `status` can move to `published`. Certification here is three independent
  passes, not one process grading itself: (1) authoring, (2) scenario
  generation from the authored claims, (3) grading the materialized record
  against those scenarios — see `data_model.md`'s independence requirement
  on `TestScenario`/`CertificationResult`. A record that fails certification
  is rejected with the failing `TestScenario` results, not silently accepted
  in a lesser state.
- Output: the stored record with `status` and `certification` populated

## Backfill certification sweep (labor-commons-curator)

**Intent:** retroactively certify records that were published before the
certification gate existed.

- Input: none (system-triggered, repo-level batch process — same operational
  pattern as the freshness sweep below, owned by labor-commons-curator)
- Behavior: runs the same independent three-pass certification against each
  pre-gate `published` record. Availability is never blocked on this running
  — a record that fails moves to `flagged` (see `data_model.md`), it is not
  pulled or retired automatically. This is a non-blocking, gradual
  reconciliation of the existing catalog against a gate that didn't exist
  when those records were created, not a mass validation event with a
  removal cliff.
- Output: a report of records certified, and records newly `flagged`

## Match — single (on-demand)

**Intent:** find the best-fit specialist for one task right now.

- Input: a description of the task/need
- Behavior: scores catalog records against the task; if no record clears
  the fit threshold, returns an explicit "no good match" result rather than
  the closest-available record
- Output: either one best-fit `SpecialistRecord` reference, or an honest
  no-match result

## Match — bulk (team assembly)

**Intent:** find a set of best-fit specialists to build a roster in advance.

- Input: a description of the organization/domain needing coverage
- Behavior: same underlying scoring as single match, applied across
  multiple task/domain areas at once; can also report partial coverage
  (some areas matched, some not) rather than an all-or-nothing result
- Output: a set of `SpecialistRecord` references, with any uncovered areas
  explicitly reported as such

## Handoff

**Intent:** signal that a task has fallen outside a specialist's boundary
mid-use, and should move to a neighbor.

- Input: the current `SpecialistRecord.id` and the out-of-boundary situation
- Behavior: resolves against that record's `boundary.handoffs`; if a cycle
  is detected, stop and report rather than looping
- Output: the `target_specialist_id` to hand off to, or an explicit
  "no defined handoff" result

## Flag stale

**Intent:** let any consumer report that a record's output didn't match
current practice.

- Input: `SpecialistRecord.id`, a reason
- Behavior: sets `freshness.flagged_stale_by_use` independent of the
  scheduled sweep
- Output: acknowledgement; does not itself change `status`, only
  `freshness`

## Sweep report

**Intent:** the result of the periodic full-catalog freshness sweep.

- Input: none (system-triggered on a schedule)
- Behavior: walks every record in the catalog in one pass, updating
  `freshness.last_full_sweep_at` and `freshness.sweep_result` for each
- Output: a report of records whose `sweep_result` changed to `stale`
