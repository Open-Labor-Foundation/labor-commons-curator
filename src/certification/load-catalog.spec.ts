import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCatalog } from './load-catalog';

function writeSpec(dir: string, slug: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'spec.yaml'),
    [
      'schema_version: "1.0"',
      'kind: agent_definition',
      'freshness:',
      '  last_reviewed: "2026-01-01"',
      '  review_interval_days: 90',
      '  stale_after: "2026-09-01"',
      '  status: current',
      'metadata:',
      `  slug: ${slug}`,
      `  name: ${name}`,
      '  domain_family: finance',
      '  specialty_boundary: Owns the job end to end.',
      '  status: validated',
      '  created_at: "2026-01-01"',
      '  last_updated_at: "2026-01-01"',
      'purpose:',
      '  summary: Does the job.',
      'scope:',
      '  supported_tasks:',
      '    - do the job',
      '  common_inputs: []',
      '  expected_outputs:',
      '    - job output',
      'knowledge_baseline:',
      '  authority_sources: []',
      '',
    ].join('\n'),
    'utf8'
  );
}

describe('loadCatalog', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'load-catalog-test-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('loads spec.yaml files from both naics-overlays and function-overlays', () => {
    writeSpec(path.join(root, 'catalog', 'naics-overlays', 'some-industry', 'naics-specialist'), 'naics-specialist', 'Naics Specialist');
    writeSpec(path.join(root, 'catalog', 'function-overlays', 'some-domain', 'function-specialist'), 'function-specialist', 'Function Specialist');

    const entries = loadCatalog(root);

    expect(entries).toHaveLength(2);
    const slugs = entries.map((e) => e.record.metadata.slug).sort();
    expect(slugs).toEqual(['function-specialist', 'naics-specialist']);
  });

  it('returns an empty array when neither overlay directory exists', () => {
    expect(loadCatalog(root)).toEqual([]);
  });

  it('skips a malformed spec.yaml rather than throwing', () => {
    const goodDir = path.join(root, 'catalog', 'naics-overlays', 'x', 'good-specialist');
    writeSpec(goodDir, 'good-specialist', 'Good Specialist');
    const badDir = path.join(root, 'catalog', 'naics-overlays', 'x', 'bad-specialist');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, 'spec.yaml'), ': this is not valid yaml: [[[', 'utf8');

    const entries = loadCatalog(root);

    expect(entries).toHaveLength(1);
    expect(entries[0].record.metadata.slug).toBe('good-specialist');
  });
});
