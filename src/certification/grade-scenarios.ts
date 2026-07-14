import type { LlmClient } from '../adjacency/judge-adjacency';
import type { MaterializedContent } from './materialize';
import type { CertificationResult, ScenarioResult, TestScenario } from './types';

export class ScenarioExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioExecutionError';
  }
}

export class ResponseGradingError extends Error {
  constructor(message: string, readonly rawResponse: string) {
    super(message);
    this.name = 'ResponseGradingError';
  }
}

/**
 * Builds the prompt that runs one scenario against a materialized
 * specialist: its real generated system prompt/instructions plus the
 * scenario's input. A direct completion call, not a tool-execution loop --
 * per issue #13's explicit scope, this does not attempt to replicate
 * commons-crew's governed-tool-loop/run/task/session/approval machinery.
 */
export function buildScenarioExecutionPrompt(materialized: MaterializedContent, scenario: TestScenario): string {
  return [
    materialized.systemPrompt,
    materialized.instructions ? `Additional instructions:\n${materialized.instructions}` : '',
    '',
    `A user says: ${scenario.input}`,
    '',
    'Respond as the specialist would, in plain text -- not JSON.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Runs a single scenario's input against a materialized specialist via the
 * injected LlmClient, and returns its raw response for grading.
 */
export async function runScenario(
  materialized: MaterializedContent,
  scenario: TestScenario,
  llm: LlmClient
): Promise<{ response: string }> {
  if (!materialized.systemPrompt) {
    throw new ScenarioExecutionError(
      `Cannot run scenario "${scenario.scenario_id}": materialization has no system prompt (materialization did not reach "ready").`
    );
  }
  const prompt = buildScenarioExecutionPrompt(materialized, scenario);
  const response = await llm.complete(prompt);
  return { response };
}

/**
 * Builds the prompt asking the judge whether a response satisfies a
 * scenario's expected_behavior. Exported separately so prompt content can
 * be asserted on directly without mocking the LLM call.
 */
export function buildJudgePrompt(scenario: TestScenario, response: string): string {
  return [
    'You are grading whether a specialist\'s response to a test scenario satisfies the expected behavior.',
    `Scenario input: ${scenario.input}`,
    `Expected behavior: ${scenario.expected_behavior}`,
    `Specialist's actual response: ${response}`,
    '',
    'Respond with a JSON object only, in this exact shape:',
    '{"passed": true or false, "reasoning": "one-sentence explanation of your verdict"}',
  ].join('\n');
}

function parseJudgeResponse(raw: string): { passed: boolean; reasoning: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new ResponseGradingError('Judge response did not contain a JSON object', raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new ResponseGradingError(`Judge response was not valid JSON: ${(err as Error).message}`, raw);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).passed !== 'boolean' ||
    typeof (parsed as Record<string, unknown>).reasoning !== 'string'
  ) {
    throw new ResponseGradingError('Judge response JSON is missing boolean passed / string reasoning', raw);
  }

  return { passed: (parsed as { passed: boolean }).passed, reasoning: (parsed as { reasoning: string }).reasoning };
}

/**
 * Asks the judge LLM whether a response satisfies a scenario's
 * expected_behavior. Throws ResponseGradingError -- never silently marks
 * the scenario as passed -- on a malformed/unparseable judge response.
 */
export async function judgeResponse(
  scenario: TestScenario,
  response: string,
  judge: LlmClient
): Promise<{ passed: boolean; reasoning: string }> {
  const prompt = buildJudgePrompt(scenario, response);
  const raw = await judge.complete(prompt);
  return parseJudgeResponse(raw);
}

export interface GradeAgainstScenariosDeps {
  /** Runs each scenario's input against the materialized specialist. */
  llm: LlmClient;
  /**
   * Grades each response against its scenario's expected_behavior. Should
   * be a distinct identity/session from both the authoring pass and llm
   * above -- see docs/data_model.md's independence requirement.
   */
  judge: LlmClient;
  /** Identifier for this grading pass, distinct from both authoring and scenario-generation -- stamped onto CertificationResult.graded_by. */
  gradedBy: string;
  /** pre_publish_gate (default) or backfill_sweep -- see CertificationResult.origin. */
  origin?: CertificationResult['origin'];
}

/**
 * The third and final certification pass: runs every scenario against the
 * materialized specialist and grades each response, combining the results
 * into a CertificationResult. No gate enforcement here -- that's issue #14.
 */
export async function gradeAgainstScenarios(
  materialized: MaterializedContent,
  scenarios: TestScenario[],
  deps: GradeAgainstScenariosDeps
): Promise<CertificationResult> {
  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const { response } = await runScenario(materialized, scenario, deps.llm);
    const { passed } = await judgeResponse(scenario, response, deps.judge);
    scenarioResults.push({ scenario_id: scenario.scenario_id, derived_from: scenario.derived_from, passed });
  }

  return {
    passed: scenarioResults.every((result) => result.passed),
    scenario_results: scenarioResults,
    generated_by: scenarios[0]?.generated_by ?? 'unknown',
    graded_by: deps.gradedBy,
    certified_at: new Date().toISOString().slice(0, 10),
    origin: deps.origin ?? 'pre_publish_gate',
  };
}
