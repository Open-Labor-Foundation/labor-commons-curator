import type { SpecialistRecord } from '../schema/specialist-record';
import {
  AdjacencyJudgmentError,
  LlmClient,
  buildAdjacencyPrompt,
  judgeAdjacency,
  parseAdjacencyResponse,
} from './judge-adjacency';

function makeRecord(slug: string, name: string, boundary: string, tasks: string[] = ['example task']): SpecialistRecord {
  return {
    schema_version: '1.0',
    kind: 'agent_definition',
    freshness: {
      last_reviewed: '2026-01-01',
      review_interval_days: 90,
      stale_after: '2026-09-01',
      status: 'current',
    },
    metadata: {
      slug,
      name,
      domain_family: 'example',
      specialty_boundary: boundary,
      status: 'validated',
      created_at: '2026-01-01',
      last_updated_at: '2026-01-01',
    },
    purpose: { summary: 'Example purpose.' },
    scope: {
      supported_tasks: tasks as SpecialistRecord['scope']['supported_tasks'],
      common_inputs: [],
      expected_outputs: ['example output'] as SpecialistRecord['scope']['expected_outputs'],
    },
    knowledge_baseline: { authority_sources: [] as unknown as SpecialistRecord['knowledge_baseline']['authority_sources'] },
  } as SpecialistRecord;
}

class FakeLlmClient implements LlmClient {
  constructor(private readonly response: string) {}
  async complete(_prompt: string): Promise<string> {
    return this.response;
  }
}

const target = makeRecord('payroll-coordination-specialist', 'Payroll Coordination Specialist', 'Owns payroll run execution.');
const candidates = [
  makeRecord('accounts-payable-specialist', 'Accounts Payable Specialist', 'Owns vendor invoice payment.'),
  makeRecord('benefits-administration-specialist', 'Benefits Administration Specialist', 'Owns employee benefits enrollment.'),
  makeRecord('seo-specialist', 'SEO Specialist', 'Owns organic search ranking.'),
];

describe('buildAdjacencyPrompt', () => {
  it('includes the target record boundary and every candidate slug/name/boundary', () => {
    const prompt = buildAdjacencyPrompt(target, candidates);

    expect(prompt).toContain('payroll-coordination-specialist');
    expect(prompt).toContain('Owns payroll run execution.');
    for (const candidate of candidates) {
      expect(prompt).toContain(candidate.metadata.slug);
      expect(prompt).toContain(candidate.metadata.name);
      expect(prompt).toContain(candidate.metadata.specialty_boundary);
    }
  });

  it('instructs the model to respond with a JSON array', () => {
    const prompt = buildAdjacencyPrompt(target, candidates);
    expect(prompt).toContain('JSON array');
  });
});

describe('parseAdjacencyResponse', () => {
  it('parses a well-formed JSON array response into selections', () => {
    const raw = JSON.stringify([
      { slug: 'accounts-payable-specialist', reason: 'Payroll and AP both touch outbound payment runs.' },
      { slug: 'benefits-administration-specialist', reason: 'Benefits changes flow directly into payroll deductions.' },
    ]);

    const result = parseAdjacencyResponse(raw, candidates);

    expect(result).toEqual([
      { slug: 'accounts-payable-specialist', reason: 'Payroll and AP both touch outbound payment runs.' },
      { slug: 'benefits-administration-specialist', reason: 'Benefits changes flow directly into payroll deductions.' },
    ]);
  });

  it('parses an empty array when no candidate is adjacent', () => {
    expect(parseAdjacencyResponse('[]', candidates)).toEqual([]);
  });

  it('extracts the JSON array even when the model wraps it in prose', () => {
    const raw = `Sure, here is my analysis:\n[{"slug": "accounts-payable-specialist", "reason": "Shared payment execution."}]\nLet me know if you need more.`;

    const result = parseAdjacencyResponse(raw, candidates);

    expect(result).toEqual([{ slug: 'accounts-payable-specialist', reason: 'Shared payment execution.' }]);
  });

  it('throws AdjacencyJudgmentError on a response with no JSON array at all', () => {
    expect(() => parseAdjacencyResponse('I think none of these are adjacent, sorry!', candidates)).toThrow(
      AdjacencyJudgmentError
    );
  });

  it('throws AdjacencyJudgmentError on malformed JSON', () => {
    expect(() => parseAdjacencyResponse('[{"slug": "accounts-payable-specialist", "reason": ]', candidates)).toThrow(
      AdjacencyJudgmentError
    );
  });

  it('throws AdjacencyJudgmentError when an entry is missing slug or reason', () => {
    const raw = JSON.stringify([{ slug: 'accounts-payable-specialist' }]);
    expect(() => parseAdjacencyResponse(raw, candidates)).toThrow(AdjacencyJudgmentError);
  });

  it('throws AdjacencyJudgmentError when the model hallucinates a slug outside the candidate pool', () => {
    const raw = JSON.stringify([{ slug: 'nonexistent-specialist', reason: 'Made up.' }]);
    expect(() => parseAdjacencyResponse(raw, candidates)).toThrow(AdjacencyJudgmentError);
  });
});

describe('judgeAdjacency', () => {
  it('returns a structured judgment parsed from the mock LlmClient response', async () => {
    const llm = new FakeLlmClient(
      JSON.stringify([{ slug: 'accounts-payable-specialist', reason: 'Shared payment execution.' }])
    );

    const judgment = await judgeAdjacency(target, candidates, llm);

    expect(judgment).toEqual({
      slug: 'payroll-coordination-specialist',
      selected: [{ slug: 'accounts-payable-specialist', reason: 'Shared payment execution.' }],
    });
  });

  it('propagates AdjacencyJudgmentError for a malformed/unparseable LLM response rather than returning an empty result silently', async () => {
    const llm = new FakeLlmClient('not json at all');

    await expect(judgeAdjacency(target, candidates, llm)).rejects.toThrow(AdjacencyJudgmentError);
  });
});
