import { isHealthy } from './health-check';

describe('Health Check', () => {
  it('should return true when healthy', () => {
    expect(isHealthy()).toBe(true);
  });
});