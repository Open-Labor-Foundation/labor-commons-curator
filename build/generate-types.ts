import { generateTypes } from 'json-schema-to-typescript';
import fs from 'fs';
import path from 'path';

const inputPath = 'src/schemas';
const outputPath = 'src/types';

fs.readdirSync(inputPath).forEach(file => {
  if (file.endsWith('.schema.json')) {
    const schema = JSON.parse(fs.readFileSync(path.join(inputPath, file), 'utf8'));
    const typeName = path.basename(file, '.schema.json').replace(/-/g, '_').toUpperCase() + '_TYPE';
    const ts = generateTypes(schema, { bannerComment: '' });
    fs.writeFileSync(path.join(outputPath, `${typeName}.ts`), ts);
  }
});