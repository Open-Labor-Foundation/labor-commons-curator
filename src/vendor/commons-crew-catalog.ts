import * as path from 'path';

// commons-crew is vendored as a git submodule at vendor/commons-crew (see
// docs/commons-crew-integration.md), pinned to a specific commit rather
// than tracking a branch, so grading runs against a known, stable version
// of the parser rather than whatever happens to be on commons-crew's main
// at run time.
//
// All of commons-crew's packages are "private": true with no compiled
// output (packages/*/package.json "exports" points straight at
// src/index.ts) and use ESNext/Bundler module resolution -- there is no
// npm-installable @commons-crew/catalog. Reuse means importing the raw
// TypeScript source directly.
//
// This module loads it via a *computed* require() path (built from
// path.join at runtime, not a string literal) rather than a static
// `import`, deliberately: a static import would put every file
// transitively reachable from vendor/commons-crew/packages/catalog/src
// (which pulls in packages/contracts and packages/config too) inside this
// package's own tsc compile graph, which enforces rootDir: "src" -- tsc
// would refuse to build. A computed require() path is opaque to tsc's
// static module resolution, so `npm run build` only ever type-checks this
// package's own hand-declared mirror types below, never vendor's tree.
//
// Consequence: this only actually resolves at runtime under a TypeScript-
// aware loader (this repo's own tests run via ts-jest, which transforms
// any .ts file its runtime require() reaches, vendor included; a real,
// non-test invocation of anything that calls loadVendorCatalogModule()
// must run via `tsx`, e.g. `tsx some-script.ts`, or with `-r tsx/cjs`
// registered -- plain `node` cannot parse a .ts file at all). See
// docs/commons-crew-integration.md.

export type SpecialistReadinessState = 'validated' | 'deployable' | 'definition_only' | 'partial' | 'planned';

export interface SpecialistInputContract {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface SpecialistOutputContract {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface SpecialistPermissionContract {
  approvalRequired: boolean;
  allow: string[];
}

export interface SpecialistStartupCheckContract {
  id: string;
  kind: string;
  target: string;
  required: boolean;
}

export interface SpecialistIdentityContract {
  slug: string;
  name: string;
  description: string;
  boundary: {
    domain: string;
    constraints: string[];
  };
}

export interface SpecialistManifestContract {
  schemaVersion: 'olf.specialist/v1';
  kind: 'specialist';
  identity: SpecialistIdentityContract;
  readinessState: SpecialistReadinessState;
  supportedTasks: string[];
  inputs: SpecialistInputContract[];
  outputs: SpecialistOutputContract[];
  permissions: SpecialistPermissionContract;
  startupChecks: SpecialistStartupCheckContract[];
}

export interface SpecialistManifestValidationIssue {
  code: 'manifest.parse_error' | 'manifest.type' | 'manifest.required' | 'manifest.enum' | 'manifest.min_items' | 'manifest.invalid_value';
  message: string;
  path: string;
  manifestPath: string;
  line: number | null;
  column: number | null;
}

/** Mirrors commons-crew's real ManifestValidationError shape (packages/catalog/src/index.ts:56) for typing purposes; the actual thrown instance is the real class from the vendored module, not this interface. */
export interface ManifestValidationErrorLike extends Error {
  readonly issues: SpecialistManifestValidationIssue[];
}

interface VendorCatalogModule {
  parseSpecialistManifest: (source: string, manifestPath: string) => SpecialistManifestContract;
  ManifestValidationError: new (issues: SpecialistManifestValidationIssue[]) => ManifestValidationErrorLike;
}

let cachedModule: VendorCatalogModule | undefined;

/**
 * Loads the real, vendored commons-crew catalog module. Cached after first
 * load. Throws if the submodule hasn't been checked out
 * (`git submodule update --init`).
 */
export function loadVendorCatalogModule(): VendorCatalogModule {
  if (cachedModule) {
    return cachedModule;
  }

  const vendorPath = path.join(__dirname, '..', '..', 'vendor', 'commons-crew', 'packages', 'catalog', 'src', 'index.ts');
  let loaded: VendorCatalogModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loaded = require(vendorPath) as VendorCatalogModule;
  } catch (err) {
    throw new Error(
      `Failed to load vendored commons-crew catalog module at ${vendorPath}. ` +
        `Is the submodule checked out ("git submodule update --init") and is this running under a TypeScript-aware runtime (tsx)? ` +
        `Original error: ${(err as Error).message}`
    );
  }

  cachedModule = loaded;
  return loaded;
}

/** Re-exposes the real ManifestValidationError constructor for instanceof checks, without requiring callers to reload the module themselves. */
export function isManifestValidationError(err: unknown): err is ManifestValidationErrorLike {
  const { ManifestValidationError } = loadVendorCatalogModule();
  return err instanceof ManifestValidationError;
}
