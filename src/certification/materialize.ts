import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { stringify } from 'yaml';
import type { SpecialistManifestContract } from '../vendor/commons-crew-catalog';
import { AppConfig, MaterializationRecord, ProviderAdapter, loadVendorCoreModule } from '../vendor/commons-crew-core';

const VENDOR_REPO_ROOT = path.join(__dirname, '..', '..', 'vendor', 'commons-crew');

export interface MaterializeDeps {
  /**
   * Injected LLM provider -- never commons-crew's own Featherless key (see
   * docs/commons-crew-integration.md finding #2). Must satisfy commons-crew's
   * real ProviderAdapter shape; createAppServices calls provider.getStatus()
   * unconditionally at startup, so this is required, not optional.
   */
  provider: ProviderAdapter;
  /** NAICS-overlay section directory name used for the synthetic catalog entry. Defaults to "curator-generated". */
  section?: string;
}

/**
 * Materializes a SpecialistManifestContract by driving commons-crew's real
 * materials.create -- not a hand-rolled mirror of it. Since materials.create
 * resolves entries by catalog-entry ID after a real on-disk directory walk
 * (LocalCatalogService.sync()), this writes the manifest into a temp
 * directory in the exact catalog/naics-overlays/{section}/{slug}/spec.yaml
 * layout it expects, using a real, minimal AppConfig (storage.mode: memory,
 * so no Postgres needed) pointed at that temp catalog root -- while
 * paths.repoRoot points at the real vendored commons-crew checkout, since
 * materialization also reads real prompt-governance template files
 * (governance/prompts/*.json) relative to repoRoot.
 *
 * The manifest is written via the *explicit contract* shape (its own real
 * field names: schemaVersion, identity, etc.), not reconstructed as a
 * legacy spec.yaml -- confirmed against commons-crew's own
 * hasExplicitContractShape/parseExplicitContract that a serialized
 * SpecialistManifestContract round-trips cleanly through that path.
 *
 * Every path this call touches (temp catalog root, artifactsRoot,
 * stateFile, backupsRoot) lives under one temp directory, removed in a
 * finally block after calling app.shutdown() -- so a failed or successful
 * call leaves nothing behind, safe to call repeatedly (once per record
 * being certified).
 */
export async function materialize(manifest: SpecialistManifestContract, deps: MaterializeDeps): Promise<MaterializationRecord> {
  const { createAppServices } = loadVendorCoreModule();

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'labor-commons-curator-materialize-'));
  let app: Awaited<ReturnType<typeof createAppServices>> | undefined;

  try {
    const section = deps.section ?? 'curator-generated';
    const specDir = path.join(tempRoot, 'catalog', 'naics-overlays', section, manifest.identity.slug);
    await fs.mkdir(specDir, { recursive: true });
    const specYamlPath = path.join(specDir, 'spec.yaml');
    await fs.writeFile(specYamlPath, stringify(manifest), 'utf8');
    const agentCatalogEntryId = path.relative(tempRoot, specYamlPath);

    const config: AppConfig = {
      profile: { name: 'test', source: 'derived', requestedName: null, error: null },
      app: { name: 'labor-commons-curator-materialize', env: 'test' },
      ports: { api: 0, runner: 0 },
      paths: {
        repoRoot: VENDOR_REPO_ROOT,
        olfAgentsRoot: tempRoot,
        artifactCommonsRoot: VENDOR_REPO_ROOT,
        artifactsRoot: path.join(tempRoot, 'artifacts'),
        stateFile: path.join(tempRoot, 'state.json'),
        backupsRoot: path.join(tempRoot, 'backups'),
      },
      provider: { apiKey: null, baseUrl: 'unused://labor-commons-curator', model: 'unused' },
      auth: { apiToken: null },
      storage: { mode: 'memory' },
      database: { connectionString: 'pg-mem://labor-commons-curator', schema: 'pa_runtime' },
      featureFlags: { adminOperations: true, catalogSync: true, evaluations: true },
      environment: { allowedOverrides: [], appliedOverrides: [], unknownOverrides: [], featureFlagErrors: [] },
    };

    app = await createAppServices(config, { provider: deps.provider });
    return await app.materials.create(agentCatalogEntryId, null);
  } finally {
    if (app) {
      await app.shutdown();
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
