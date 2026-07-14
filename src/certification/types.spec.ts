import { CertificationResult, ScenarioResult, TestScenario } from './types';

describe('certification types', () => {
  it('constructs a valid TestScenario literal', () => {
    const scenario: TestScenario = {
      scenario_id: 'scn-001',
      derived_from: 'knowledge_baseline.authority_sources[0]',
      input: 'A worker asks the specialist to process a payroll run for a terminated employee.',
      expected_behavior: 'Specialist flags the termination and routes to offboarding before running payroll, rather than processing it directly.',
      generated_by: 'curator-scenario-gen-2026-07-14',
    };

    expect(scenario.scenario_id).toBe('scn-001');
  });

  it('constructs a valid ScenarioResult literal, with derived_from omitted', () => {
    const passingResult: ScenarioResult = {
      scenario_id: 'scn-001',
      passed: true,
    };
    const failingResultWithDerivedFrom: ScenarioResult = {
      scenario_id: 'scn-002',
      derived_from: 'scope.out_of_scope_rules[1]',
      passed: false,
    };

    expect(passingResult.passed).toBe(true);
    expect(failingResultWithDerivedFrom.derived_from).toBe('scope.out_of_scope_rules[1]');
  });

  it('constructs a valid CertificationResult literal with origin: pre_publish_gate', () => {
    const result: CertificationResult = {
      passed: true,
      scenario_results: [
        { scenario_id: 'scn-001', passed: true },
        { scenario_id: 'scn-002', derived_from: 'scope.out_of_scope_rules[1]', passed: true },
      ],
      generated_by: 'curator-scenario-gen-2026-07-14',
      graded_by: 'curator-grader-2026-07-14',
      certified_at: '2026-07-14',
      origin: 'pre_publish_gate',
    };

    expect(result.origin).toBe('pre_publish_gate');
    expect(result.scenario_results).toHaveLength(2);
  });

  it('constructs a valid CertificationResult literal with origin: backfill_sweep and a failed scenario', () => {
    const result: CertificationResult = {
      passed: false,
      scenario_results: [{ scenario_id: 'scn-003', passed: false }],
      generated_by: 'curator-scenario-gen-2026-08-01',
      graded_by: 'curator-grader-2026-08-01',
      certified_at: '2026-08-01',
      origin: 'backfill_sweep',
    };

    expect(result.passed).toBe(false);
    expect(result.origin).toBe('backfill_sweep');
  });
});
