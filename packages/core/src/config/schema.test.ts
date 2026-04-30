import { describe, it, expect } from 'vitest';
import { IndexingConfigSchema, LlmConfigSchema, RetrievalConfigSchema } from './schema.js';

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

describe('LlmConfigSchema', () => {
  it('accepts valid LLM config with model and ollamaUrl', () => {
    const result = LlmConfigSchema.parse({
      model: 'llama3.2:latest',
      ollamaUrl: 'http://localhost:11434',
    });
    expect(result.model).toBe('llama3.2:latest');
    expect(result.ollamaUrl).toBe('http://localhost:11434');
  });

  it('defaults ollamaUrl to http://localhost:11434 when omitted', () => {
    const result = LlmConfigSchema.parse({ model: 'llama3.2:latest' });
    expect(result.ollamaUrl).toBe('http://localhost:11434');
  });

  it('requires model field', () => {
    expect(() => LlmConfigSchema.parse({})).toThrow();
  });

  it('rejects empty model string', () => {
    expect(() => LlmConfigSchema.parse({ model: '' })).toThrow();
  });
});

describe('IndexingConfigSchema — llm section', () => {
  const validBase = {
    includePatterns: ['**/*.ts'],
    excludePatterns: ['node_modules/**'],
  };

  it('accepts IndexingConfigSchema with llm section', () => {
    const result = IndexingConfigSchema.parse({
      ...validBase,
      llm: { model: 'llama3.2:latest', ollamaUrl: 'http://localhost:11434' },
    });
    expect(result.llm).toBeDefined();
    expect(result.llm!.model).toBe('llama3.2:latest');
  });

  it('accepts IndexingConfigSchema without llm section (backward compatible)', () => {
    const result = IndexingConfigSchema.parse(validBase);
    expect(result.llm).toBeUndefined();
  });
});

describe('RetrievalConfigSchema — maxTokensPerCall', () => {
  it('accepts maxTokensPerCall as optional positive integer', () => {
    const result = RetrievalConfigSchema.parse({ maxTokensPerCall: 8000 });
    expect(result.maxTokensPerCall).toBe(8000);
  });

  it('returns undefined for maxTokensPerCall when field is omitted', () => {
    const result = RetrievalConfigSchema.parse({});
    expect(result.maxTokensPerCall).toBeUndefined();
  });

  it('rejects maxTokensPerCall: -1 (must be positive)', () => {
    expect(() => RetrievalConfigSchema.parse({ maxTokensPerCall: -1 })).toThrow();
  });

  it('rejects maxTokensPerCall: 0 (must be positive)', () => {
    expect(() => RetrievalConfigSchema.parse({ maxTokensPerCall: 0 })).toThrow();
  });
});
