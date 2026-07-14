import type { SpecialistRecord } from '../schema/specialist-record';
import { checkFreshness, sweepFreshnessDrift, FreshnessVerdict } from './check-freshness';

function makeRecord(slug: string, staleAfter: string, status: FreshnessVerdict): SpecialistRecord {
  return {
    schema_version: '1.0',
    kind: 'agent_definition',
    freshness: {
      last_reviewed: '2026-01-01',
      review_interval_days: 90,
      stale_after: staleAfter,
      status,
    },
    metadata: {
      slug,
      name: 'Example Specialist',
      domain_family: 'example',
      specialty_boundary: 'x',
      status: 'validated',
      created_at: '2026-01-01',
      last_updated_at: '2026-01-01',
    },
    purpose: { summary: 'Example purpose.' },
    scope: {
      supported_tasks: ['example task'],
      common_inputs: [],
      expected_outputs: ['example output'],
    },
    knowledge_baseline: { authority_sources: [] as unknown as SpecialistRecord['knowledge_baseline']['authority_sources'] },
  } as SpecialistRecord;
}

const AS_OF = new Date('2026-06-01T00:00:00Z');

describe('checkFreshness', () => {
  it('a record correctly marked current stays current, no drift', () => {
    const record = makeRecord('current-and-fresh', '2026-09-01', 'current');

    const result = checkFreshness(record, AS_OF);

    expect(result).toEqual({
      slug: 'current-and-fresh',
      computed_status: 'current',
      stored_status: 'current',
      drifted: false,
      stale_after: '2026-09-01',
      as_of: AS_OF.toISOString(),
    });
  });

  it('a record correctly marked stale stays stale, no drift', () => {
    const record = makeRecord('stale-and-known', '2026-01-01', 'stale');

    const result = checkFreshness(record, AS_OF);

    expect(result).toEqual({
      slug: 'stale-and-known',
      computed_status: 'stale',
      stored_status: 'stale',
      drifted: false,
      stale_after: '2026-01-01',
      as_of: AS_OF.toISOString(),
    });
  });

  it('a record marked current whose stale_after has passed is drifted stale', () => {
    const record = makeRecord('should-now-be-stale', '2026-03-01', 'current');

    const result = checkFreshness(record, AS_OF);

    expect(result.computed_status).toBe('stale');
    expect(result.stored_status).toBe('current');
    expect(result.drifted).toBe(true);
  });

  it('a record marked stale whose stale_after has not passed is drifted current', () => {
    const record = makeRecord('should-still-be-current', '2026-12-01', 'stale');

    const result = checkFreshness(record, AS_OF);

    expect(result.computed_status).toBe('current');
    expect(result.stored_status).toBe('stale');
    expect(result.drifted).toBe(true);
  });

  it('treats stale_after exactly at asOf as stale (boundary is inclusive)', () => {
    const record = makeRecord('boundary', '2026-06-01', 'current');

    const result = checkFreshness(record, AS_OF);

    expect(result.computed_status).toBe('stale');
  });
});

describe('sweepFreshnessDrift', () => {
  it('reports only the records whose computed status disagrees with stored status', () => {
    const records = [
      makeRecord('no-drift-current', '2026-09-01', 'current'),
      makeRecord('no-drift-stale', '2026-01-01', 'stale'),
      makeRecord('drift-to-stale', '2026-03-01', 'current'),
      makeRecord('drift-to-current', '2026-12-01', 'stale'),
    ];

    const report = sweepFreshnessDrift(records, AS_OF);

    expect(report.map((r) => r.slug).sort()).toEqual(['drift-to-current', 'drift-to-stale']);
    expect(report.every((r) => r.drifted)).toBe(true);
  });

  it('returns an empty report when nothing has drifted', () => {
    const records = [makeRecord('a', '2026-09-01', 'current'), makeRecord('b', '2026-01-01', 'stale')];

    expect(sweepFreshnessDrift(records, AS_OF)).toEqual([]);
  });
});
