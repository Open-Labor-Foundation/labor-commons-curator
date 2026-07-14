import type { SpecialistRecord } from '../schema/specialist-record';
import { isManifestValidationError } from '../vendor/commons-crew-catalog';
import { toManifestContract } from './to-manifest-contract';

function makeValidRecord(): SpecialistRecord {
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
      supported_tasks: ['process a scheduled payroll run', 'reconcile payroll variances'] as SpecialistRecord['scope']['supported_tasks'],
      common_inputs: ['payroll calendar', 'employee roster'],
      expected_outputs: ['payroll run confirmation', 'variance report'] as SpecialistRecord['scope']['expected_outputs'],
      out_of_scope_rules: ['does not set benefits eligibility'],
    },
    knowledge_baseline: {
      authority_sources: Array.from({ length: 8 }, (_, i) => ({
        source_id: `src-${i}`,
        title: `Source ${i}`,
        location: `https://example.com/${i}`,
      })) as unknown as SpecialistRecord['knowledge_baseline']['authority_sources'],
    },
  } as SpecialistRecord;
}

describe('toManifestContract', () => {
  it('converts a real, valid SpecialistRecord into a correctly-mapped SpecialistManifestContract via the real vendored parser', () => {
    const record = makeValidRecord();

    const contract = toManifestContract(record);

    expect(contract.schemaVersion).toBe('olf.specialist/v1');
    expect(contract.kind).toBe('specialist');
    expect(contract.identity).toEqual({
      slug: 'payroll-coordination-specialist',
      name: 'Payroll Coordination Specialist',
      description: 'Runs and reconciles payroll on a fixed schedule.',
      boundary: {
        domain: 'finance',
        constraints: ['Owns payroll run execution end to end.', 'does not set benefits eligibility'],
      },
    });
    expect(contract.readinessState).toBe('validated');
    expect(contract.supportedTasks).toEqual(['process a scheduled payroll run', 'reconcile payroll variances']);
    expect(contract.inputs).toEqual([
      { name: 'input_1', type: 'context', description: 'payroll calendar', required: true },
      { name: 'input_2', type: 'context', description: 'employee roster', required: true },
    ]);
    expect(contract.outputs).toEqual([
      { name: 'output_1', type: 'artifact', description: 'payroll run confirmation', required: true },
      { name: 'output_2', type: 'artifact', description: 'variance report', required: true },
    ]);
    expect(contract.permissions).toEqual({ approvalRequired: true, allow: ['workspace.read'] });
    expect(Array.isArray(contract.startupChecks)).toBe(true);
    expect(contract.startupChecks.length).toBeGreaterThan(0);
  });

  it('throws the real, typed ManifestValidationError on a malformed record, not an uncaught exception', () => {
    // labor-commons's own schema allows an empty common_inputs array (no
    // minItems), but commons-crew's legacy-contract parser requires at
    // least one entry -- a genuine cross-repo contract mismatch, and
    // exactly the kind of "malformed from commons-crew's perspective"
    // record this test exercises for real.
    const record = makeValidRecord();
    record.scope.common_inputs = [];

    let caught: unknown;
    try {
      toManifestContract(record);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(isManifestValidationError(caught)).toBe(true);
    if (isManifestValidationError(caught)) {
      expect(caught.issues.length).toBeGreaterThan(0);
      expect(caught.issues.some((issue) => issue.path.includes('scope'))).toBe(true);
    }
  });
});
