import type { SpecialistRecord } from '../schema/specialist-record';
import { LlmClient } from './judge-adjacency';
import { sweepAdjacency } from './sweep-adjacency';

function makeRecord(
  slug: string,
  name: string,
  domainFamily: string,
  boundary: string,
  currentAdjacent: string[] = []
): SpecialistRecord {
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
      domain_family: domainFamily,
      specialty_boundary: boundary,
      status: 'validated',
      created_at: '2026-01-01',
      last_updated_at: '2026-01-01',
    },
    purpose: { summary: 'Example purpose.' },
    scope: {
      supported_tasks: ['example task'] as SpecialistRecord['scope']['supported_tasks'],
      common_inputs: [],
      expected_outputs: ['example output'] as SpecialistRecord['scope']['expected_outputs'],
    },
    adjacent_specialties:
      currentAdjacent.length > 0 ? (currentAdjacent as SpecialistRecord['adjacent_specialties']) : undefined,
    knowledge_baseline: { authority_sources: [] as unknown as SpecialistRecord['knowledge_baseline']['authority_sources'] },
  } as SpecialistRecord;
}

/** Maps target slug (parsed from the prompt) -> canned JSON response. Errors on an unmapped slug rather than guessing. */
class SlugRoutedFakeLlmClient implements LlmClient {
  constructor(private readonly responsesBySlug: Record<string, string>) {}

  async complete(prompt: string): Promise<string> {
    const match = prompt.match(/Target specialist: (\S+)/);
    if (!match) {
      throw new Error('Fake LLM could not find target specialist in prompt');
    }
    const slug = match[1];
    if (!(slug in this.responsesBySlug)) {
      throw new Error(`Fake LLM has no canned response for slug "${slug}"`);
    }
    return this.responsesBySlug[slug];
  }
}

const payroll = makeRecord('payroll-coordination-specialist', 'Payroll Coordination Specialist', 'finance', 'Owns payroll runs.', [
  'accounts-payable-specialist',
]);
const accountsPayable = makeRecord('accounts-payable-specialist', 'Accounts Payable Specialist', 'finance', 'Owns vendor payment.', [
  'payroll-coordination-specialist',
]);
const budgeting = makeRecord('budgeting-specialist', 'Budgeting Specialist', 'finance', 'Owns budget planning.');
const seo = makeRecord('seo-specialist', 'SEO Specialist', 'marketing', 'Owns organic search ranking.');

const catalog = [payroll, accountsPayable, budgeting, seo];

describe('sweepAdjacency', () => {
  it('produces one judgment per record, with a correct diff against current adjacent_specialties', async () => {
    const llm = new SlugRoutedFakeLlmClient({
      'payroll-coordination-specialist': JSON.stringify([
        { slug: 'budgeting-specialist', reason: 'Payroll spend feeds directly into budget tracking.' },
      ]),
      'accounts-payable-specialist': JSON.stringify([
        { slug: 'payroll-coordination-specialist', reason: 'Both execute outbound payment runs.' },
      ]),
      'budgeting-specialist': JSON.stringify([]),
    });

    const report = await sweepAdjacency(catalog, llm);

    expect(report).toHaveLength(4);

    const payrollEntry = report.find((r) => r.slug === 'payroll-coordination-specialist')!;
    expect(payrollEntry.current_adjacent_specialties).toEqual(['accounts-payable-specialist']);
    expect(payrollEntry.judged_adjacent_specialties).toEqual(['budgeting-specialist']);
    expect(payrollEntry.added).toEqual(['budgeting-specialist']);
    expect(payrollEntry.removed).toEqual(['accounts-payable-specialist']);
    expect(payrollEntry.changed).toBe(true);

    const apEntry = report.find((r) => r.slug === 'accounts-payable-specialist')!;
    expect(apEntry.added).toEqual([]);
    expect(apEntry.removed).toEqual([]);
    expect(apEntry.changed).toBe(false);

    const budgetingEntry = report.find((r) => r.slug === 'budgeting-specialist')!;
    expect(budgetingEntry.current_adjacent_specialties).toEqual([]);
    expect(budgetingEntry.judged_adjacent_specialties).toEqual([]);
    expect(budgetingEntry.changed).toBe(false);
  });

  it('narrows candidates to the same domain_family, never offering cross-domain records to the LLM', async () => {
    const seenCandidateSlugsBySlug: Record<string, string[]> = {};
    const llm: LlmClient = {
      async complete(prompt: string) {
        const target = prompt.match(/Target specialist: (\S+)/)![1];
        const candidateMatches = [...prompt.matchAll(/- slug: (\S+)/g)].map((m) => m[1]);
        seenCandidateSlugsBySlug[target] = candidateMatches;
        return '[]';
      },
    };

    await sweepAdjacency(catalog, llm);

    expect(seenCandidateSlugsBySlug['payroll-coordination-specialist'].sort()).toEqual(
      ['accounts-payable-specialist', 'budgeting-specialist'].sort()
    );
    expect(seenCandidateSlugsBySlug['payroll-coordination-specialist']).not.toContain('seo-specialist');
  });

  it('handles a record with zero same-domain_family candidates gracefully, without calling the LLM', async () => {
    const complete = jest.fn().mockResolvedValue('[]');
    const llm: LlmClient = { complete };

    const report = await sweepAdjacency([seo], llm);

    expect(complete).not.toHaveBeenCalled();
    expect(report).toEqual([
      {
        slug: 'seo-specialist',
        judgment: { slug: 'seo-specialist', selected: [] },
        current_adjacent_specialties: [],
        judged_adjacent_specialties: [],
        added: [],
        removed: [],
        changed: false,
      },
    ]);
  });
});
