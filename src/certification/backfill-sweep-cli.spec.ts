import { execFile } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
const CLI_PATH = path.join(__dirname, 'backfill-sweep-cli.ts');

function writeSpec(dir: string, slug: string, extra: Record<string, string> = {}): void {
  fs.mkdirSync(dir, { recursive: true });
  const certificationBlock = extra.certification ?? '';
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
      `  name: ${slug}`,
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
      '  common_inputs:',
      '    - some input',
      '  expected_outputs:',
      '    - job output',
      'knowledge_baseline:',
      '  authority_sources: []',
      certificationBlock,
      '',
    ].join('\n'),
    'utf8'
  );
}

function startFakeProvider(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { messages?: Array<{ content?: string }> };
        const prompt = parsed.messages?.[0]?.content ?? '';
        let content: string;
        if (prompt.includes('adversarial test scenarios')) {
          content = JSON.stringify([{ scenario_id: 'scn-001', derived_from: 'x', input: 'in', expected_behavior: 'out' }]);
        } else if (prompt.includes('grading whether')) {
          content = JSON.stringify({ passed: true, reasoning: 'ok' });
        } else {
          content = 'a response';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((res) => server.close(() => res())) });
    });
  });
}

describe('backfill-sweep-cli (real end-to-end, via tsx subprocess)', () => {
  let catalogRoot: string;

  beforeAll(() => {
    catalogRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-cli-fixture-'));
    writeSpec(path.join(catalogRoot, 'catalog', 'naics-overlays', 'x', 'never-certified'), 'never-certified');
    writeSpec(path.join(catalogRoot, 'catalog', 'function-overlays', 'y', 'already-gated'), 'already-gated', {
      certification: [
        'certification:',
        '  passed: true',
        '  scenario_results: []',
        '  generated_by: earlier',
        '  graded_by: earlier',
        '  certified_at: "2026-01-01"',
        '  origin: pre_publish_gate',
      ].join('\n'),
    });
  });

  afterAll(() => {
    fs.rmSync(catalogRoot, { recursive: true, force: true });
  });

  it('skips already-gated records and certifies the rest, reporting to stdout', async () => {
    const provider = await startFakeProvider();
    try {
      const { stdout } = await execFileAsync(TSX_BIN, [CLI_PATH, catalogRoot], {
        env: {
          ...process.env,
          CERTIFY_PROVIDER_BASE_URL: provider.url,
          CERTIFY_PROVIDER_API_KEY: 'fake-key',
          CERTIFY_PROVIDER_MODEL: 'fake-model',
        },
      });

      expect(stdout).toContain('Loaded 2 catalog record(s); 1 eligible for backfill; running 1.');
      const jsonBlock = JSON.parse(stdout.match(/\{[\s\S]*\}/)![0]);
      expect(jsonBlock.catalog_size).toBe(2);
      expect(jsonBlock.eligible_count).toBe(1);
      expect(jsonBlock.report).toHaveLength(1);
      expect(jsonBlock.report[0].slug).toBe('never-certified');
      expect(jsonBlock.report[0].outcome).toBe('newly_passing');
    } finally {
      await provider.close();
    }
  }, 30000);

  it('respects --limit and writes to --out when given', async () => {
    const provider = await startFakeProvider();
    const outPath = path.join(os.tmpdir(), `backfill-cli-out-${Date.now()}.json`);
    try {
      await execFileAsync(TSX_BIN, [CLI_PATH, catalogRoot, '--limit', '0', '--out', outPath], {
        env: {
          ...process.env,
          CERTIFY_PROVIDER_BASE_URL: provider.url,
          CERTIFY_PROVIDER_API_KEY: 'fake-key',
          CERTIFY_PROVIDER_MODEL: 'fake-model',
        },
      });

      const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      expect(written.swept_count).toBe(0);
      expect(written.report).toEqual([]);
    } finally {
      await provider.close();
      fs.rmSync(outPath, { force: true });
    }
  }, 30000);

  it('exits 2 when catalog root argument is missing', async () => {
    await expect(
      execFileAsync(TSX_BIN, [CLI_PATH], {
        env: { ...process.env, CERTIFY_PROVIDER_BASE_URL: 'http://127.0.0.1:1', CERTIFY_PROVIDER_API_KEY: 'x', CERTIFY_PROVIDER_MODEL: 'x' },
      })
    ).rejects.toMatchObject({ code: 2 });
  }, 15000);
});
