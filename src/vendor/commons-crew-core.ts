import * as path from 'path';

// Loads commons-crew's packages/core (the sole public export is
// createAppServices) via the same computed-require pattern as
// commons-crew-catalog.ts -- see that file's header comment and
// docs/commons-crew-integration.md for why. Mirror types below are copied
// from packages/config/src/index.ts and packages/contracts/src/index.ts,
// verified against commons-crew's real, current source rather than
// guessed at.

export type ConfigProfileName = 'local' | 'test' | 'trusted-host';

export interface AppConfig {
  profile: {
    name: ConfigProfileName;
    source: 'derived' | 'environment';
    requestedName: string | null;
    error: string | null;
  };
  app: {
    name: string;
    env: string;
  };
  ports: {
    api: number;
    runner: number;
  };
  paths: {
    repoRoot: string;
    olfAgentsRoot: string;
    artifactCommonsRoot: string;
    artifactsRoot: string;
    stateFile: string;
    backupsRoot: string;
  };
  provider: {
    apiKey: string | null;
    baseUrl: string;
    model: string;
  };
  auth: {
    apiToken: string | null;
  };
  storage: {
    mode: 'memory' | 'postgres';
  };
  database: {
    connectionString: string;
    schema: string;
  };
  featureFlags: Record<string, boolean>;
  environment: {
    allowedOverrides: string[];
    appliedOverrides: string[];
    unknownOverrides: string[];
    featureFlagErrors: string[];
  };
}

export interface ProviderStatus {
  id: string;
  displayName: string;
  model: string | null;
  installed: boolean;
  authenticated: boolean;
  authMode: 'chatgpt_login' | 'api_key';
  capabilities: {
    providerIdentity: string | null;
    supportsStreaming: boolean;
    supportsStructuredOutputs: boolean;
    supportsToolCalls: boolean;
    supportsFileIo: boolean;
    supportsCancellation: boolean;
  };
  diagnostics: {
    checkedAt: string;
    readiness: { ok: boolean; detail?: string } | Record<string, unknown>;
  };
}

/**
 * Mirrors commons-crew's real ProviderAdapter (packages/contracts/src/index.ts:1784).
 * createAppServices calls provider.getStatus() unconditionally at startup
 * (packages/core/src/index.ts:2085) -- confirmed by reading the function
 * body, not assumed -- so a mock provider must implement at least that.
 * The other five methods aren't invoked anywhere in the materialize path
 * (materialization renders the system prompt from a template, it does not
 * call the provider -- also confirmed by reading createMaterialization's
 * body), but are required by the real type, so a mock must still provide
 * them to satisfy TypeScript / avoid a runtime crash if commons-crew calls
 * them in a future version.
 */
export interface ProviderAdapter {
  getStatus: () => Promise<ProviderStatus>;
  decideIntake: (input: unknown) => Promise<unknown>;
  answerChat: (input: unknown) => Promise<unknown>;
  createPlan: (input: unknown) => Promise<unknown>;
  executeTask: (input: unknown) => Promise<unknown>;
  synthesizeRunResult: (input: unknown) => Promise<unknown>;
}

export interface AppServicesOptions {
  provider?: ProviderAdapter;
}

export interface MaterializationRecord {
  id: string;
  agentCatalogEntryId: string;
  runId: string | null;
  workItemId: string | null;
  status: 'queued' | 'building' | 'ready' | 'failed';
  generatedPath: string;
  sourceCommitOrRef: string;
  catalogSourcePath: string;
  catalogResolvedRef: string;
  catalogResolvedCommit: string;
  provenanceNotes: string;
  failureCode: 'invalid_manifest' | 'self_check_failed' | 'materialization_io_error' | null;
  failureDetail: string | null;
  retryable: boolean;
  recoveryAction: string | null;
  diagnostics: string[];
  validationChecks: Array<{ name: string; ok: boolean; details: string }>;
  failureReasons: string[];
  lastAttemptedAt: string;
  createdAt: string;
  readyAt: string | null;
}

interface AppServices {
  materials: {
    create: (agentCatalogEntryId: string, runId: string | null) => Promise<MaterializationRecord>;
    get: (materializationId: string) => Promise<MaterializationRecord | null>;
  };
  shutdown: () => Promise<void>;
}

interface VendorCoreModule {
  createAppServices: (config: AppConfig, options?: AppServicesOptions) => Promise<AppServices>;
}

let cachedModule: VendorCoreModule | undefined;

/** Loads the real, vendored commons-crew core module (createAppServices). Cached after first load. */
export function loadVendorCoreModule(): VendorCoreModule {
  if (cachedModule) {
    return cachedModule;
  }

  const vendorPath = path.join(__dirname, '..', '..', 'vendor', 'commons-crew', 'packages', 'core', 'src', 'index.ts');
  let loaded: VendorCoreModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loaded = require(vendorPath) as VendorCoreModule;
  } catch (err) {
    throw new Error(
      `Failed to load vendored commons-crew core module at ${vendorPath}. ` +
        `Is the submodule checked out ("git submodule update --init") and is this running under a TypeScript-aware runtime (tsx)? ` +
        `Original error: ${(err as Error).message}`
    );
  }

  cachedModule = loaded;
  return loaded;
}
