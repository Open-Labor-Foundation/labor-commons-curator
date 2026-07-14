import type { SpecialistRecord } from '../schema/specialist-record';

export type FreshnessVerdict = SpecialistRecord['freshness']['status'];

export interface FreshnessCheckResult {
  /** metadata.slug of the record checked. */
  slug: string;
  /** What freshness.status *should* be right now, computed from stale_after vs. asOf. */
  computed_status: FreshnessVerdict;
  /** What freshness.status currently says in the record. */
  stored_status: FreshnessVerdict;
  /** True when computed_status disagrees with stored_status -- the record has drifted. */
  drifted: boolean;
  /** freshness.stale_after as stored on the record, echoed for context. */
  stale_after: string;
  /** The date the comparison was made against, as an ISO string. */
  as_of: string;
}

/**
 * Computes whether a record should currently be considered current or
 * stale, based on freshness.stale_after vs. asOf -- independent of what the
 * record's own freshness.status field says. Both stale_after (a date-only
 * string) and asOf are compared as UTC instants: Date parses a date-only
 * ("YYYY-MM-DD") string as UTC midnight per spec, and Date-to-Date
 * comparison is timezone-independent since Date stores a UTC epoch
 * internally -- so this holds regardless of the host's local timezone.
 */
export function checkFreshness(record: SpecialistRecord, asOf: Date = new Date()): FreshnessCheckResult {
  const staleAfter = new Date(record.freshness.stale_after);
  const computedStatus: FreshnessVerdict = asOf >= staleAfter ? 'stale' : 'current';
  const storedStatus = record.freshness.status;

  return {
    slug: record.metadata.slug,
    computed_status: computedStatus,
    stored_status: storedStatus,
    drifted: computedStatus !== storedStatus,
    stale_after: record.freshness.stale_after,
    as_of: asOf.toISOString(),
  };
}

/**
 * The sweep report: given already-loaded records, returns only the ones
 * whose computed freshness disagrees with their stored freshness.status.
 * Does not fetch records or write anything back -- both are separate,
 * later work.
 */
export function sweepFreshnessDrift(records: SpecialistRecord[], asOf: Date = new Date()): FreshnessCheckResult[] {
  return records.map((record) => checkFreshness(record, asOf)).filter((result) => result.drifted);
}
