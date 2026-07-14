// Types only, per issue #8 -- no scenario-generation, grading, or gate
// logic here. Field lists and descriptions mirror docs/data_model.md's
// TestScenario and CertificationResult entities.

/**
 * A test the record must pass before certification. Built from the
 * record's own stated claims, not an externally-imposed generic test.
 *
 * Independence requirement (docs/data_model.md): a scenario must be
 * produced by a separate pass from the one that authored the record's
 * claims -- not the same session/context, ideally not the same model --
 * and framed adversarially ("find where this claim doesn't hold up"), not
 * confirmatorily. A record's author controlling both the claim and the
 * test of the claim is how a broken record passes anyway.
 */
export interface TestScenario {
  /** Identifier. */
  scenario_id: string;
  /** Which claim(s) in the record this scenario tests. */
  derived_from: string;
  /** The situation presented to the specialist. */
  input: string;
  /** What a correct response looks like. */
  expected_behavior: string;
  /**
   * Identifier for the scenario-generation pass/session, distinct from the
   * record's authoring pass -- proves independence rather than asserting it.
   */
  generated_by: string;
}

/**
 * The outcome of grading a record against one TestScenario. Mirrors the
 * embedded shape in infra/schema/specialist-record.schema.json's
 * certification.scenario_results -- lighter than TestScenario itself
 * (no input/expected_behavior/generated_by) since it's a result record,
 * not the scenario definition.
 */
export interface ScenarioResult {
  /** The TestScenario.scenario_id this result is for. */
  scenario_id: string;
  /** Which claim(s) in the record this scenario tested, echoed from the scenario for convenience. */
  derived_from?: string;
  /** Whether the record's response to this scenario was judged correct. */
  passed: boolean;
}

/**
 * Whether a record is certified, and by what independent process.
 * Additive/optional on a SpecialistRecord -- absent on records that
 * predate the certification-gate design until labor-commons-curator's
 * backfill sweep processes them. Never hand-authored: written only by
 * this repo's independent scenario-generation/grading pipeline.
 */
export interface CertificationResult {
  /**
   * Must be true before a record's status can become `published`
   * (pre-publish gate), or before a backfilled record clears `flagged`
   * review.
   */
  passed: boolean;
  /** Per-TestScenario pass/fail. */
  scenario_results: ScenarioResult[];
  /**
   * Identifier for the scenario-generation pass, distinct from whatever
   * authored this record's content -- see TestScenario.generated_by.
   */
  generated_by: string;
  /**
   * Identifier for the grading pass/session -- must be independent of both
   * the authoring pass and the scenario-generation pass, for the same
   * reason TestScenario.generated_by exists.
   */
  graded_by: string;
  /** When certification last ran. */
  certified_at: string;
  /**
   * `pre_publish_gate`: record went through certification before ever
   * publishing. `backfill_sweep`: record predates the gate and was
   * certified retroactively.
   */
  origin: 'pre_publish_gate' | 'backfill_sweep';
}
