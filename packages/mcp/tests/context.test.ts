import { describe, it, expect } from 'vitest';
import { shutdownHelper, _resetHelperClientForTests } from '../src/context.js';

describe('shutdownHelper', () => {
  it('is a no-op when no helper has been started', async () => {
    _resetHelperClientForTests();
    // Should resolve without throwing.
    await expect(shutdownHelper()).resolves.toBeUndefined();
  });

  it('is idempotent when called twice', async () => {
    _resetHelperClientForTests();
    await shutdownHelper();
    await expect(shutdownHelper()).resolves.toBeUndefined();
  });
});
