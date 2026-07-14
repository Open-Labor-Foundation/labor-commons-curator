import { execFile } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
const CLI_PATH = path.join(__dirname, 'certify-record-cli.ts');

const VALID_SPEC_YAML = `
schema_version: "1.0"
kind: agent_definition
freshness:
  last_reviewed: "2026-01-01"
  review_interval_days: 90
  stale_after: "2026-09-01"
  status: current
metadata:
  slug: payroll-coordination-specialist
  name: Payroll Coordination Specialist
  domain_family: finance
  specialty_boundary: Owns payroll run execution end to end.
  status: validated
  created_at: "2026-01-01"
  last_updated_at: "2026-01-01"
purpose:
  summary: Runs and reconciles payroll on a fixed schedule.
scope:
  supported_tasks:
    - process a scheduled payroll run
  common_inputs:
    - payroll calendar
  expected_outputs:
    - payroll run confirmation
knowledge_baseline:
  authority_sources: []
`;

/** A fake OpenAI-compatible /chat/completions server, routing by prompt content the same way certify-record-cli.ts's real calls are shaped. judgeVerdict controls whether the grading call reports pass or fail. */
function startFakeProvider(judgeVerdict: boolean): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { messages?: Array<{ content?: string }> };
        const prompt = parsed.messages?.[0]?.content ?? '';
        let content: string;
        if (prompt.includes('adversarial test scenarios')) {
          content = JSON.stringify([
            { scenario_id: 'scn-001', derived_from: 'scope.supported_tasks[0]', input: 'test input', expected_behavior: 'test behavior' },
          ]);
        } else if (prompt.includes('grading whether')) {
          content = JSON.stringify({ passed: judgeVerdict, reasoning: 'test reasoning' });
        } else {
          content = 'a specialist response';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe('certify-record-cli (real end-to-end, via tsx subprocess)', () => {
  let specPath: string;

  beforeAll(() => {
    specPath = path.join(os.tmpdir(), `certify-record-cli-fixture-${Date.now()}.yaml`);
    fs.writeFileSync(specPath, VALID_SPEC_YAML, 'utf8');
  });

  afterAll(() => {
    fs.rmSync(specPath, { force: true });
  });

  it('exits 0 and prints a passing CertificationResult when the record passes', async () => {
    const provider = await startFakeProvider(true);
    try {
      const { stdout } = await execFileAsync(TSX_BIN, [CLI_PATH, specPath], {
        env: {
          ...process.env,
          CERTIFY_PROVIDER_BASE_URL: provider.url,
          CERTIFY_PROVIDER_API_KEY: 'fake-key',
          CERTIFY_PROVIDER_MODEL: 'fake-model',
        },
      });
      // stdout is the pretty-printed JSON result followed by a human-readable status line, not pure JSON.
      const result = JSON.parse(stdout.match(/\{[\s\S]*\}/)![0]);
      expect(result.passed).toBe(true);
      expect(result.origin).toBe('pre_publish_gate');
    } finally {
      await provider.close();
    }
  }, 30000);

  it('exits 1 when the judge fails the record', async () => {
    const provider = await startFakeProvider(false);
    try {
      await expect(
        execFileAsync(TSX_BIN, [CLI_PATH, specPath], {
          env: {
            ...process.env,
            CERTIFY_PROVIDER_BASE_URL: provider.url,
            CERTIFY_PROVIDER_API_KEY: 'fake-key',
            CERTIFY_PROVIDER_MODEL: 'fake-model',
          },
        })
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      await provider.close();
    }
  }, 30000);

  it('exits 2 when a required env var is missing', async () => {
    await expect(
      execFileAsync(TSX_BIN, [CLI_PATH, specPath], {
        env: { ...process.env, CERTIFY_PROVIDER_BASE_URL: '', CERTIFY_PROVIDER_API_KEY: '', CERTIFY_PROVIDER_MODEL: '' },
      })
    ).rejects.toMatchObject({ code: 2 });
  }, 15000);

  it('exits 2 when no spec path argument is given', async () => {
    await expect(
      execFileAsync(TSX_BIN, [CLI_PATH], {
        env: { ...process.env, CERTIFY_PROVIDER_BASE_URL: 'http://127.0.0.1:1', CERTIFY_PROVIDER_API_KEY: 'x', CERTIFY_PROVIDER_MODEL: 'x' },
      })
    ).rejects.toMatchObject({ code: 2 });
  }, 15000);
});
