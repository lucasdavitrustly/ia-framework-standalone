import { describe, it, expect } from 'vitest';
import {
  IndexingConfigSchema,
  LlmConfigSchema,
  RetrievalConfigSchema,
  ClassificationRulesSchema,
} from './schema.js';

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

describe('RetrievalConfigSchema — scoreThreshold', () => {
  it('accepts scoreThreshold as optional number between 0 and 1', () => {
    const result = RetrievalConfigSchema.parse({ scoreThreshold: 0.5 });
    expect(result.scoreThreshold).toBe(0.5);
  });

  it('returns undefined for scoreThreshold when field is omitted', () => {
    const result = RetrievalConfigSchema.parse({});
    expect(result.scoreThreshold).toBeUndefined();
  });

  it('accepts scoreThreshold: 0 (disables filtering)', () => {
    const result = RetrievalConfigSchema.parse({ scoreThreshold: 0 });
    expect(result.scoreThreshold).toBe(0);
  });

  it('accepts scoreThreshold: 1 (maximum strictness)', () => {
    const result = RetrievalConfigSchema.parse({ scoreThreshold: 1 });
    expect(result.scoreThreshold).toBe(1);
  });

  it('rejects scoreThreshold > 1', () => {
    expect(() => RetrievalConfigSchema.parse({ scoreThreshold: 1.5 })).toThrow();
  });

  it('rejects scoreThreshold < 0', () => {
    expect(() => RetrievalConfigSchema.parse({ scoreThreshold: -0.1 })).toThrow();
  });
});

describe('RetrievalConfigSchema — classificationRules', () => {
  it('accepts config with classificationRules', () => {
    const result = RetrievalConfigSchema.parse({
      classificationRules: {
        symbolPatterns: ['^[A-Z]'],
        lookupVerbs: ['find', 'where'],
        maxKeywordWords: 5,
      },
    });
    expect(result.classificationRules).toBeDefined();
    expect(result.classificationRules!.symbolPatterns).toEqual(['^[A-Z]']);
    expect(result.classificationRules!.lookupVerbs).toEqual(['find', 'where']);
    expect(result.classificationRules!.maxKeywordWords).toBe(5);
  });

  it('accepts config without classificationRules (optional)', () => {
    const result = RetrievalConfigSchema.parse({});
    expect(result.classificationRules).toBeUndefined();
  });

  it('accepts partial classificationRules (all fields optional)', () => {
    const result = RetrievalConfigSchema.parse({
      classificationRules: { lookupVerbs: ['search'] },
    });
    expect(result.classificationRules!.lookupVerbs).toEqual(['search']);
    expect(result.classificationRules!.symbolPatterns).toBeUndefined();
  });

  it('rejects non-string array in symbolPatterns', () => {
    expect(() =>
      RetrievalConfigSchema.parse({
        classificationRules: { symbolPatterns: [123] },
      }),
    ).toThrow();
  });

  it('rejects maxKeywordWords outside valid range', () => {
    expect(() =>
      RetrievalConfigSchema.parse({
        classificationRules: { maxKeywordWords: 0 },
      }),
    ).toThrow();
    expect(() =>
      RetrievalConfigSchema.parse({
        classificationRules: { maxKeywordWords: 21 },
      }),
    ).toThrow();
  });
});

describe('RetrievalConfigSchema — earlyExitConfidence', () => {
  it('accepts earlyExitConfidence: 0.8 and parses correctly', () => {
    const result = RetrievalConfigSchema.parse({ earlyExitConfidence: 0.8 });
    expect(result.earlyExitConfidence).toBe(0.8);
  });

  it('defaults earlyExitConfidence to 0.8 when omitted', () => {
    const result = RetrievalConfigSchema.parse({});
    expect(result.earlyExitConfidence).toBe(0.8);
  });

  it('rejects earlyExitConfidence values outside 0-1 range', () => {
    expect(() => RetrievalConfigSchema.parse({ earlyExitConfidence: 1.5 })).toThrow();
    expect(() => RetrievalConfigSchema.parse({ earlyExitConfidence: -0.1 })).toThrow();
  });
});
