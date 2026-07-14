import type { LlmClient } from '../adjacency/judge-adjacency';
import { generateScenarios } from './generate-scenarios';
import { gradeAgainstScenarios } from './grade-scenarios';
import { materialize, MaterializeDeps } from './materialize';
import { toManifestContract } from './to-manifest-contract';
import type { CertificationResult } from './types';
import type { SpecialistRecord } from '../schema/specialist-record';

export interface CertifyForPublishDeps {
  /** Drives scenario-generation (#9) -- the independent adversarial pass. */
  scenarioGenerator: LlmClient;
  /** Identifier for the scenario-generation pass, distinct from whatever authored the record. */
  scenarioGeneratedBy: string;
  /** Injected provider for materialization (#12) -- never commons-crew's own key. */
  provider: MaterializeDeps['provider'];
  /** NAICS-overlay section directory name used for the synthetic catalog entry during materialization. */
  section?: MaterializeDeps['section'];
  /** Runs each scenario's input against the materialized specialist (#13). */
  llm: LlmClient;
  /** Grades each response against its scenario's expected_behavior (#13) -- must be independent of scenarioGenerator and of whatever authored the record. */
  judge: LlmClient;
  /** Identifier for the grading pass, distinct from authoring and scenario-generation. */
  gradedBy: string;
}

/**
 * The real publish gate described in docs/api.md's Publish operation:
 * scenario-generation (#9), then manifest conversion (#11) + materialization
 * (#12) + execution/grading (#13) in sequence, producing a
 * CertificationResult with origin: "pre_publish_gate".
 *
 * Does not mutate record.metadata.status itself -- returns the result for
 * a future publish-flow (not part of this train) to act on. If
 * scenario-generation fails, this rejects immediately and never reaches
 * manifest conversion, materialization, or grading -- there is nothing to
 * grade a record against without scenarios, so short-circuiting is
 * correct, not an oversight.
 */
export async function certifyForPublish(record: SpecialistRecord, deps: CertifyForPublishDeps): Promise<CertificationResult> {
  const scenarios = await generateScenarios(record, deps.scenarioGenerator, deps.scenarioGeneratedBy);

  const manifest = toManifestContract(record);
  const materialized = await materialize(manifest, { provider: deps.provider, section: deps.section });

  return gradeAgainstScenarios(materialized, scenarios, {
    llm: deps.llm,
    judge: deps.judge,
    gradedBy: deps.gradedBy,
    origin: 'pre_publish_gate',
  });
}
