import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import type { LlmClient } from '../adjacency/judge-adjacency';
import type { SpecialistRecord } from '../schema/specialist-record';
import type { ProviderAdapter, ProviderStatus } from '../vendor/commons-crew-core';
import { certifyForPublish } from './certify-for-publish';
import type { CertificationResult } from './types';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
const HARNESS_PATH = path.join(__dirname, 'certify-for-publish-harness.ts');

interface HarnessResult {
  ok: boolean;
  result?: CertificationResult;
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

function makeRecord(): SpecialistRecord {
  return {
    schema_version: '1.0',
    kind: 'agent_definition',
    freshness: {
      last_reviewed: '2026-01-01',
      review_interval_days: 90,
      stale_after: '2026-09-01',
      status: 'current',
    },
    metadata: {
      slug: 'payroll-coordination-specialist',
      name: 'Payroll Coordination Specialist',
      domain_family: 'finance',
      specialty_boundary: 'Owns payroll run execution end to end.',
      status: 'validated',
      created_at: '2026-01-01',
      last_updated_at: '2026-01-01',
    },
    purpose: { summary: 'Runs and reconciles payroll on a fixed schedule.' },
    scope: {
      supported_tasks: ['process a scheduled payroll run'] as SpecialistRecord['scope']['supported_tasks'],
      common_inputs: ['payroll calendar'],
      expected_outputs: ['payroll run confirmation'] as SpecialistRecord['scope']['expected_outputs'],
    },
    knowledge_baseline: { authority_sources: [] as unknown as SpecialistRecord['knowledge_baseline']['authority_sources'] },
  } as SpecialistRecord;
}

describe('certifyForPublish', () => {
  it('short-circuits on a scenario-generation failure without ever calling the provider, llm, or judge', async () => {
    const scenarioGenerator: LlmClient = { complete: async () => 'not valid JSON, scenario-gen will fail to parse this' };
    const providerGetStatus = jest.fn();
    const provider: ProviderAdapter = {
      getStatus: providerGetStatus,
      decideIntake: async () => ({}),
      answerChat: async () => ({}),
      createPlan: async () => ({}),
      executeTask: async () => ({}),
      synthesizeRunResult: async () => ({}),
    };
    const llmComplete = jest.fn();
    const judgeComplete = jest.fn();

    await expect(
      certifyForPublish(makeRecord(), {
        scenarioGenerator,
        scenarioGeneratedBy: 'curator-scenario-gen-2026-07-14',
        provider,
        llm: { complete: llmComplete },
        judge: { complete: judgeComplete },
        gradedBy: 'curator-grader-2026-07-14',
      })
    ).rejects.toThrow();

    expect(providerGetStatus).not.toHaveBeenCalled();
    expect(llmComplete).not.toHaveBeenCalled();
    expect(judgeComplete).not.toHaveBeenCalled();
  });
});

// certifyForPublish's full pass-through calls materialize() internally,
// which (like #12/#13) must run under a real tsx subprocess -- Jest's
// ts-jest cannot transpile commons-crew's packages/config
// (import.meta.url vs. Jest's forced CommonJS). The short-circuit test
// above never reaches materialize(), so it runs in-process above; this one
// does, so it's spawned for real via certify-for-publish-harness.ts.
describe('certifyForPublish (full pass-through, real materialization, via tsx subprocess)', () => {
  it('produces a CertificationResult with origin: pre_publish_gate on a full real pass-through', async () => {
    const scenarioGenResponse = JSON.stringify([
      {
        scenario_id: 'scn-001',
        derived_from: 'scope.supported_tasks[0]',
        input: 'A worker asks the specialist to process a payroll run for a terminated employee.',
        expected_behavior: 'Specialist flags the termination and routes to offboarding before running payroll.',
      },
    ]);

    const result = await runHarness({
      record: {
        schema_version: '1.0',
        kind: 'agent_definition',
        freshness: { last_reviewed: '2026-01-01', review_interval_days: 90, stale_after: '2026-09-01', status: 'current' },
        metadata: {
          slug: 'payroll-coordination-specialist',
          name: 'Payroll Coordination Specialist',
          domain_family: 'finance',
          specialty_boundary: 'Owns payroll run execution end to end.',
          status: 'validated',
          created_at: '2026-01-01',
          last_updated_at: '2026-01-01',
        },
        purpose: { summary: 'Runs and reconciles payroll on a fixed schedule.' },
        scope: {
          supported_tasks: ['process a scheduled payroll run'],
          common_inputs: ['payroll calendar'],
          expected_outputs: ['payroll run confirmation'],
        },
        knowledge_baseline: { authority_sources: [] },
      },
      scenarioGenResponse,
      providerStatus: makeProviderStatus(),
      llmResponse: 'I will route this to offboarding before processing payroll.',
      judgeResponse: JSON.stringify({ passed: true, reasoning: 'Correctly routed to offboarding.' }),
      scenarioGeneratedBy: 'curator-scenario-gen-2026-07-14',
      gradedBy: 'curator-grader-2026-07-14',
    });

    expect(result.ok).toBe(true);
    expect(result.result!.origin).toBe('pre_publish_gate');
    expect(result.result!.passed).toBe(true);
    expect(result.result!.scenario_results).toEqual([
      { scenario_id: 'scn-001', derived_from: 'scope.supported_tasks[0]', passed: true },
    ]);
    expect(result.result!.generated_by).toBe('curator-scenario-gen-2026-07-14');
    expect(result.result!.graded_by).toBe('curator-grader-2026-07-14');
  }, 30000);
});
