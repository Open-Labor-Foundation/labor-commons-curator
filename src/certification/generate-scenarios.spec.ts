import type { SpecialistRecord } from '../schema/specialist-record';
import type { LlmClient } from '../adjacency/judge-adjacency';
import { ScenarioGenerationError, buildScenarioGenerationPrompt, generateScenarios } from './generate-scenarios';

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
      specialty_boundary: 'Owns payroll run execution; does not handle benefits enrollment decisions.',
      status: 'validated',
      created_at: '2026-01-01',
      last_updated_at: '2026-01-01',
    },
    purpose: { summary: 'Runs payroll.' },
    scope: {
      supported_tasks: ['process a scheduled payroll run', 'reconcile payroll variances'] as SpecialistRecord['scope']['supported_tasks'],
      common_inputs: [],
      expected_outputs: ['payroll run confirmation'] as SpecialistRecord['scope']['expected_outputs'],
      out_of_scope_rules: ['does not set benefits eligibility'],
    },
    knowledge_baseline: { authority_sources: [] as unknown as SpecialistRecord['knowledge_baseline']['authority_sources'] },
  } as SpecialistRecord;
}

class FakeLlmClient implements LlmClient {
  constructor(private readonly response: string) {}
  async complete(_prompt: string): Promise<string> {
    return this.response;
  }
}

describe('buildScenarioGenerationPrompt', () => {
  it('is framed adversarially, explicitly rejecting a confirmatory framing', () => {
    const prompt = buildScenarioGenerationPrompt(makeRecord());

    expect(prompt).toMatch(/do NOT hold up/i);
    expect(prompt).toMatch(/not to confirm/i);
    expect(prompt).toMatch(/do not write scenarios the specialist obviously passes/i);
  });

  it('includes the record boundary, supported tasks, and out_of_scope_rules', () => {
    const prompt = buildScenarioGenerationPrompt(makeRecord());

    expect(prompt).toContain('Owns payroll run execution');
    expect(prompt).toContain('process a scheduled payroll run');
    expect(prompt).toContain('does not set benefits eligibility');
  });
});

describe('generateScenarios', () => {
  it('parses a well-formed response into TestScenario[] with generated_by populated', async () => {
    const raw = JSON.stringify([
      {
        scenario_id: 'scn-001',
        derived_from: 'scope.out_of_scope_rules[0]',
        input: 'Worker asks the specialist to approve a benefits eligibility change mid payroll-run.',
        expected_behavior: 'Specialist declines and routes to benefits administration rather than deciding eligibility itself.',
      },
    ]);
    const llm = new FakeLlmClient(raw);

    const scenarios = await generateScenarios(makeRecord(), llm, 'curator-scenario-gen-2026-07-14');

    expect(scenarios).toEqual([
      {
        scenario_id: 'scn-001',
        derived_from: 'scope.out_of_scope_rules[0]',
        input: 'Worker asks the specialist to approve a benefits eligibility change mid payroll-run.',
        expected_behavior: 'Specialist declines and routes to benefits administration rather than deciding eligibility itself.',
        generated_by: 'curator-scenario-gen-2026-07-14',
      },
    ]);
  });

  it('parses multiple scenarios and stamps the same generated_by on all of them', async () => {
    const raw = JSON.stringify([
      { scenario_id: 'scn-001', derived_from: 'a', input: 'in-1', expected_behavior: 'out-1' },
      { scenario_id: 'scn-002', derived_from: 'b', input: 'in-2', expected_behavior: 'out-2' },
    ]);
    const llm = new FakeLlmClient(raw);

    const scenarios = await generateScenarios(makeRecord(), llm, 'pass-xyz');

    expect(scenarios.every((s) => s.generated_by === 'pass-xyz')).toBe(true);
    expect(scenarios).toHaveLength(2);
  });

  it('throws ScenarioGenerationError on a response with no JSON array, rather than returning []', async () => {
    const llm = new FakeLlmClient('I could not think of any good scenarios for this one.');

    await expect(generateScenarios(makeRecord(), llm, 'pass-xyz')).rejects.toThrow(ScenarioGenerationError);
  });

  it('throws ScenarioGenerationError on malformed JSON', async () => {
    const llm = new FakeLlmClient('[{"scenario_id": "scn-001", "input": ]');

    await expect(generateScenarios(makeRecord(), llm, 'pass-xyz')).rejects.toThrow(ScenarioGenerationError);
  });

  it('throws ScenarioGenerationError when an entry is missing required fields', async () => {
    const raw = JSON.stringify([{ scenario_id: 'scn-001', input: 'in-1' }]);
    const llm = new FakeLlmClient(raw);

    await expect(generateScenarios(makeRecord(), llm, 'pass-xyz')).rejects.toThrow(ScenarioGenerationError);
  });
});
