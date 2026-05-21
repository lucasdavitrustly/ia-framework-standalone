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

  it('accepts hybrid tuning fields (rrfK, rrfScoreThreshold, prefetch multipliers)', () => {
    const result = RetrievalConfigSchema.parse({
      rrfK: 40,
      rrfScoreThreshold: 0.02,
      keywordPrefetchMultiplier: 5,
      semanticPrefetchMultiplier: 2,
    });
    expect(result.rrfK).toBe(40);
    expect(result.rrfScoreThreshold).toBe(0.02);
    expect(result.keywordPrefetchMultiplier).toBe(5);
    expect(result.semanticPrefetchMultiplier).toBe(2);
  });

  it('rejects invalid hybrid tuning values', () => {
    expect(() => RetrievalConfigSchema.parse({ rrfK: 0 })).toThrow();
    expect(() => RetrievalConfigSchema.parse({ rrfK: 201 })).toThrow();
    expect(() => RetrievalConfigSchema.parse({ keywordPrefetchMultiplier: 0 })).toThrow();
    expect(() => RetrievalConfigSchema.parse({ keywordPrefetchMultiplier: 11 })).toThrow();
  });
});

// ─── RepoEntrySchema ─────────────────────────────────────────────────────────

describe('RepoEntrySchema', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const getSchema = () => require('./schema.js').RepoEntrySchema;

  it('accepts minimal valid entry with only path', () => {
    const schema = getSchema();
    const result = schema.parse({ path: '../my-repo' });
    expect(result.path).toBe('../my-repo');
  });

  it('accepts full entry with all fields', () => {
    const schema = getSchema();
    const result = schema.parse({
      path: '../my-repo',
      name: 'my-repo',
      provides: ['@org/pkg'],
      profile: { languages: ['typescript'], frameworks: [], packageManager: 'pnpm' },
    });
    expect(result.path).toBe('../my-repo');
    expect(result.name).toBe('my-repo');
    expect(result.provides).toEqual(['@org/pkg']);
    expect(result.profile).toBeDefined();
  });

  it('rejects entry with empty path', () => {
    const schema = getSchema();
    expect(() => schema.parse({ path: '' })).toThrow();
  });

  it('rejects entry with name containing uppercase letters', () => {
    const schema = getSchema();
    expect(() => schema.parse({ path: '../repo', name: 'MyRepo' })).toThrow();
  });

  it('rejects entry with name containing spaces', () => {
    const schema = getSchema();
    expect(() => schema.parse({ path: '../repo', name: 'my repo' })).toThrow();
  });
});

// ─── ProjectConfigSchema — multi-repo ────────────────────────────────────────

describe('ProjectConfigSchema — multi-repo format', () => {
  const minimalEmbedding = { provider: 'openai' as const, model: 'text-embedding-3-small' };
  const minimalVectorStore = { host: 'localhost', port: 6333, collectionName: 'test' };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const getSchema = () => require('./schema.js').ProjectConfigSchema;

  it('accepts old format with targetProjectPath only', () => {
    const schema = getSchema();
    const result = schema.parse({
      targetProjectPath: '/foo',
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    });
    expect(result.targetProjectPath).toBe('/foo');
  });

  it('accepts new format with repos[] only', () => {
    const schema = getSchema();
    const result = schema.parse({
      repos: [{ path: '../a' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    });
    expect(result.repos).toHaveLength(1);
  });

  it('rejects config with both targetProjectPath and repos', () => {
    const schema = getSchema();
    expect(() =>
      schema.parse({
        targetProjectPath: '/foo',
        repos: [{ path: '../a' }],
        embedding: minimalEmbedding,
        vectorStore: minimalVectorStore,
      }),
    ).toThrow();
  });

  it('rejects config with neither targetProjectPath nor repos', () => {
    const schema = getSchema();
    expect(() =>
      schema.parse({
        embedding: minimalEmbedding,
        vectorStore: minimalVectorStore,
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
