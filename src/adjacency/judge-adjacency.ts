import type { SpecialistRecord } from '../schema/specialist-record';

/**
 * A minimal inference dependency, injected rather than hardcoded, so this
 * module never binds to a specific provider/API. Any real integration
 * (Featherless, OpenAI-compatible, etc.) is a separate concern that
 * implements this shape.
 */
export interface LlmClient {
  complete(prompt: string): Promise<string>;
}

export interface AdjacencySelection {
  /** metadata.slug of a candidate judged genuinely adjacent to the target record. */
  slug: string;
  /** One-sentence reason a task could reasonably hand off between the two. */
  reason: string;
}

export interface AdjacencyJudgment {
  /** metadata.slug of the record being judged. */
  slug: string;
  /** The subset of candidates the LLM judged genuinely adjacent, with reasoning. */
  selected: AdjacencySelection[];
}

export class AdjacencyJudgmentError extends Error {
  constructor(message: string, readonly rawResponse: string) {
    super(message);
    this.name = 'AdjacencyJudgmentError';
  }
}

/**
 * Builds the prompt describing the target record's boundary/scope and the
 * candidate pool, asking the LLM to select which candidates are genuinely
 * adjacent. Exported separately from judgeAdjacency so prompt content can be
 * asserted on directly without mocking the LLM call.
 */
export function buildAdjacencyPrompt(record: SpecialistRecord, candidates: SpecialistRecord[]): string {
  const candidateList = candidates
    .map(
      (candidate) =>
        `- slug: ${candidate.metadata.slug}\n  name: ${candidate.metadata.name}\n  specialty_boundary: ${candidate.metadata.specialty_boundary}`
    )
    .join('\n');

  return [
    'You are judging adjacency between one specialist record and a pool of candidate specialists.',
    'Two specialists are adjacent if a task could reasonably hand off between them -- their boundaries meet, not just their general domain.',
    '',
    `Target specialist: ${record.metadata.slug}`,
    `Target specialty_boundary: ${record.metadata.specialty_boundary}`,
    `Target supported_tasks: ${record.scope.supported_tasks.join('; ')}`,
    '',
    'Candidate pool:',
    candidateList,
    '',
    'Select only the candidates that are genuinely adjacent to the target -- not every candidate in the same general domain qualifies.',
    'Respond with a JSON array only, one object per selected candidate, in this exact shape:',
    '[{"slug": "candidate-slug", "reason": "one-sentence reason a task could hand off between them"}]',
    'If no candidate is genuinely adjacent, respond with an empty array: []',
  ].join('\n');
}

/**
 * Extracts and validates the JSON array from a raw LLM response. Throws
 * AdjacencyJudgmentError (rather than returning an empty/wrong result) when
 * the response isn't parseable, isn't shaped as expected, or selects a slug
 * outside the candidate pool -- per the schema's own note that an
 * unresolvable adjacent_specialties slug "is a defect, not a warning".
 */
export function parseAdjacencyResponse(raw: string, candidates: SpecialistRecord[]): AdjacencySelection[] {
  const candidateSlugs = new Set(candidates.map((c) => c.metadata.slug));

  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new AdjacencyJudgmentError('LLM response did not contain a JSON array', raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    throw new AdjacencyJudgmentError(`LLM response was not valid JSON: ${(err as Error).message}`, raw);
  }

  if (!Array.isArray(parsed)) {
    throw new AdjacencyJudgmentError('LLM response JSON was not an array', raw);
  }

  return parsed.map((entry, i) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).slug !== 'string' ||
      typeof (entry as Record<string, unknown>).reason !== 'string'
    ) {
      throw new AdjacencyJudgmentError(`LLM response entry at index ${i} is missing slug/reason`, raw);
    }
    const { slug, reason } = entry as { slug: string; reason: string };
    if (!candidateSlugs.has(slug)) {
      throw new AdjacencyJudgmentError(`LLM selected slug "${slug}" that is not in the candidate pool`, raw);
    }
    return { slug, reason };
  });
}

/**
 * Judges which of `candidates` are genuinely adjacent to `record`, via the
 * injected LlmClient. Single-record judgment only -- no catalog-wide sweep,
 * no write-back; both are separate, later work.
 */
export async function judgeAdjacency(
  record: SpecialistRecord,
  candidates: SpecialistRecord[],
  llm: LlmClient
): Promise<AdjacencyJudgment> {
  const prompt = buildAdjacencyPrompt(record, candidates);
  const raw = await llm.complete(prompt);
  const selected = parseAdjacencyResponse(raw, candidates);
  return { slug: record.metadata.slug, selected };
}
