# labor-commons-curator

The specialist "contract" and an independently graded certification pipeline
for trusting what's in the [labor-commons](https://github.com/Open-Labor-Foundation/labor-commons)
catalog. See `docs/` for the full product/architecture/data-model design.

> See [open-labor-foundation/ARCHITECTURE.md](https://github.com/Open-Labor-Foundation/open-labor-foundation/blob/main/ARCHITECTURE.md)
> for the full ecosystem picture. No architectural shortcoming identified for
> this repo relative to the vision — its independent certification role is
> confirmed permanent by design, for the same reason as commons-keeper.

## Development

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
