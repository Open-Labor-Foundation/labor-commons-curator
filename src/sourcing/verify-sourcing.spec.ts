import type { SpecialistRecord } from '../schema/specialist-record';
import { verifySourcing } from './verify-sourcing';

// The generated type encodes the schema's minItems: 8 on authority_sources
// as an 8-element tuple, which is correct for real records but unhelpful
// for exercising verifySourcing's per-source logic in isolation -- fixtures
// here use the element type directly and cast past the tuple length check.
type AuthoritySource = SpecialistRecord['knowledge_baseline']['authority_sources'][number];

function makeRecord(authoritySources: AuthoritySource[]): SpecialistRecord {
  return {
    schema_version: '1.0',
    kind: 'agent_definition',
    freshness: {
      last_reviewed: '2026-01-01',
      review_interval_days: 90,
      stale_after: '2026-04-01',
      status: 'current',
    },
    metadata: {
      slug: 'example-specialist',
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
    knowledge_baseline: {
      authority_sources: authoritySources as SpecialistRecord['knowledge_baseline']['authority_sources'],
    },
  } as SpecialistRecord;
}

function fetchReturning(status: number, ok: boolean): typeof fetch {
  return jest.fn().mockResolvedValue({ status, ok }) as unknown as typeof fetch;
}

describe('verifySourcing', () => {
  it('marks a source that resolves fine as ok', async () => {
    const record = makeRecord([
      { source_id: 'src-1', title: 'Good Source', location: 'https://example.com/good' },
    ]);
    const fetchImpl = fetchReturning(200, true);

    const result = await verifySourcing(record, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/good', { method: 'HEAD' });
    expect(result.slug).toBe('example-specialist');
    expect(result.sources).toEqual([
      {
        source_id: 'src-1',
        location: 'https://example.com/good',
        status: 'ok',
        reachable: true,
        http_status: 200,
        due_for_review: false,
      },
    ]);
  });

  it('marks a source that 404s as unreachable', async () => {
    const record = makeRecord([
      { source_id: 'src-2', title: 'Dead Source', location: 'https://example.com/gone' },
    ]);
    const fetchImpl = fetchReturning(404, false);

    const result = await verifySourcing(record, { fetchImpl });

    expect(result.sources[0]).toEqual({
      source_id: 'src-2',
      location: 'https://example.com/gone',
      status: 'unreachable',
      reachable: false,
      http_status: 404,
      due_for_review: false,
    });
  });

  it('marks a reachable source past its refresh_interval_days as due-for-review', async () => {
    const record = makeRecord([
      {
        source_id: 'src-3',
        title: 'Stale Source',
        location: 'https://example.com/stale',
        last_reviewed_at: '2026-01-01',
        refresh_interval_days: 30,
      },
    ]);
    const fetchImpl = fetchReturning(200, true);
    const now = new Date('2026-06-01T00:00:00Z');

    const result = await verifySourcing(record, { fetchImpl, now });

    expect(result.sources[0]).toEqual({
      source_id: 'src-3',
      location: 'https://example.com/stale',
      status: 'due-for-review',
      reachable: true,
      http_status: 200,
      due_for_review: true,
    });
  });

  it('does not flag a reachable source still within its refresh_interval_days', async () => {
    const record = makeRecord([
      {
        source_id: 'src-4',
        title: 'Fresh Source',
        location: 'https://example.com/fresh',
        last_reviewed_at: '2026-06-01',
        refresh_interval_days: 90,
      },
    ]);
    const fetchImpl = fetchReturning(200, true);
    const now = new Date('2026-06-15T00:00:00Z');

    const result = await verifySourcing(record, { fetchImpl, now });

    expect(result.sources[0].status).toBe('ok');
    expect(result.sources[0].due_for_review).toBe(false);
  });

  it('reports unreachable rather than due-for-review when both apply', async () => {
    const record = makeRecord([
      {
        source_id: 'src-5',
        title: 'Dead and Stale Source',
        location: 'https://example.com/dead-and-stale',
        last_reviewed_at: '2025-01-01',
        refresh_interval_days: 30,
      },
    ]);
    const fetchImpl = fetchReturning(500, false);
    const now = new Date('2026-06-01T00:00:00Z');

    const result = await verifySourcing(record, { fetchImpl, now });

    expect(result.sources[0].status).toBe('unreachable');
    expect(result.sources[0].due_for_review).toBe(true);
  });

  it('falls back to GET when a server does not support HEAD', async () => {
    const record = makeRecord([
      { source_id: 'src-6', title: 'HEAD-unsupported Source', location: 'https://example.com/head-405' },
    ]);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ status: 405, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true }) as unknown as typeof fetch;

    const result = await verifySourcing(record, { fetchImpl });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/head-405', { method: 'HEAD' });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://example.com/head-405', { method: 'GET' });
    expect(result.sources[0].status).toBe('ok');
  });

  it('treats a network failure as unreachable rather than throwing', async () => {
    const record = makeRecord([
      { source_id: 'src-7', title: 'Unresolvable Source', location: 'https://example.invalid/unreachable' },
    ]);
    const fetchImpl = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')) as unknown as typeof fetch;

    const result = await verifySourcing(record, { fetchImpl });

    expect(result.sources[0]).toEqual({
      source_id: 'src-7',
      location: 'https://example.invalid/unreachable',
      status: 'unreachable',
      reachable: false,
      http_status: null,
      due_for_review: false,
    });
  });
});
