import { getHealthStatus, isHealthy } from './health-check';

describe('Health Check', () => {
  it('reports healthy with the real package.json version', () => {
    const status = getHealthStatus();
    expect(status.healthy).toBe(true);
    expect(status.version).toBe('1.0.0');
    expect(status.reason).toBeUndefined();
  });

  it('isHealthy reflects the same real check', () => {
    expect(isHealthy()).toBe(true);
  });
});
