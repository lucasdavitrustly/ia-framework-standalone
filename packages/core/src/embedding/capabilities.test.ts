import { describe, expect, it } from 'vitest';
import { capabilitiesFor } from './capabilities.js';

describe('capabilitiesFor', () => {
  it('returns the text-embedding-3-small capability', () => {
    expect(capabilitiesFor('openai', 'text-embedding-3-small')).toEqual({
      supportsDimensionParam: true,
      nativeDimension: 1536,
      maxInputTokens: 8192,
      maxBatchItems: 2048,
      maxRequestTokens: 300000,
      disableServerTruncation: false,
    });
  });

  it('returns the text-embedding-3-large capability', () => {
    const capabilities = capabilitiesFor('openai', 'text-embedding-3-large');

    expect(capabilities.supportsDimensionParam).toBe(true);
    expect(capabilities.nativeDimension).toBe(3072);
    expect(capabilities.maxInputTokens).toBe(8192);
  });

  it('uses OpenAI documented batch and request limits', () => {
    const capabilities = capabilitiesFor('openai', 'text-embedding-3-small');

    expect(capabilities.maxBatchItems).toBe(2048);
    expect(capabilities.maxRequestTokens).toBe(300000);
  });

  it('does not allow dimensions for text-embedding-ada-002', () => {
    const capabilities = capabilitiesFor('openai', 'text-embedding-ada-002');

    expect(capabilities.supportsDimensionParam).toBe(false);
    expect(capabilities.nativeDimension).toBe(1536);
  });

  it('recognizes other text-embedding-3 models as dimension-capable', () => {
    expect(capabilitiesFor('openai', 'text-embedding-3-custom').supportsDimensionParam).toBe(true);
  });

  it('returns the known Ollama nomic capability', () => {
    const capabilities = capabilitiesFor('ollama', 'nomic-embed-text');

    expect(capabilities.nativeDimension).toBe(768);
    expect(capabilities.supportsDimensionParam).toBe(true);
    expect(capabilities.disableServerTruncation).toBe(true);
  });

  it('recognizes an Ollama latest tag for a known model', () => {
    expect(capabilitiesFor('ollama', 'mxbai-embed-large:latest').nativeDimension).toBe(1024);
  });

  it('enables dimensions and disables truncation for unknown Ollama models', () => {
    const capabilities = capabilitiesFor('ollama', 'local-embedding-model');

    expect(capabilities.supportsDimensionParam).toBe(true);
    expect(capabilities.nativeDimension).toBeUndefined();
    expect(capabilities.disableServerTruncation).toBe(true);
  });

  it('returns conservative limits for an unknown OpenAI model', () => {
    const capabilities = capabilitiesFor('openai', 'unknown-model');

    expect(capabilities.supportsDimensionParam).toBe(false);
    expect(capabilities.nativeDimension).toBeUndefined();
    expect(capabilities.maxInputTokens).toBeLessThan(8192);
    expect(capabilities.maxBatchItems ?? 2048).toBeLessThan(2048);
    expect(capabilities.maxRequestTokens ?? 300000).toBeLessThan(300000);
  });

  it('keeps unknown model lookup deterministic', () => {
    const first = capabilitiesFor('openai', 'unknown-model');
    const second = capabilitiesFor('openai', 'unknown-model');

    expect(second).toEqual(first);
  });

  it('exports a conservative default for unknown Ollama input limits', () => {
    const capabilities = capabilitiesFor('ollama', 'unknown-model');

    expect(capabilities.maxInputTokens).toBeLessThan(8192);
    expect(capabilities.maxInputTokens).toBeGreaterThan(0);
  });

  it('is exported from the core barrel', async () => {
    const core = await import('../index.js');
    const capabilities = core.capabilitiesFor('openai', 'text-embedding-3-small');

    expect(capabilities.supportsDimensionParam).toBe(true);
    expect(capabilities.maxInputTokens).toBe(8192);
  });
});
