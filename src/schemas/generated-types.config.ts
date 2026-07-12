import { generateTypes } from 'json-schema-to-typescript';

export async function generateSchemaTypes() {
  const schemaFiles = await Promise.all([
    require('../schema.json'),
    require('../schemas/example.schema.json')
  ]);

  return Promise.all(schemaFiles.map((schema, index) => 
    generateTypes({
      ...schema,
      $id: `types/v${index + 1}.d.ts`
    })
  ));
}

if (require.main === module) {
  generateSchemaTypes()
    .then(types => process.stdout.write(types.join('\n')))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}