import { readFileSync } from "node:fs";
import { join } from "node:path";

export type HealthStatus = {
  healthy: boolean;
  version: string;
  reason?: string;
};

/**
 * Reports the package version from package.json, per the original issue's
 * own acceptance criteria for what "not a stub" means here. Healthy means
 * package.json exists, parses, and declares a version -- the actual thing
 * this package can check about itself before any certification logic exists.
 */
export const getHealthStatus = (): HealthStatus => {
  try {
    const raw = readFileSync(join(__dirname, "..", "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (!pkg.version) {
      return { healthy: false, version: "unknown", reason: "package.json has no version field" };
    }
    return { healthy: true, version: pkg.version };
  } catch (error) {
    return { healthy: false, version: "unknown", reason: error instanceof Error ? error.message : String(error) };
  }
};

export const isHealthy = (): boolean => getHealthStatus().healthy;
