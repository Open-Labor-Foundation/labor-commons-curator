import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import type { SpecialistRecord } from '../schema/specialist-record';
import type { ProviderStatus } from '../vendor/commons-crew-core';
import type { BackfillSweepEntry } from './backfill-sweep';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
const HARNESS_PATH = path.join(__dirname, 'backfill-sweep-harness.ts');

interface HarnessResult {
  ok: boolean;
  report?: BackfillSweepEntry[];
  message?: string;
}

async function runHarness(input: Record<string, unknown>): Promise<HarnessResult> {
  const promise = execFileAsync(TSX_BIN, [HARNESS_PATH], { maxBuffer: 10 * 1024 * 1024 });
  const child = (promise as unknown as { child: import('child_process').ChildProcess }).child;
  child.stdin!.write(JSON.stringify(input));
  child.stdin!.end();
  const { stdout } = await promise;
  return JSON.parse(stdout) as HarnessResult;
}

function makeProviderStatus(): ProviderStatus {
  return {
    id: 'mock-provider',
    displayName: 'Mock Provider',
    model: 'mock-model',
    installed: true,
    authenticated: true,
    authMode: 'api_key',
    capabilities: {
      providerIdentity: 'mock',
      supportsStreaming: false,
      supportsStructuredOutputs: false,
      supportsToolCalls: false,
      supportsFileIo: false,
      supportsCancellation: false,
    },
    diagnostics: { checkedAt: new Date().toISOString(), readiness: { ok: true } },
  };
}

function baseRecord(slug: string, name: string): Record<string, unknown> {
  return {
    schema_version: '1.0',
    kind: 'agent_definition',
    freshness: { last_reviewed: '2026-01-01', review_interval_days: 90, stale_after: '2026-09-01', status: 'current' },
    metadata: {
      slug,
      name,
      domain_family: 'finance',
      specialty_boundary: `Owns ${name}'s work end to end.`,
      status: 'validated',
      created_at: '2026-01-01',
      last_updated_at: '2026-01-01',
    },
    purpose: { summary: `${name} does its job.` },
    scope: {
      supported_tasks: ['do the job'],
      common_inputs: ['some input'],
      expected_outputs: ['some output'],
    },
    knowledge_baseline: { authority_sources: [] },
  };
}

function scenarioGenResponseFor(scenarioId: string) {
  return JSON.stringify([
    {
      scenario_id: scenarioId,
      derived_from: 'scope.supported_tasks[0]',
      input: 'A worker asks the specialist to do the job.',
      expected_behavior: 'Specialist does the job correctly.',
    },
  ]);
}

describe('sweepBackfillCertification (real end-to-end, via tsx subprocess)', () => {
  it('separates newly-passing from newly-failing, skips already-gated records, and reports errors without aborting the sweep', async () => {
    const passingRecord = baseRecord('passing-specialist', 'Passing Specialist');
    const failingRecord = baseRecord('failing-specialist', 'Failing Specialist');
    const erroringRecord = {
      ...baseRecord('erroring-specialist', 'Erroring Specialist'),
      scope: {
        supported_tasks: ['do the job'],
        common_inputs: [], // schema-valid on our side, but commons-crew's legacy parser requires minItems 1 -- real cross-repo mismatch from #11, reused here to force a genuine pipeline error.
        expected_outputs: ['some output'],
      },
    };
    const alreadyGatedRecord = {
      ...baseRecord('already-gated-specialist', 'Already Gated Specialist'),
      certification: {
        passed: true,
        scenario_results: [],
        generated_by: 'earlier-pass',
        graded_by: 'earlier-grader',
        certified_at: '2026-01-01',
        origin: 'pre_publish_gate',
      },
    };

    const result = await runHarness({
      catalog: [passingRecord, failingRecord, erroringRecord, alreadyGatedRecord],
      scenarioGenResponses: [
        scenarioGenResponseFor('scn-passing'),
        scenarioGenResponseFor('scn-failing'),
        scenarioGenResponseFor('scn-erroring'),
      ],
      providerStatus: makeProviderStatus(),
      llmResponses: ['I did the job correctly.', 'I did the job incorrectly.'],
      judgeResponses: [
        JSON.stringify({ passed: true, reasoning: 'Correct.' }),
        JSON.stringify({ passed: false, reasoning: 'Incorrect.' }),
      ],
      scenarioGeneratedBy: 'curator-scenario-gen-2026-07-14',
      gradedBy: 'curator-grader-2026-07-14',
    });

    expect(result.ok).toBe(true);
    const report = result.report!;

    // The already-gated record never appears in the report at all -- skipped entirely.
    expect(report.find((entry) => entry.slug === 'already-gated-specialist')).toBeUndefined();
    expect(report).toHaveLength(3);

    const passingEntry = report.find((entry) => entry.slug === 'passing-specialist')!;
    expect(passingEntry.outcome).toBe('newly_passing');
    expect(passingEntry.result!.passed).toBe(true);
    expect(passingEntry.result!.origin).toBe('backfill_sweep');
    expect(passingEntry.error).toBeNull();

    const failingEntry = report.find((entry) => entry.slug === 'failing-specialist')!;
    expect(failingEntry.outcome).toBe('newly_failing');
    expect(failingEntry.result!.passed).toBe(false);
    expect(failingEntry.result!.origin).toBe('backfill_sweep');

    const erroringEntry = report.find((entry) => entry.slug === 'erroring-specialist')!;
    expect(erroringEntry.outcome).toBe('errored');
    expect(erroringEntry.result).toBeNull();
    expect(erroringEntry.error).toBeTruthy();
  }, 30000);
});
