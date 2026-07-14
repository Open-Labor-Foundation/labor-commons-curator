import type { SpecialistRecord } from '../schema/specialist-record';
import { AdjacencyJudgment, LlmClient, judgeAdjacency } from './judge-adjacency';

export interface AdjacencySweepEntry {
  /** metadata.slug of the record judged. */
  slug: string;
  /** The full LLM judgment, including per-selection reasoning. */
  judgment: AdjacencyJudgment;
  /** record.adjacent_specialties as currently stored, sorted. */
  current_adjacent_specialties: string[];
  /** Slugs the LLM judged adjacent this sweep, sorted. */
  judged_adjacent_specialties: string[];
  /** Slugs newly judged adjacent that aren't in current_adjacent_specialties. */
  added: string[];
  /** Slugs in current_adjacent_specialties that were not judged adjacent this sweep. */
  removed: string[];
  /** True when added or removed is non-empty. */
  changed: boolean;
}

/**
 * Runs judgeAdjacency (issue 6) across every record in an already-loaded
 * catalog, narrowing each record's candidate pool to others sharing its
 * domain_family before handing them to the LLM -- a filter on what's shown
 * to the judgment function, not a substitute for its judgment. Produces a
 * report/diff only: does not write adjacent_specialties back to any file,
 * and does not call a real LLM provider (llm is the same injected
 * LlmClient from judgeAdjacency).
 */
export async function sweepAdjacency(catalog: SpecialistRecord[], llm: LlmClient): Promise<AdjacencySweepEntry[]> {
  const results: AdjacencySweepEntry[] = [];

  for (const record of catalog) {
    const candidates = catalog.filter(
      (other) => other.metadata.slug !== record.metadata.slug && other.metadata.domain_family === record.metadata.domain_family
    );

    // No same-domain_family candidates to judge -- skip the LLM call
    // entirely rather than asking it to select from nothing.
    const judgment: AdjacencyJudgment =
      candidates.length === 0 ? { slug: record.metadata.slug, selected: [] } : await judgeAdjacency(record, candidates, llm);

    const currentAdjacentSpecialties = [...(record.adjacent_specialties ?? [])].sort();
    const judgedAdjacentSpecialties = judgment.selected.map((s) => s.slug).sort();
    const added = judgedAdjacentSpecialties.filter((slug) => !currentAdjacentSpecialties.includes(slug));
    const removed = currentAdjacentSpecialties.filter((slug) => !judgedAdjacentSpecialties.includes(slug));

    results.push({
      slug: record.metadata.slug,
      judgment,
      current_adjacent_specialties: currentAdjacentSpecialties,
      judged_adjacent_specialties: judgedAdjacentSpecialties,
      added,
      removed,
      changed: added.length > 0 || removed.length > 0,
    });
  }

  return results;
}
