#!/usr/bin/env node
'use strict';

// Pulls the canonical SpecialistRecord schema from labor-commons at build
// time. Per docs/architecture.md this repo does not depend on a published
// package -- labor-commons's main branch is the one source of truth.

const fs = require('fs');
const path = require('path');

const SCHEMA_URL =
  'https://raw.githubusercontent.com/Open-Labor-Foundation/labor-commons/main/infra/schema/specialist-record.schema.json';
const OUT_PATH = path.join(__dirname, '..', 'src', 'schema', 'specialist-record.schema.json');

async function main() {
  const res = await fetch(SCHEMA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SCHEMA_URL}: HTTP ${res.status}`);
  }
  const text = await res.text();
  const parsed = JSON.parse(text); // fail fast if labor-commons ever serves something that isn't valid JSON

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(parsed, null, 2) + '\n');
  console.log(`Pulled schema from ${SCHEMA_URL}\n  -> ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
