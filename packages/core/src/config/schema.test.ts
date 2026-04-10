import { describe, it, expect } from 'vitest';
import { IndexingConfigSchema } from './schema.js';

describe('IndexingConfigSchema — embeddingConcurrency', () => {
  const validBase = {
    includePatterns: ['**/*.ts'],
    excludePatterns: ['node_modules/**'],
  };

  it('accepts embeddingConcurrency as optional positive integer', () => {
    const result = IndexingConfigSchema.parse({
      ...validBase,
      embeddingConcurrency: 5,
    });
    expect(result.embeddingConcurrency).toBe(5);
  });

  it('rejects embeddingConcurrency: 0', () => {
    expect(() =>
      IndexingConfigSchema.parse({
        ...validBase,
        embeddingConcurrency: 0,
      }),
    ).toThrow();
  });

  it('rejects embeddingConcurrency: -1', () => {
    expect(() =>
      IndexingConfigSchema.parse({
        ...validBase,
        embeddingConcurrency: -1,
      }),
    ).toThrow();
  });

  it('accepts valid config without embeddingConcurrency (backward compatible)', () => {
    const result = IndexingConfigSchema.parse(validBase);
    expect(result.embeddingConcurrency).toBeUndefined();
  });
});
