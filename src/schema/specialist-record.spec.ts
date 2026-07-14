import * as fs from 'fs';
import * as path from 'path';
import type { SpecialistRecord } from './specialist-record';

const SCHEMA_PATH = path.join(__dirname, 'specialist-record.schema.json');
const TYPES_PATH = path.join(__dirname, 'specialist-record.ts');

describe('generated SpecialistRecord schema and types', () => {
  it('pulled the real schema and generated the types file', () => {
    expect(fs.existsSync(SCHEMA_PATH)).toBe(true);
    expect(fs.existsSync(TYPES_PATH)).toBe(true);
  });

  it('pulled schema is the real labor-commons contract, not a placeholder', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    expect(schema.title).toBe('Labor Commons Specialist Record');
    expect(schema.$id).toContain('Open-Labor-Foundation/labor-commons');
  });

  it('SpecialistRecord covers the schema-required top-level fields', () => {
    // Compile-time check: this only type-checks if every one of these keys
    // exists on the generated type. A regression here (wrong schema pulled,
    // codegen pointed at the wrong file, stale hand-written stand-in) fails
    // `npm test` via a TypeScript error, not just a runtime assertion.
    const sample: Pick<
      SpecialistRecord,
      'schema_version' | 'kind' | 'metadata' | 'purpose' | 'scope' | 'knowledge_baseline'
    > = {
      schema_version: '1.0',
      kind: 'agent_definition',
      metadata: {
        slug: 'example-specialist',
        name: 'Example Specialist',
        domain_family: 'example',
        specialty_boundary: 'x'.repeat(900),
        status: 'validated',
        created_at: '2026-01-01',
        last_updated_at: '2026-01-01',
      },
      purpose: { summary: 'Example purpose.' },
      scope: {
        supported_tasks: ['example task'],
        common_inputs: [],
        expected_outputs: ['example output'],
      },
      knowledge_baseline: {
        // 8 required elements to satisfy the schema's minItems: 8 tuple.
        authority_sources: [
          { source_id: 'src-0', title: 'Source 0', location: 'https://example.com/0' },
          { source_id: 'src-1', title: 'Source 1', location: 'https://example.com/1' },
          { source_id: 'src-2', title: 'Source 2', location: 'https://example.com/2' },
          { source_id: 'src-3', title: 'Source 3', location: 'https://example.com/3' },
          { source_id: 'src-4', title: 'Source 4', location: 'https://example.com/4' },
          { source_id: 'src-5', title: 'Source 5', location: 'https://example.com/5' },
          { source_id: 'src-6', title: 'Source 6', location: 'https://example.com/6' },
          { source_id: 'src-7', title: 'Source 7', location: 'https://example.com/7' },
        ],
      },
    };

    expect(sample.schema_version).toBe('1.0');
    expect(sample.kind).toBe('agent_definition');
  });
});
