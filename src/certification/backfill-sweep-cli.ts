// Real CLI entrypoint for the backfill sweep:
// tsx src/certification/backfill-sweep-cli.ts <catalog-root> [--limit N] [--out <path>]
// Run only via tsx (see certify-record-cli.ts / docs/commons-crew-integration.md
// for why). Not a test file, not imported by anything else.
//
// Report-only, per issue #15's scope: never writes anything back into the
// catalog itself, only to --out (or stdout). Deciding what happens to a
// newly_failing record (flagging it, opening an issue, etc.) is separate,
// later work -- this produces the report that decision would act on.
//
// --limit bounds cost: certifying the full catalog (900+ records, each
// several LLM calls plus a real materialization) in one run is impractical
// to run on a recurring schedule. Records with no certification block yet
// (never certified) are prioritized over already backfill_sweep-certified
// ones, so a capped run makes real progress through the backlog over
// repeated runs rather than re-checking the same head-of-list records
// every time.
import * as fs from 'fs';
import { sweepBackfillCertification } from './backfill-sweep';
import { loadCatalog } from './load-catalog';
import type { LlmClient } from '../adjacency/judge-adjacency';
import type { ProviderAdapter, ProviderStatus } from '../vendor/commons-crew-core';
import type { SpecialistRecord } from '../schema/specialist-record';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(2);
  }
  return value;
}

function makeOpenAiCompatibleLlmClient(opts: { baseUrl: string; apiKey: string; model: string }): LlmClient {
  return {
    async complete(prompt: string): Promise<string> {
      const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: opts.model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '(unreadable)');
        throw new Error(`Provider API error ${res.status}: ${text}`);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Provider response missing choices[0].message.content');
      }
      return content;
    },
  };
}

function makeProvider(model: string): ProviderAdapter {
  const status: ProviderStatus = {
    id: 'labor-commons-curator-backfill-sweep',
    displayName: 'labor-commons-curator backfill sweep provider',
    model,
    installed: true,
    authenticated: true,
    authMode: 'api_key',
    capabilities: {
      providerIdentity: 'labor-commons-curator-backfill-sweep',
      supportsStreaming: false,
      supportsStructuredOutputs: false,
      supportsToolCalls: false,
      supportsFileIo: false,
      supportsCancellation: false,
    },
    diagnostics: { checkedAt: new Date().toISOString(), readiness: { ok: true } },
  };
  const notUsed = (name: string) => async () => {
    throw new Error(`ProviderAdapter.${name} was called, but the certification pipeline never calls it (only getStatus()).`);
  };
  return {
    getStatus: async () => status,
    decideIntake: notUsed('decideIntake'),
    answerChat: notUsed('answerChat'),
    createPlan: notUsed('createPlan'),
    executeTask: notUsed('executeTask'),
    synthesizeRunResult: notUsed('synthesizeRunResult'),
  };
}

interface CliArgs {
  catalogRoot: string;
  limit: number | null;
  outPath: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const catalogRoot = positional[0];
  if (!catalogRoot) {
    console.error('Usage: tsx src/certification/backfill-sweep-cli.ts <catalog-root> [--limit N] [--out <path>]');
    process.exit(2);
  }
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 && argv[limitIndex + 1] ? Number(argv[limitIndex + 1]) : null;
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex >= 0 && argv[outIndex + 1] ? argv[outIndex + 1] : null;
  return { catalogRoot, limit, outPath };
}

/** Records with no certification block at all are prioritized -- they're the actual backlog, not records already re-checked on a prior sweep. */
function prioritize(entries: { record: SpecialistRecord }[]): typeof entries {
  const neverCertified = entries.filter((e) => !e.record.certification);
  const previouslyBackfilled = entries.filter((e) => e.record.certification?.origin === 'backfill_sweep');
  return [...neverCertified, ...previouslyBackfilled];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = requireEnv('CERTIFY_PROVIDER_BASE_URL');
  const apiKey = requireEnv('CERTIFY_PROVIDER_API_KEY');
  const model = requireEnv('CERTIFY_PROVIDER_MODEL');

  const allEntries = loadCatalog(args.catalogRoot);
  const eligible = prioritize(allEntries.filter((e) => e.record.certification?.origin !== 'pre_publish_gate'));
  const batch = args.limit !== null ? eligible.slice(0, args.limit) : eligible;

  console.log(`Loaded ${allEntries.length} catalog record(s); ${eligible.length} eligible for backfill; running ${batch.length}.`);

  const llm = makeOpenAiCompatibleLlmClient({ baseUrl, apiKey, model });
  const provider = makeProvider(model);
  const runId = new Date().toISOString();

  const report = await sweepBackfillCertification(
    batch.map((entry) => entry.record),
    {
      scenarioGenerator: llm,
      scenarioGeneratedBy: `labor-commons-curator-backfill-scenario-gen:${runId}`,
      provider,
      llm,
      judge: llm,
      gradedBy: `labor-commons-curator-backfill-grader:${runId}`,
    }
  );

  const output = JSON.stringify({ run_id: runId, catalog_size: allEntries.length, eligible_count: eligible.length, swept_count: batch.length, report }, null, 2);

  if (args.outPath) {
    fs.writeFileSync(args.outPath, output, 'utf8');
    console.log(`Report written to ${args.outPath}`);
  } else {
    console.log(output);
  }

  const newlyFailing = report.filter((entry) => entry.outcome === 'newly_failing');
  const errored = report.filter((entry) => entry.outcome === 'errored');
  console.log(
    `Backfill sweep complete: ${report.filter((e) => e.outcome === 'newly_passing').length} passing, ${newlyFailing.length} failing, ${errored.length} errored.`
  );
  if (newlyFailing.length > 0) {
    console.log(`Newly failing (candidates for status: flagged): ${newlyFailing.map((e) => e.slug).join(', ')}`);
  }
}

main().catch((err) => {
  console.error(`Backfill sweep crashed: ${(err as Error).message}`);
  process.exit(1);
});
