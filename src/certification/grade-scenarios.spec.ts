import type { LlmClient } from '../adjacency/judge-adjacency';
import type { MaterializedContent } from './materialize';
import type { TestScenario } from './types';
import {
  ResponseGradingError,
  ScenarioExecutionError,
  buildJudgePrompt,
  buildScenarioExecutionPrompt,
  gradeAgainstScenarios,
  judgeResponse,
  runScenario,
} from './grade-scenarios';

function makeMaterialized(overrides: Partial<MaterializedContent> = {}): MaterializedContent {
  return {
    record: {
      id: 'mat-1',
      agentCatalogEntryId: 'catalog/naics-overlays/x/payroll-coordination-specialist/spec.yaml',
      runId: null,
      workItemId: null,
      status: 'ready',
      generatedPath: '/tmp/does-not-matter',
      sourceCommitOrRef: 'unknown',
      catalogSourcePath: 'catalog/naics-overlays/x/payroll-coordination-specialist/spec.yaml',
      catalogResolvedRef: 'unknown',
      catalogResolvedCommit: 'unknown',
      provenanceNotes: '',
      failureCode: null,
      failureDetail: null,
      retryable: false,
      recoveryAction: null,
      diagnostics: [],
      validationChecks: [],
      failureReasons: [],
      lastAttemptedAt: '2026-07-14T00:00:00.000Z',
      createdAt: '2026-07-14T00:00:00.000Z',
      readyAt: '2026-07-14T00:00:00.000Z',
    },
    systemPrompt: 'You are Payroll Coordination Specialist. Owns payroll run execution end to end.',
    instructions: 'Always confirm the pay period before running payroll.',
    ...overrides,
  };
}

function makeScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    scenario_id: 'scn-001',
    derived_from: 'scope.supported_tasks[0]',
    input: 'A worker asks the specialist to process a payroll run for a terminated employee.',
    expected_behavior: 'Specialist flags the termination and routes to offboarding before running payroll.',
    generated_by: 'curator-scenario-gen-2026-07-14',
    ...overrides,
  };
}

class FixedLlmClient implements LlmClient {
  constructor(private readonly response: string) {}
  async complete(_prompt: string): Promise<string> {
    return this.response;
  }
}

describe('buildScenarioExecutionPrompt', () => {
  it('includes the real system prompt, instructions, and scenario input', () => {
    const prompt = buildScenarioExecutionPrompt(makeMaterialized(), makeScenario());

    expect(prompt).toContain('You are Payroll Coordination Specialist.');
    expect(prompt).toContain('Always confirm the pay period before running payroll.');
    expect(prompt).toContain('terminated employee');
  });

  it('omits the instructions section when instructions is null', () => {
    const prompt = buildScenarioExecutionPrompt(makeMaterialized({ instructions: null }), makeScenario());

    expect(prompt).not.toContain('Additional instructions');
  });
});

describe('runScenario', () => {
  it('returns the LLM response for a materialized specialist', async () => {
    const llm = new FixedLlmClient('I will route this to offboarding before processing payroll.');

    const result = await runScenario(makeMaterialized(), makeScenario(), llm);

    expect(result.response).toBe('I will route this to offboarding before processing payroll.');
  });

  it('throws ScenarioExecutionError when materialization has no system prompt', async () => {
    const llm = new FixedLlmClient('irrelevant');
    const materialized = makeMaterialized({ systemPrompt: null });

    await expect(runScenario(materialized, makeScenario(), llm)).rejects.toThrow(ScenarioExecutionError);
  });
});

describe('buildJudgePrompt', () => {
  it('includes the scenario input, expected behavior, and the actual response', () => {
    const prompt = buildJudgePrompt(makeScenario(), 'I processed the payroll run without checking termination status.');

    expect(prompt).toContain('terminated employee');
    expect(prompt).toContain('flags the termination');
    expect(prompt).toContain('without checking termination status');
  });
});

