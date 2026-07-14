import type { SpecialistRecord } from '../schema/specialist-record';

/** Combined verdict for a single authority source. */
export type SourceCheckStatus = 'ok' | 'unreachable' | 'due-for-review';

export interface SourceVerificationEntry {
  /** The authority_sources[].source_id this result corresponds to. */
  source_id: string;
  /** The URL that was checked (authority_sources[].location). */
  location: string;
  /**
   * Combined verdict. 'unreachable' takes precedence over 'due-for-review'
   * when both apply -- a dead link is the more urgent problem regardless of
   * review timing.
   */
  status: SourceCheckStatus;
  /** Whether the location resolved with a 2xx response. */
  reachable: boolean;
  /** HTTP status code returned, or null if the request itself failed (network error, timeout, DNS). */
  http_status: number | null;
  /**
   * True once last_reviewed_at + refresh_interval_days has passed. False if
   * either field is absent on the source (nothing to compare against).
   */
  due_for_review: boolean;
}

export interface SourcingVerificationResult {
  /** metadata.slug of the record that was verified. */
  slug: string;
  /** One entry per knowledge_baseline.authority_sources item, same order. */
  sources: SourceVerificationEntry[];
}

export interface VerifySourcingOptions {
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable "current time" for tests; defaults to new Date(). */
  now?: Date;
}

/**
 * Verifies a single SpecialistRecord's knowledge_baseline.authority_sources:
 * each source's location is checked for reachability and its
 * last_reviewed_at/refresh_interval_days are checked for staleness. Does not
 * write results anywhere or sweep the catalog -- single-record check only.
 */
export async function verifySourcing(
  record: SpecialistRecord,
  options: VerifySourcingOptions = {}
): Promise<SourcingVerificationResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();

  const sources = await Promise.all(
    record.knowledge_baseline.authority_sources.map(async (source) => {
      const { reachable, httpStatus } = await checkReachable(source.location, fetchImpl);
      const dueForReview = isDueForReview(source.last_reviewed_at, source.refresh_interval_days, now);
      const status: SourceCheckStatus = !reachable ? 'unreachable' : dueForReview ? 'due-for-review' : 'ok';

      return {
        source_id: source.source_id,
        location: source.location,
        status,
        reachable,
        http_status: httpStatus,
        due_for_review: dueForReview,
      };
    })
  );

  return { slug: record.metadata.slug, sources };
}

async function checkReachable(
  location: string,
  fetchImpl: typeof fetch
): Promise<{ reachable: boolean; httpStatus: number | null }> {
  try {
    const res = await fetchImpl(location, { method: 'HEAD' });
    if (res.status === 405 || res.status === 501) {
      // Some servers don't implement HEAD -- fall back to GET before
      // concluding the source is unreachable.
      const getRes = await fetchImpl(location, { method: 'GET' });
      return { reachable: getRes.ok, httpStatus: getRes.status };
    }
    return { reachable: res.ok, httpStatus: res.status };
  } catch {
    return { reachable: false, httpStatus: null };
  }
}

function isDueForReview(
  lastReviewedAt: string | undefined,
  refreshIntervalDays: number | undefined,
  now: Date
): boolean {
  if (!lastReviewedAt || !refreshIntervalDays) {
    return false;
  }
  const last = new Date(lastReviewedAt);
  if (Number.isNaN(last.getTime())) {
    return false;
  }
  const dueDate = new Date(last);
  dueDate.setDate(dueDate.getDate() + refreshIntervalDays);
  return now >= dueDate;
}
