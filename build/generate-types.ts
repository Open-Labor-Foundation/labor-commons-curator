import { generateTypes } from 'json-schema-to-typescript';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const schemaPath = path.resolve(__dirname, '../src/schemas/example.schema.json');
  const outputPath = path.resolve(__dirname, '../src/generated-types.ts');
  
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  
  const result = await generateTypes({
    schema,
    style: {
      trailingComma: 'es5',
      quote: 'single',
    },
  });
  
  fs.writeFileSync(outputPath, result, 'utf-8');
}

main().catch(console.error);