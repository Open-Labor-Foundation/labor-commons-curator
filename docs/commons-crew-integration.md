# commons-crew integration findings

Grading (issues 9a-9c / #11-#13) needs to materialize a specialist via
commons-crew. This document records what's genuinely reusable from
commons-crew's real source versus what grading has to build new, so that
work isn't a guessed-at interface that drifts from reality.

**Provenance:** the three findings below originate from a prior session's
direct read of commons-crew's source. Before transcribing them here, they
were re-verified against `Open-Labor-Foundation/commons-crew`'s current
`origin/main` (2026-07-14) rather than copied blind — several citations had
drifted, including one substantive rename caused by this same session's own
earlier work on commons-crew (`executeTaskWithGovernedTools` was renamed to
`executeTaskWithAutonomousTools` as part of the autonomous-tool-selection
fix, PR #13). All three findings' *conclusions* still hold; the citations
below are the corrected, currently-accurate ones, not the original ones.

## 1. Manifest parsing is genuinely reusable, no glue needed

`parseSpecialistManifest(source: string, manifestPath: string): SpecialistManifestContract`
at `packages/catalog/src/index.ts:68` in commons-crew. Pure, exported from
`@commons-crew/catalog`'s declared entry point, no service/DB/network
dependency. Converts raw spec.yaml text directly to commons-crew's internal
contract shape.

_Verified unchanged against current `origin/main`._

## 2. Materialization is reusable but requires real glue, not a published package

`createAppServices(config: AppConfig, options?): AppServicesOptions` at
`packages/core/src/index.ts:2066` is the *only* public export of
`packages/core`. Call `.materials.create(agentCatalogEntryId, runId)` (the
`materials` object's `create` method, `packages/core/src/index.ts:6974-6977`)
to materialize. Requirements:

- A constructed `AppConfig`.
- An injected LLM provider via `options.provider`
  (`AppServicesOptions.provider?: AppProvider`,
  `packages/core/src/index.ts:144-149`) — does not have to be commons-crew's
  own Featherless key.
- A **local disk checkout of labor-commons in the exact
  `catalog/naics-overlays/...` layout**, because `materials.create` resolves
  entries by catalog-entry ID after `LocalCatalogService.sync()` file-walks
  that directory (`packages/catalog/src/index.ts:93` class,
  `packages/catalog/src/index.ts:101` `sync()` method) — it does not accept
  an in-memory record directly.

Materialization writes real files to disk as a side effect: `createMaterialization`
(`packages/core/src/index.ts:4328`) writes, among others, `manifest.yaml`
(`:4409`), `provenance.json` (`:4459`), `system-prompt.md` and a runtime
bundle/execution-contract/io-contract (`:4538-4546`).

All `packages/*` are `"private": true` with no compiled output —
commons-crew's own apps import core via relative path
(`../../../packages/core/src/index`), not as an npm dependency. Reuse means
vendoring commons-crew as a sibling checkout and importing raw TypeScript
through a TS-aware runtime (`tsx`), not `npm install @commons-crew/core`.

_Corrected from the original citations: `createAppServices` was cited at
`:2087` (now `:2066`), `materials.create` was cited at `:6870-6873` (now
`:6974-6977`), and the file-write side effects were cited at `:4236-4431`
(now `:4328` onward, through at least `:4546`). All three shifted due to
intervening commits on commons-crew's `main` between the original research
and this transcription; none of the underlying facts changed._

## 3. No reusable "run input against materialized specialist, get response" primitive exists

The closest analog is `executeTaskWithAutonomousTools`
(`packages/core/src/index.ts:3116`) — module-private (an inner function of
`createAppServices`'s factory closure, not exported), only invoked from deep
inside commons-crew's own async run/task/session/plan scheduler
(`packages/core/src/index.ts:3419`), and hardwires a fixed tool list
(`AUTONOMOUS_TOOL_DESCRIPTORS`, `packages/core/src/index.ts:825` — currently
just `search_artifacts`, by commons-crew's own documented scope limitation)
rather than whatever a specialist's own manifest declares. This half of
grading is new work, not reuse — issues 9a-9c (#11-#13) build it directly
against the materialized system prompt/instructions instead of trying to
drive commons-crew's full orchestration surface.

_Corrected from the original citation: the function this finding pointed at,
`executeTaskWithGovernedTools` (originally cited at `:3339`, driven by a
`buildGovernedToolDefinitions` helper), no longer exists under that name.
It was renamed and reworked into `executeTaskWithAutonomousTools` during
this same session's own commons-crew bugfix (PR #13, merged to main): the
hardwired tool list moved from a `buildGovernedToolDefinitions()` call to
the `AUTONOMOUS_TOOL_DESCRIPTORS` constant. The substance of this finding is
unaffected -- the list is still fixed and still not manifest-derived -- only
the name and line number changed._

## Bottom line for issues 9a-9c (#11-#13)

- **#11 (manifest conversion):** reuse `parseSpecialistManifest` directly.
- **#12 (materialization):** reuse `materials.create` via a vendored sibling
  checkout of commons-crew, with an injected provider and a fake/minimal
  catalog layout matching what `LocalCatalogService.sync()` expects on disk.
- **#13 (execution/grading):** build new, working directly from the
  materialized system prompt rather than commons-crew's tool-loop
  orchestration, which is neither exported nor manifest-driven.
