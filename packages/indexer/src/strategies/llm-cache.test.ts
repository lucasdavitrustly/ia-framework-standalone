import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { LlmChunkCache } from './llm-cache.js';

describe('LlmChunkCache', () => {
  let tmpDir: string;
  let cachePath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `llm-cache-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
    cachePath = join(tmpDir, 'llm-chunk-cache.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined for cache miss', () => {
    const cache = new LlmChunkCache(cachePath);
    const result = cache.get('nonexistent-hash', 'llama3.2:latest', 1);
    expect(result).toBeUndefined();
  });

  it('returns cached chunks after set()', () => {
    const cache = new LlmChunkCache(cachePath);
    const chunks = [
      { startLine: 1, endLine: 10, summary: 'Import block' },
      { startLine: 11, endLine: 30, summary: 'Main function' },
    ];
    cache.set('abc123hash', 'llama3.2:latest', 1, chunks);
    const result = cache.get('abc123hash', 'llama3.2:latest', 1);
    expect(result).toEqual(chunks);
  });

  it('cache key includes model name — different model is a miss', () => {
    const cache = new LlmChunkCache(cachePath);
    const chunks = [{ startLine: 1, endLine: 5, summary: 'test chunk' }];
    cache.set('abc123hash', 'llama3.2:latest', 1, chunks);

    // Same hash but different model = miss
    expect(cache.get('abc123hash', 'qwen2.5-coder:latest', 1)).toBeUndefined();
    // Same hash + same model = hit
    expect(cache.get('abc123hash', 'llama3.2:latest', 1)).toEqual(chunks);
  });

  it('load() reads from JSON file, save() writes JSON file', async () => {
    // Set up cache and save it
    const cache1 = new LlmChunkCache(cachePath);
    const chunks = [{ startLine: 1, endLine: 20, summary: 'First chunk' }];
    cache1.set('hash1', 'model1', 1, chunks);
    await cache1.save();

    // Verify file was written
    const content = await readFile(cachePath, 'utf-8');
    expect(() => {
      JSON.parse(content);
    }).not.toThrow();

    // Load from fresh cache instance
    const cache2 = new LlmChunkCache(cachePath);
    await cache2.load();
    const result = cache2.get('hash1', 'model1', 1);
    expect(result).toEqual(chunks);
  });

  it('load() is resilient to missing JSON file', async () => {
    const cache = new LlmChunkCache(join(tmpDir, 'nonexistent.json'));
    await expect(cache.load()).resolves.not.toThrow();
    expect(cache.get('anything', 'model', 1)).toBeUndefined();
  });

  it('load() is resilient to corrupt JSON file', async () => {
    const corruptPath = join(tmpDir, 'corrupt.json');
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(corruptPath, 'not valid json {{{{');

    const cache = new LlmChunkCache(corruptPath);
    await expect(cache.load()).resolves.not.toThrow();
    expect(cache.get('anything', 'model', 1)).toBeUndefined();
  });
});
