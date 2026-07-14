import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type { SpecialistManifestContract } from '../vendor/commons-crew-catalog';
import type { ProviderStatus } from '../vendor/commons-crew-core';
import type { MaterializedContent } from './materialize';

const execFileAsync = promisify(execFile);

// materialize()'s real implementation must run under tsx (see
// materialize-harness.ts's header comment for exactly why Jest can't run
// it in-process) -- so this test spawns the real materialize.ts as a real
// `tsx` subprocess, the same real, documented mechanism a genuine caller
// would use, rather than mocking anything.
const TSX_BIN = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
const HARNESS_PATH = path.join(__dirname, 'materialize-harness.ts');

interface HarnessResult {
  ok: boolean;
  materialized?: MaterializedContent;
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

function makeValidManifest(): SpecialistManifestContract {
  return {
    schemaVersion: 'olf.specialist/v1',
    kind: 'specialist',
    identity: {
      slug: 'payroll-coordination-specialist',
      name: 'Payroll Coordination Specialist',
      description: 'Runs and reconciles payroll on a fixed schedule.',
      boundary: { domain: 'finance', constraints: ['Owns payroll run execution end to end.'] },
    },
    readinessState: 'validated',
    supportedTasks: ['process a scheduled payroll run'],
    inputs: [{ name: 'input_1', type: 'context', description: 'payroll calendar', required: true }],
    outputs: [{ name: 'output_1', type: 'artifact', description: 'payroll run confirmation', required: true }],
    permissions: { approvalRequired: true, allow: ['workspace.read'] },
    startupChecks: [
      { id: 'provider-commons-crew-auth', kind: 'provider_auth', target: 'commons-crew', required: true },
      { id: 'approval-hook', kind: 'approval_hook', target: 'commons-keeper', required: true },
    ],
  };
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

async function listMaterializeTempDirs(): Promise<string[]> {
  const entries = await fs.readdir(os.tmpdir());
  return entries.filter((name) => name.startsWith('labor-commons-curator-materialize-'));
}

describe('materialize (real end-to-end, via tsx subprocess)', () => {
  it('drives the real materials.create end to end and returns a genuine MaterializationRecord plus real generated content', async () => {
    const result = await runHarness({ manifest: makeValidManifest(), providerStatus: makeProviderStatus() });

    expect(result.ok).toBe(true);
    const { record, systemPrompt, instructions } = result.materialized!;
    expect(record.status).toBe('ready');
    expect(record.agentCatalogEntryId).toBe(
      'catalog/naics-overlays/curator-generated/payroll-coordination-specialist/spec.yaml'
    );
    expect(record.catalogSourcePath).toContain(record.agentCatalogEntryId);
    expect(record.validationChecks.some((check) => check.name === 'manifest.recorded' && check.ok)).toBe(true);
    expect(record.validationChecks.some((check) => check.name === 'generated.bundle' && check.ok)).toBe(true);
    expect(record.failureCode).toBeNull();
    expect(typeof systemPrompt).toBe('string');
    expect(systemPrompt).toContain('Payroll Coordination Specialist');
    expect(systemPrompt).toContain('Owns payroll run execution end to end.');
    expect(typeof instructions).toBe('string');
  }, 30000);

  it('cleans up the temp directory and generated artifacts after a successful materialization', async () => {
    const result = await runHarness({ manifest: makeValidManifest(), providerStatus: makeProviderStatus() });

    expect(result.ok).toBe(true);
    await expect(fs.access(result.materialized!.record.generatedPath)).rejects.toThrow();
    expect(await listMaterializeTempDirs()).toEqual([]);
  }, 30000);

  it('cleans up the temp directory even when createAppServices itself throws', async () => {
    const result = await runHarness({
      manifest: makeValidManifest(),
      providerFailureMessage: 'simulated provider startup failure',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('simulated provider startup failure');
    expect(await listMaterializeTempDirs()).toEqual([]);
  }, 30000);
});
