# labor-commons-curator

The specialist "contract" and an independently graded certification pipeline
for trusting what's in the [labor-commons](https://github.com/Open-Labor-Foundation/labor-commons)
catalog. See `docs/` for the full product/architecture/data-model design.

> See [open-labor-foundation/ARCHITECTURE.md](https://github.com/Open-Labor-Foundation/open-labor-foundation/blob/main/ARCHITECTURE.md)
> for the full ecosystem picture. No architectural shortcoming identified for
> this repo relative to the vision — its independent certification role is
> confirmed permanent by design, for the same reason as commons-keeper.

## Development

Check out the commons-crew submodule (vendored for real reuse of its
manifest parser and materialization -- see
`docs/commons-crew-integration.md`):

```
git submodule update --init
```

Install dependencies:

```
npm install
```

Build project:

```
npm run build
```

Run tests:

```
npm test
```

`npm run build` and `npm test` both pull the canonical `SpecialistRecord`
schema fresh from labor-commons's `main` branch and regenerate
`src/schema/specialist-record.ts` from it before running — this repo has no
published-package dependency on the schema, so both require network access.

## The certification gate, in production

Two real entrypoints, both requiring a TypeScript-aware runtime (`tsx` --
see `docs/commons-crew-integration.md`) and `CERTIFY_PROVIDER_BASE_URL` /
`CERTIFY_PROVIDER_API_KEY` / `CERTIFY_PROVIDER_MODEL` (an
OpenAI-chat-completions-compatible endpoint) as environment variables:

- **`npm run certify-record -- <spec.yaml path>`** — the publish gate.
  Wired into [labor-commons](https://github.com/Open-Labor-Foundation/labor-commons)'s
  own CI: a PR there that sets a record's `metadata.status` to `published`
  runs this and fails the check if the record doesn't pass.
- **`npm run backfill-sweep -- <catalog root> [--limit N] [--out path]`** —
  retroactively certifies records that predate the gate. Runs on a weekly
  schedule (`.github/workflows/backfill-sweep.yml`, also
  manually triggerable), against a bounded batch (`--limit`, default 30)
  prioritizing never-certified records — the full catalog isn't practical
  to run in one pass. Report-only: writes a JSON artifact, never mutates
  the catalog itself.

Both are non-blocking without the secrets configured (a visible warning,
not a failure) — add them as repository secrets on this repo (for the
backfill sweep) and on labor-commons (for the publish gate) to make either
one actually enforce.
