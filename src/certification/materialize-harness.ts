// Not a test file (no .spec/.test suffix) -- run only as a `tsx` subprocess
// by materialize.spec.ts, never imported directly by anything under Jest.
//
// Why this exists: materialize.ts's real implementation dynamically
// requires commons-crew's packages/core, which imports packages/config,
// which uses `import.meta.url` (packages/config/src/index.ts:259) to
// resolve its own repo root when not given one explicitly. Jest's
// ts-jest transform always coerces `module` to CommonJS for compatibility
// with Jest's own runtime, and `import.meta` cannot be transpiled to
// CommonJS at all -- confirmed directly (TS1343) after trying several
// ts-jest transform overrides. This isn't fixable in-process under Jest;
// it's a real conflict between Jest's CJS runtime and commons-crew's ESM
// toolchain, not a bug in materialize.ts. tsx does not have this
// limitation (confirmed directly: this harness runs the exact same
// materialize.ts unmodified, successfully, under `tsx`), and matches this
// repo's own documented real-invocation mechanism (docs/commons-crew-integration.md)
// -- so materialize.spec.ts spawns this as a real `tsx` subprocess rather
// than importing materialize.ts directly, which is arguably more faithful
// to production than an in-process Jest call would have been anyway.
import { materialize } from './materialize';
import type { ProviderAdapter, ProviderStatus } from '../vendor/commons-crew-core';
import type { SpecialistManifestContract } from '../vendor/commons-crew-catalog';

interface HarnessInput {
  manifest: SpecialistManifestContract;
  section?: string;
  providerStatus?: ProviderStatus;
  providerFailureMessage?: string;
  tempDirPrefix?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function buildProvider(input: HarnessInput): ProviderAdapter {
  return {
    getStatus: async () => {
      if (input.providerFailureMessage) {
        throw new Error(input.providerFailureMessage);
      }
      if (!input.providerStatus) {
        throw new Error('Harness input missing both providerStatus and providerFailureMessage.');
      }
      return input.providerStatus;
    },
    decideIntake: async () => ({}),
    answerChat: async () => ({}),
    createPlan: async () => ({}),
    executeTask: async () => ({}),
    synthesizeRunResult: async () => ({}),
  };
}

async function main() {
  const raw = await readStdin();
  const input = JSON.parse(raw) as HarnessInput;
  const provider = buildProvider(input);

  try {
    const materialized = await materialize(input.manifest, { provider, section: input.section, tempDirPrefix: input.tempDirPrefix });
    process.stdout.write(JSON.stringify({ ok: true, materialized }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, message: (err as Error).message }));
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, message: `Harness itself crashed: ${(err as Error).message}` }));
  process.exit(1);
});