describe('judgeResponse', () => {
  it('parses a well-formed passing verdict', async () => {
    const judge = new FixedLlmClient(JSON.stringify({ passed: true, reasoning: 'Correctly routed to offboarding.' }));

    const result = await judgeResponse(makeScenario(), 'routed to offboarding', judge);

    expect(result).toEqual({ passed: true, reasoning: 'Correctly routed to offboarding.' });
  });

  it('parses a well-formed failing verdict', async () => {
    const judge = new FixedLlmClient(JSON.stringify({ passed: false, reasoning: 'Ran payroll without checking termination.' }));

    const result = await judgeResponse(makeScenario(), 'ran payroll directly', judge);

    expect(result).toEqual({ passed: false, reasoning: 'Ran payroll without checking termination.' });
  });

  it('throws ResponseGradingError on a response with no JSON object, not a silent pass', async () => {
    const judge = new FixedLlmClient('Looks fine to me.');

    await expect(judgeResponse(makeScenario(), 'some response', judge)).rejects.toThrow(ResponseGradingError);
  });

  it('throws ResponseGradingError on malformed JSON', async () => {
    const judge = new FixedLlmClient('{"passed": true, "reasoning": }');

    await expect(judgeResponse(makeScenario(), 'some response', judge)).rejects.toThrow(ResponseGradingError);
  });

  it('throws ResponseGradingError when passed is missing or not boolean', async () => {
    const judge = new FixedLlmClient(JSON.stringify({ reasoning: 'no passed field' }));

    await expect(judgeResponse(makeScenario(), 'some response', judge)).rejects.toThrow(ResponseGradingError);
  });
});

describe('gradeAgainstScenarios', () => {
  it('builds a correct CertificationResult when every scenario passes', async () => {
    const scenarios = [makeScenario({ scenario_id: 'scn-001' }), makeScenario({ scenario_id: 'scn-002' })];
    const llm = new FixedLlmClient('routed to offboarding correctly');
    const judge = new FixedLlmClient(JSON.stringify({ passed: true, reasoning: 'Correct.' }));

    const result = await gradeAgainstScenarios(makeMaterialized(), scenarios, {
      llm,
      judge,
      gradedBy: 'curator-grader-2026-07-14',
    });

    expect(result.passed).toBe(true);
    expect(result.scenario_results).toEqual([
      { scenario_id: 'scn-001', derived_from: 'scope.supported_tasks[0]', passed: true },
      { scenario_id: 'scn-002', derived_from: 'scope.supported_tasks[0]', passed: true },
    ]);
    expect(result.graded_by).toBe('curator-grader-2026-07-14');
    expect(result.generated_by).toBe('curator-scenario-gen-2026-07-14');
    expect(result.origin).toBe('pre_publish_gate');
  });

  it('produces a mixed pass/fail result, not all-or-nothing, and passed reflects the worst case', async () => {
    let call = 0;
    const judge: LlmClient = {
      complete: async () => {
        call += 1;
        return JSON.stringify(
          call === 1 ? { passed: true, reasoning: 'First one is fine.' } : { passed: false, reasoning: 'Second one is not.' }
        );
      },
    };
    const llm = new FixedLlmClient('a response');
    const scenarios = [makeScenario({ scenario_id: 'scn-001' }), makeScenario({ scenario_id: 'scn-002' })];

    const result = await gradeAgainstScenarios(makeMaterialized(), scenarios, {
      llm,
      judge,
      gradedBy: 'curator-grader-2026-07-14',
    });

    expect(result.passed).toBe(false);
    expect(result.scenario_results).toEqual([
      { scenario_id: 'scn-001', derived_from: 'scope.supported_tasks[0]', passed: true },
      { scenario_id: 'scn-002', derived_from: 'scope.supported_tasks[0]', passed: false },
    ]);
  });

  it('propagates ResponseGradingError from a malformed judge response rather than treating it as a pass', async () => {
    const llm = new FixedLlmClient('a response');
    const judge = new FixedLlmClient('not json');
    const scenarios = [makeScenario()];

    await expect(
      gradeAgainstScenarios(makeMaterialized(), scenarios, { llm, judge, gradedBy: 'curator-grader-2026-07-14' })
    ).rejects.toThrow(ResponseGradingError);
  });

  it('sets origin to backfill_sweep when explicitly requested', async () => {
    const llm = new FixedLlmClient('a response');
    const judge = new FixedLlmClient(JSON.stringify({ passed: true, reasoning: 'ok' }));

    const result = await gradeAgainstScenarios(makeMaterialized(), [makeScenario()], {
      llm,
      judge,
      gradedBy: 'curator-grader-2026-07-14',
      origin: 'backfill_sweep',
    });

    expect(result.origin).toBe('backfill_sweep');
  });
});
