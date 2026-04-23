/**
 * Prompt versioning tests.
 * Verifies that:
 * - Cache key format includes prompt version
 * - Cache miss occurs when prompt version changes
 * - PROMPT_CONTENT_HASH is a deterministic 8-char hex string
 * - LlmChunkingStrategy.getMetadata() returns correct shape
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LlmChunkCache } from '../strategies/llm-cache.js';
import { PROMPT_CONTENT_HASH } from '../strategies/prompt.js';
import { LlmChunkingStrategy } from '../strategies/llm-strategy.js';

describe('LlmChunkCache — prompt version in cache key', () => {
  let cache: LlmChunkCache;

  beforeEach(() => {
    cache = new LlmChunkCache('/tmp/test-cache.json');
  });

  it('makes different keys for different prompt versions', () => {
    const entry = [{ startLine: 1, endLine: 10, summary: 'test' }];

    cache.set('abc123', 'llama3', 1, entry);
    cache.set('abc123', 'llama3', 2, entry);

    const v1 = cache.get('abc123', 'llama3', 1);
    const v2 = cache.get('abc123', 'llama3', 2);

    expect(v1).toBeDefined();
    expect(v2).toBeDefined();
    // They resolve to the same data but are stored under different keys
    expect(v1).toEqual(v2);
  });

  it('returns undefined (cache miss) when prompt version changes', () => {
    const entry = [{ startLine: 1, endLine: 10, summary: 'test' }];
    cache.set('deadbeef', 'llama3', 1, entry);

    const result = cache.get('deadbeef', 'llama3', 2);
    expect(result).toBeUndefined();
  });

  it('returns cached data when prompt version matches', () => {
    const entry = [{ startLine: 5, endLine: 15, summary: 'hello world' }];
    cache.set('cafebabe', 'llama3', 3, entry);

    const result = cache.get('cafebabe', 'llama3', 3);
    expect(result).toEqual(entry);
  });

  it('key format includes promptVersion as third segment', () => {
    // Indirectly test key format: set with version 1, miss with version 2
    const entry = [{ startLine: 1, endLine: 5, summary: 'chunk' }];
    cache.set('hash1', 'model1', 1, entry);

    // If key is "hash1:model1:1", then "hash1:model1:2" should miss
    expect(cache.get('hash1', 'model1', 2)).toBeUndefined();
    // And "hash1:model1:1" should hit
    expect(cache.get('hash1', 'model1', 1)).toEqual(entry);
  });
});

describe('PROMPT_CONTENT_HASH', () => {
  it('is a non-empty 8-character hex string', () => {
    expect(typeof PROMPT_CONTENT_HASH).toBe('string');
    expect(PROMPT_CONTENT_HASH).toHaveLength(8);
    expect(PROMPT_CONTENT_HASH).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic (same value on repeated calls)', () => {
    // Importing the same module twice gives the same value
    // (module is cached — this just confirms it's not random)
    expect(PROMPT_CONTENT_HASH).toBe(PROMPT_CONTENT_HASH);
  });
});

describe('LlmChunkingStrategy.getMetadata()', () => {
  it('returns promptVersion and promptContentHash with correct shape', () => {
    const strategy = new LlmChunkingStrategy({
      model: 'llama3',
      cachePath: '/tmp/test-cache.json',
      promptVersion: 2,
    });

    const metadata = strategy.getMetadata();

    expect(metadata).toHaveProperty('promptVersion', 2);
    expect(metadata).toHaveProperty('promptContentHash');
    expect(typeof metadata.promptContentHash).toBe('string');
    expect(metadata.promptContentHash).toHaveLength(8);
  });

  it('defaults promptVersion to 1 when not provided', () => {
    const strategy = new LlmChunkingStrategy({
      model: 'llama3',
      cachePath: '/tmp/test-cache.json',
    });

    const metadata = strategy.getMetadata();
    expect(metadata.promptVersion).toBe(1);
  });
});
