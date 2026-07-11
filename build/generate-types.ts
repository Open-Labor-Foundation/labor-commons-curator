import { generateTypes } from 'json-schema-to-typescript';
import fs from 'fs';
import path from 'path';

async function main() {
  const schemasDir = path.resolve(__dirname, '../src/schemas');
  const outputDir = path.resolve(__dirname, '../src/types');

  fs.readdirSync(schemasDir).forEach(file => {
    if (file.endsWith('.schema.json')) {
      const schemaPath = path.join(schemasDir, file);
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      const typeName = path.basename(file, '.schema.json').replace(/-/g, '_').toUpperCase();
      
      const ts = generateTypes(schema, {
        style: {
          quote: 'single',
          trailingComma: 'all'
        }
      });

      const outputFilePath = path.join(outputDir, `${typeName}.ts`);
      fs.writeFileSync(outputFilePath, ts);
    }
  });
}

main().catch(console.error);