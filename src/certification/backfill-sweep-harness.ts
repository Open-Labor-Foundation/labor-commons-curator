// Not a test file -- run only as a `tsx` subprocess by
// backfill-sweep.spec.ts, for the same reason as materialize-harness.ts /
// certify-for-publish-harness.ts: sweepBackfillCertification calls
// certifyForPublish -> materialize() internally, which Jest's ts-jest
// cannot transpile (commons-crew's import.meta usage vs. Jest's forced
// CommonJS).
import { sweepBackfillCertification } from './backfill-sweep';
import type { ProviderAdapter, ProviderStatus } from '../vendor/commons-crew-core';
import type { SpecialistRecord } from '../schema/specialist-record';

interface HarnessInput {
  catalog: SpecialistRecord[];
  scenarioGenResponses: string[];
  providerStatus: ProviderStatus;
  llmResponses: string[];
  judgeResponses: string[];
  scenarioGeneratedBy: string;
  gradedBy: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function indexedClient(responses: string[]) {
  let call = 0;
  return {
    complete: async () => {
      const response = responses[call];
      call += 1;
      if (response === undefined) {
        throw new Error(`No canned response left at call index ${call - 1}`);
      }
      return response;
    },
  };
}

async function main() {
  const raw = await readStdin();
  const input = JSON.parse(raw) as HarnessInput;

  const provider: ProviderAdapter = {
    getStatus: async () => input.providerStatus,
    decideIntake: async () => ({}),
    answerChat: async () => ({}),
    createPlan: async () => ({}),
    executeTask: async () => ({}),
    synthesizeRunResult: async () => ({}),
  };

  try {
    const report = await sweepBackfillCertification(input.catalog, {
      scenarioGenerator: indexedClient(input.scenarioGenResponses),
      scenarioGeneratedBy: input.scenarioGeneratedBy,
      provider,
      llm: indexedClient(input.llmResponses),
      judge: indexedClient(input.judgeResponses),
      gradedBy: input.gradedBy,
    });
    process.stdout.write(JSON.stringify({ ok: true, report }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, message: (err as Error).message }));
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, message: `Harness itself crashed: ${(err as Error).message}` }));
  process.exit(1);
});
