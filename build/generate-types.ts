import { compile } from 'json-schema-to-typescript';
import { readFileSync, writeFileSync } from 'fs';

const schema = JSON.parse(readFileSync('src/schema.json', 'utf8'));

compile(schema, 'GeneratedTypes')
  .then(ts => writeFileSync('src/generated-types.ts', ts));
console.log('Types generated');