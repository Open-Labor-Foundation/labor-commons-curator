import { generateTypes } from 'json-schema-to-typescript';
import fs from 'fs';
import path from 'path';

async function main() {
  const schemaPath = path.resolve(__dirname, '../schemas/api-schema.json');
  const outputDir = path.resolve(__dirname, '../src/generated');

  fs.mkdirSync(outputDir, { recursive: true });

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const ts = await generateTypes({
    schema,
    bannerComment: '// THIS FILE IS AUTO-GENERATED - DO NOT EDIT',
    style: {
      tsconfig: path.resolve(__dirname, '../tsconfig.json')
    }
  });

  fs.writeFileSync(
    path.join(outputDir, 'api-types.ts'),
    ts
  );
}

main().catch(err => {
  console.error('Type generation failed:', err);
  process.exit(1);
});