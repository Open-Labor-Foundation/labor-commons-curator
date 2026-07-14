import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import type { SpecialistRecord } from '../schema/specialist-record';

/** Matches labor-commons's own two-axis layout (infra/scripts/validate-spec-yaml.mjs). */
const OVERLAY_DIR_NAMES = ['naics-overlays', 'function-overlays'];

export interface LoadedCatalogEntry {
  /** Absolute path to the spec.yaml file this record was loaded from. */
  path: string;
  record: SpecialistRecord;
}

/**
 * Discovers and loads every spec.yaml under catalogRoot/catalog/{naics-overlays,function-overlays}/**.
 * A file that fails to parse is skipped with a warning to stderr, not
 * thrown -- one malformed record in a 900+-record catalog shouldn't abort
 * loading everything else, the same "non-blocking" reasoning as the
 * backfill sweep itself.
 */
export function loadCatalog(catalogRoot: string): LoadedCatalogEntry[] {
  const entries: LoadedCatalogEntry[] = [];

  for (const overlayDir of OVERLAY_DIR_NAMES) {
    const overlayRoot = path.join(catalogRoot, 'catalog', overlayDir);
    if (!fs.existsSync(overlayRoot)) {
      continue;
    }
    for (const specPath of findSpecYamlFiles(overlayRoot)) {
      try {
        const raw = fs.readFileSync(specPath, 'utf8');
        const record = parseYaml(raw) as SpecialistRecord;
        entries.push({ path: specPath, record });
      } catch (err) {
        console.error(`Skipping ${specPath}: ${(err as Error).message}`);
      }
    }
  }

  return entries;
}

function findSpecYamlFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === 'spec.yaml') {
        results.push(fullPath);
      }
    }
  }
  return results;
}
