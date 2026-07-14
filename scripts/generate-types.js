#!/usr/bin/env node
'use strict';

// Generates TypeScript types from the schema pulled by pull-schema.js.
// Run after pull-schema.js, never independently -- the schema file it reads
// is itself gitignored and only exists once that step has run.

const fs = require('fs');
const path = require('path');
const { compile } = require('json-schema-to-typescript');

const SCHEMA_PATH = path.join(__dirname, '..', 'src', 'schema', 'specialist-record.schema.json');
const OUT_PATH = path.join(__dirname, '..', 'src', 'schema', 'specialist-record.ts');

async function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`${SCHEMA_PATH} not found -- run "npm run pull-schema" first`);
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  // json-schema-to-typescript names the root interface after the schema's
  // own `title`, falling back to `$id`, ignoring the explicit name argument
  // below unless both are absent -- drop them so the generated type is
  // reliably named `SpecialistRecord`. Neither is needed for compilation:
  // this schema has no internal $ref that depends on $id for resolution.
  delete schema.title;
  delete schema.$id;

  const ts = await compile(schema, 'SpecialistRecord', {
    bannerComment:
      '/**\n * Generated from labor-commons infra/schema/specialist-record.schema.json.\n * Do not edit by hand -- run `npm run build` to regenerate.\n */',
    additionalProperties: false,
    style: { singleQuote: true },
  });

  fs.writeFileSync(OUT_PATH, ts);
  console.log(`Generated types from ${path.relative(process.cwd(), SCHEMA_PATH)}\n  -> ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
