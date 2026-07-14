import type { SpecialistRecord } from '../schema/specialist-record';
import { CertifyForPublishDeps, certifyForPublish } from './certify-for-publish';
import type { CertificationResult } from './types';

export interface BackfillSweepEntry {
  /** metadata.slug of the record swept. */
  slug: string;
  /** newly_passing: certification.passed is now true. newly_failing: certification.passed is now false -- a candidate for status: "flagged" per docs/data_model.md (a later, separate decision, not made here). errored: the certification pipeline itself threw before producing a result. */
  outcome: 'newly_passing' | 'newly_failing' | 'errored';
  /** The fresh CertificationResult, or null if the pipeline errored before producing one. */
  result: CertificationResult | null;
  /** The error message, or null if the pipeline completed (whether it passed or failed). */
  error: string | null;
}

export type BackfillSweepDeps = Omit<CertifyForPublishDeps, 'origin'>;

/**
 * Retroactively certifies records published before the certification gate
 * existed -- non-blocking, per docs/api.md's "Backfill certification
 * sweep": a record that fails is a candidate for status: "flagged", never
 * auto-retired (docs/data_model.md). Runs certifyForPublish (#14) against
 * each record with origin: "backfill_sweep" set explicitly, and returns a
 * report only -- this never writes status: "flagged" or anything else
 * back to any file; that's a separate, later decision.
 *
 * A record whose certification.origin is already "pre_publish_gate" is
 * skipped entirely -- it went through the real gate already and was never
 * what this sweep is for. A record with no certification block, or with
 * certification.origin: "backfill_sweep" from a previous sweep, is
 * (re-)certified -- backfill sweeps are expected to run repeatedly as the
 * catalog and scenario coverage evolve.
 *
 * One record's certification pipeline throwing (a malformed record, an
 * LLM error, a materialization failure) does not abort the sweep -- that
 * would defeat the whole point of a non-blocking backfill. It's reported
 * as an "errored" entry instead, and the sweep continues with the next
 * record.
 */
export async function sweepBackfillCertification(
  catalog: SpecialistRecord[],
  deps: BackfillSweepDeps
): Promise<BackfillSweepEntry[]> {
  const report: BackfillSweepEntry[] = [];

  for (const record of catalog) {
    if (record.certification?.origin === 'pre_publish_gate') {
      continue;
    }

    try {
      const result = await certifyForPublish(record, { ...deps, origin: 'backfill_sweep' });
      report.push({
        slug: record.metadata.slug,
        outcome: result.passed ? 'newly_passing' : 'newly_failing',
        result,
        error: null,
      });
    } catch (err) {
      report.push({
        slug: record.metadata.slug,
        outcome: 'errored',
        result: null,
        error: (err as Error).message,
      });
    }
  }

  return report;
}
