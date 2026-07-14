// Not a test file -- run only as a `tsx` subprocess by
// certify-for-publish.spec.ts, for the same reason as materialize-harness.ts
// (see its header comment): certifyForPublish calls materialize()
// internally, which dynamically requires commons-crew's packages/core,
// which Jest's ts-jest cannot transpile (import.meta vs. forced CommonJS).
import { certifyForPublish } from './certify-for-publish';
import type { ProviderAdapter, ProviderStatus } from '../vendor/commons-crew-core';
import type { SpecialistRecord } from '../schema/specialist-record';

interface HarnessInput {
  record: SpecialistRecord;
  scenarioGenResponse: string;
  providerStatus: ProviderStatus;
  llmResponse: string;
  judgeResponse: string;
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
    const result = await certifyForPublish(input.record, {
      scenarioGenerator: { complete: async () => input.scenarioGenResponse },
      scenarioGeneratedBy: input.scenarioGeneratedBy,
      provider,
      llm: { complete: async () => input.llmResponse },
      judge: { complete: async () => input.judgeResponse },
      gradedBy: input.gradedBy,
    });
    process.stdout.write(JSON.stringify({ ok: true, result }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, message: (err as Error).message }));
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, message: `Harness itself crashed: ${(err as Error).message}` }));
  process.exit(1);
});
