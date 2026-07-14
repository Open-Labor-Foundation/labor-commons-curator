import type { SpecialistRecord } from '../schema/specialist-record';
import type { LlmClient } from '../adjacency/judge-adjacency';
import type { TestScenario } from './types';

export class ScenarioGenerationError extends Error {
  constructor(message: string, readonly rawResponse: string) {
    super(message);
    this.name = 'ScenarioGenerationError';
  }
}

/**
 * Builds the prompt for the scenario-generation pass. Framed adversarially
 * ("find where this claim doesn't hold up") per docs/risks.md's
 * independence requirement -- this pass's job is to find gaps, not to
 * confirm the record is good. Exported separately from generateScenarios
 * so prompt content can be asserted on without mocking the LLM call.
 */
export function buildScenarioGenerationPrompt(record: SpecialistRecord): string {
  return [
    'You are generating adversarial test scenarios for a specialist record.',
    'This pass is independent from whatever authored the record\'s claims. Your job is to find where this record\'s claims do NOT hold up -- not to confirm that the record is good.',
    'Do not write scenarios the specialist obviously passes. Look for edge cases, boundary violations, and situations the stated scope and boundary do not clearly cover.',
    '',
    `Record: ${record.metadata.slug}`,
    `specialty_boundary: ${record.metadata.specialty_boundary}`,
    `supported_tasks: ${record.scope.supported_tasks.join('; ')}`,
    record.scope.out_of_scope_rules && record.scope.out_of_scope_rules.length > 0
      ? `out_of_scope_rules: ${record.scope.out_of_scope_rules.join('; ')}`
      : '',
    '',
    'For each scenario, derive it from a specific claim in supported_tasks or specialty_boundary above -- do not invent scenarios unrelated to what the record actually claims.',
    'Respond with a JSON array only, one object per scenario, in this exact shape:',
    '[{"scenario_id": "...", "derived_from": "...", "input": "...", "expected_behavior": "..."}]',
    'Do not include a generated_by field -- that is set by the caller, not you.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Extracts and validates the JSON array from a raw LLM response. Throws
 * ScenarioGenerationError -- never silently returns [] -- when the
 * response isn't parseable or isn't shaped as expected.
 */
function parseScenarioResponse(raw: string): Omit<TestScenario, 'generated_by'>[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new ScenarioGenerationError('LLM response did not contain a JSON array', raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new ScenarioGenerationError(`LLM response was not valid JSON: ${(err as Error).message}`, raw);
  }

  if (!Array.isArray(parsed)) {
    throw new ScenarioGenerationError('LLM response JSON was not an array', raw);
  }

  return parsed.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new ScenarioGenerationError(`LLM response entry at index ${i} is not an object`, raw);
    }
    const { scenario_id, derived_from, input, expected_behavior } = entry as Record<string, unknown>;
    if (
      typeof scenario_id !== 'string' ||
      typeof derived_from !== 'string' ||
      typeof input !== 'string' ||
      typeof expected_behavior !== 'string'
    ) {
      throw new ScenarioGenerationError(
        `LLM response entry at index ${i} is missing scenario_id/derived_from/input/expected_behavior`,
        raw
      );
    }
    return { scenario_id, derived_from, input, expected_behavior };
  });
}

/**
 * Generates adversarial test scenarios for a record via the injected
 * LlmClient -- the scenario-generation pass, independent from whatever
 * authored the record. generatedBy is this pass's own identity (distinct
 * from the authoring pass), stamped onto every returned scenario so
 * independence is auditable. No grading and no gate enforcement here --
 * both are separate, later work.
 */
export async function generateScenarios(
  record: SpecialistRecord,
  llm: LlmClient,
  generatedBy: string
): Promise<TestScenario[]> {
  const prompt = buildScenarioGenerationPrompt(record);
  const raw = await llm.complete(prompt);
  const scenarios = parseScenarioResponse(raw);
  return scenarios.map((scenario) => ({ ...scenario, generated_by: generatedBy }));
}
