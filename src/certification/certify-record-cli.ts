// Real CLI entrypoint for the publish gate: `tsx src/certification/certify-record-cli.ts <spec.yaml path>`.
// Run only via tsx (see docs/commons-crew-integration.md for why -- this
// transitively loads commons-crew's packages/core). Not a test file, not
// imported by anything else.
//
// Exit codes: 0 = certification passed. 1 = certification failed, or the
// pipeline itself errored (malformed record, provider unreachable, etc).
// 2 = usage/configuration error (missing argument or env var) -- distinct
// from 1 so a CI caller can tell "the record failed certification" apart
// from "this script was never able to run."
import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { certifyForPublish } from './certify-for-publish';
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

/** A real, standard OpenAI-chat-completions-compatible client -- the same convention commons-crew's own provider-api uses against Featherless. */
function makeOpenAiCompatibleLlmClient(opts: { baseUrl: string; apiKey: string; model: string }): LlmClient {
  return {
    async complete(prompt: string): Promise<string> {
      const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
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

/** materialize() only ever calls getStatus() on this (verified in #12) -- the other five methods are never invoked in the certification pipeline, so they throw rather than pretend to do something. */
function makeProvider(model: string): ProviderAdapter {
  const status: ProviderStatus = {
    id: 'labor-commons-curator-ci',
    displayName: 'labor-commons-curator CI provider',
    model,
    installed: true,
    authenticated: true,
    authMode: 'api_key',
    capabilities: {
      providerIdentity: 'labor-commons-curator-ci',
      supportsStreaming: false,
      supportsStructuredOutputs: false,
      supportsToolCalls: false,
      supportsFileIo: false,
      supportsCancellation: false,
    },
    diagnostics: { checkedAt: new Date().toISOString(), readiness: { ok: true } },
  };
  const notUsed = (name: string) => async () => {
    throw new Error(`ProviderAdapter.${name} was called, but the certification pipeline never calls it (only getStatus()) -- this is unexpected.`);
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

async function main() {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('Usage: tsx src/certification/certify-record-cli.ts <path-to-spec.yaml>');
    process.exit(2);
  }

  const baseUrl = requireEnv('CERTIFY_PROVIDER_BASE_URL');
  const apiKey = requireEnv('CERTIFY_PROVIDER_API_KEY');
  const model = requireEnv('CERTIFY_PROVIDER_MODEL');

  let record: SpecialistRecord;
  try {
    const raw = fs.readFileSync(specPath, 'utf8');
    record = parseYaml(raw) as SpecialistRecord;
  } catch (err) {
    console.error(`Could not read/parse ${specPath}: ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  const llm = makeOpenAiCompatibleLlmClient({ baseUrl, apiKey, model });
  const provider = makeProvider(model);
  const runId = `${new Date().toISOString()}-${record.metadata.slug}`;

  try {
    const result = await certifyForPublish(record, {
      scenarioGenerator: llm,
      scenarioGeneratedBy: `labor-commons-curator-ci-scenario-gen:${runId}`,
      provider,
      llm,
      judge: llm,
      gradedBy: `labor-commons-curator-ci-grader:${runId}`,
    });

    console.log(JSON.stringify(result, null, 2));

    if (!result.passed) {
      console.error(`Certification FAILED for ${record.metadata.slug}`);
      process.exit(1);
    }
    console.log(`Certification PASSED for ${record.metadata.slug}`);
  } catch (err) {
    console.error(`Certification pipeline errored for ${specPath}: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
