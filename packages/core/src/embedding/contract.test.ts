import { describe, expect, it } from 'vitest';
import type { EmbeddingProviderConfig } from '../types/index.js';
import {
  EmbeddingConfigurationError,
  contractFingerprint,
  contractsMatch,
  resolveContract,
} from './contract.js';

const baseConfig: EmbeddingProviderConfig = {
  provider: 'openai',
  model: 'text-embedding-3-small',
  dimensions: 512,
};

describe('resolveContract', () => {
  it('resolves the configured provider, model, dimension, and versions', () => {
    expect(resolveContract(baseConfig)).toEqual({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimension: 512,
      tokenizerVersion: 1,
      sparseHashVersion: 1,
    });
  });

  it('preserves configured prefixes', () => {
    expect(
      resolveContract({
        ...baseConfig,
        prefixes: { document: 'passage: ', query: 'query: ' },
      }).prefixes,
    ).toEqual({ document: 'passage: ', query: 'query: ' });
  });

  it('uses the native dimension when a known model has no configured dimension', () => {
    expect(
      resolveContract({ provider: 'openai', model: 'text-embedding-3-small' }).dimension,
    ).toBe(1536);
  });

  it('throws an actionable error for an unsupported configured dimension', () => {
    expect(() =>
      resolveContract({
        provider: 'openai',
        model: 'text-embedding-ada-002',
        dimensions: 512,
      }),
    ).toThrow(
      /openai.*text-embedding-ada-002.*512.*does not support configurable dimensions/i,
    );
  });

  it('throws the typed configuration error for unsupported dimensions', () => {
    expect(() =>
      resolveContract({
        provider: 'openai',
        model: 'text-embedding-ada-002',
        dimensions: 512,
      }),
    ).toThrow(EmbeddingConfigurationError);
  });

  it('succeeds when an unsupported model parameter is unnecessary at native size', () => {
    const contract = resolveContract({
      provider: 'openai',
      model: 'text-embedding-ada-002',
      dimensions: 1536,
    });

    expect(contract.dimension).toBe(1536);
    expect(contract.omitDimensionParam).toBe(true);
  });

  it('requires an explicit dimension for an unknown model', () => {
    expect(() => resolveContract({ provider: 'openai', model: 'unknown-model' })).toThrow(
      /dimension/i,
    );
  });

  it('resolves unknown Ollama models with an explicit dimension', () => {
    expect(
      resolveContract({ provider: 'ollama', model: 'local-model', dimensions: 768 }).dimension,
    ).toBe(768);
  });
});

describe('contractsMatch', () => {
  it('returns null for matching contracts', () => {
    const contract = resolveContract(baseConfig);

    expect(contractsMatch(contract, { ...contract })).toBeNull();
  });

  it('names every differing contract field', () => {
    const first = resolveContract({
      ...baseConfig,
      prefixes: { document: 'a', query: 'b' },
    });
    const second = {
      ...first,
      provider: 'ollama' as const,
      model: 'local-model',
      dimension: 768,
      prefixes: { document: 'c', query: 'd' },
      tokenizerVersion: 2,
      sparseHashVersion: 2,
    };

    expect(contractsMatch(first, second)?.fields).toEqual([
      'provider',
      'model',
      'dimension',
      'prefixes',
      'tokenizerVersion',
      'sparseHashVersion',
    ]);
  });

  it('detects a prefix-pair-only mismatch', () => {
    const first = resolveContract(baseConfig);
    const second = resolveContract({
      ...baseConfig,
      prefixes: { document: 'passage: ', query: 'query: ' },
    });

    expect(contractsMatch(first, second)?.fields).toEqual(['prefixes']);
  });

  it('includes both values in a contract diff', () => {
    const first = resolveContract(baseConfig);
    const second = resolveContract({ ...baseConfig, dimensions: 768 });
    const diff = contractsMatch(first, second);

    expect(diff?.values.dimension).toEqual({ active: 512, persisted: 768 });
  });
});

describe('contractFingerprint', () => {
  it('is stable across calls', () => {
    const contract = resolveContract(baseConfig);

    expect(contractFingerprint(contract)).toBe(contractFingerprint(contract));
  });

  it('changes when each contract field changes', () => {
    const contract = resolveContract(baseConfig);
    const variants = [
      { ...contract, provider: 'ollama' as const },
      { ...contract, model: 'other-model' },
      { ...contract, dimension: 768 },
      { ...contract, prefixes: { document: 'a', query: 'b' } },
      { ...contract, tokenizerVersion: 2 },
      { ...contract, sparseHashVersion: 2 },
    ];

    for (const variant of variants) {
      expect(contractFingerprint(variant)).not.toBe(contractFingerprint(contract));
    }
  });

  it('is exported from the core barrel', async () => {
    const core = await import('../index.js');
    const contract = core.resolveContract(baseConfig);

    expect(core.contractFingerprint(contract)).toBe(contractFingerprint(contract));
    expect(core.contractsMatch(contract, contract)).toBeNull();
  });
});
