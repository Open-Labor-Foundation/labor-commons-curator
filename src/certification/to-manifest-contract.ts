import { stringify } from 'yaml';
import type { SpecialistRecord } from '../schema/specialist-record';
import { SpecialistManifestContract, loadVendorCatalogModule } from '../vendor/commons-crew-catalog';

/**
 * Converts a SpecialistRecord into commons-crew's SpecialistManifestContract
 * shape by serializing it back to YAML and handing that to commons-crew's
 * own real parseSpecialistManifest -- reuse of the actual parser, not a
 * reimplementation of its field-mapping logic.
 *
 * Throws the real, vendored ManifestValidationError (see
 * ../vendor/commons-crew-catalog.ts) on a malformed record -- e.g. an
 * empty scope.common_inputs, which labor-commons's own schema allows but
 * commons-crew's legacy-contract parser requires at least one entry for.
 * That is a genuine cross-repo contract mismatch, not a bug in this
 * function -- it's surfaced as-is rather than papered over.
 */
export function toManifestContract(record: SpecialistRecord): SpecialistManifestContract {
  const { parseSpecialistManifest } = loadVendorCatalogModule();
  const source = stringify(record);
  const manifestPath = `<labor-commons-curator:in-memory>/${record.metadata.slug}/spec.yaml`;
  return parseSpecialistManifest(source, manifestPath);
}
