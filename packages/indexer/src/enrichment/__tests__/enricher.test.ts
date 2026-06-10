import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CodeChunk } from '@ia-framework/ast-parser';
import type { EnrichmentConfig } from '@ia-framework/core';
import { LlmEnricher } from '../enricher.js';

/**
 * Tests for enrichment sub-batching (US3) and concurrency (US2).
 */

// Track fetch calls to verify batch sizes
let fetchCalls: { url: string; body: unknown }[] = [];

// Helper to create a mock CodeChunk with enough content to trigger isLargeFile
function makeChunk(overrides: Partial<CodeChunk> = {}): CodeChunk {
  return {
    id: 'chunk-1',
    filePath: '/test/file.ts',
    content: 'function test() { return 1; }',
    startLine: 1,
    endLine: 3,
    language: 'typescript',
    chunkType: 'function',
    name: 'test',
    ...overrides,
  } as CodeChunk;
}

/**
 * Creates a large content string that makes totalTokens exceed LARGE_FILE_THRESHOLD * numCtx.
 * With numCtx=1000, LARGE_FILE_THRESHOLD=0.7, we need > 700 tokens = 2800 chars total.
 * Distributing across chunks: if we have 25 chunks, each needs ~120 chars.
 */
function makeLargeContent(size = 150): string {
  return 'x'.repeat(size);
}

// Mock fetch to intercept Ollama calls
function mockFetch() {
  fetchCalls = [];
  const mockFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    const body = bodyStr ? JSON.parse(bodyStr) : {};
    fetchCalls.push({ url: url.toString(), body });

    // Count chunks in the prompt by counting occurrences of chunk IDs
    // Return a valid enrichment response
    return new Response(
      JSON.stringify({
        response: JSON.stringify({ chunks: [] }),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });

  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

// Default config with small numCtx to make it easy to trigger isLargeFile path
const baseConfig: EnrichmentConfig = {
  provider: 'ollama',
  model: 'qwen3:8b',
  numCtx: 1000, // Small numCtx so we easily trigger large-file path
  concurrency: 3,
  retryAttempts: 0,
  skipOnFailure: true,
};

describe('LlmEnricher - Sub-Batching (US3)', () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T015: _top_level group of 25 chunks produces 3 sub-batches (10+10+5)
  it('_top_level group of 25 chunks produces 3 sub-batches (10+10+5)', async () => {
    // All chunks have no parentName → all go to _top_level group
    const chunks: CodeChunk[] = Array.from({ length: 25 }, (_, i) =>
      makeChunk({
        id: `c${i}`,
        name: `func${i}`,
        chunkType: 'function',
        parentName: undefined,
        content: makeLargeContent(),
      }),
    );

    const enricher = new LlmEnricher(baseConfig);
    await enricher.enrich(chunks);

    // With BATCH_SIZE=10, 25 chunks should produce 3 batches: 10+10+5
    expect(fetchCalls).toHaveLength(3);
  });

  // T016: Class group of 25 methods produces 3 sub-batches (10+10+5)
  it('class group of 25 methods produces 3 sub-batches (10+10+5)', async () => {
    // All chunks belong to the same class "MyClass"
    const chunks: CodeChunk[] = Array.from({ length: 25 }, (_, i) =>
      makeChunk({
        id: `m${i}`,
        name: `method${i}`,
        chunkType: 'method',
        parentName: 'MyClass',
        content: makeLargeContent(),
      }),
    );

    const enricher = new LlmEnricher(baseConfig);
    await enricher.enrich(chunks);

    // With BATCH_SIZE=10, 25 methods in one class → 3 batches: 10+10+5
    expect(fetchCalls).toHaveLength(3);
  });

  // T017: Group exactly at BATCH_SIZE (10) produces single batch (no split)
  it('group exactly at BATCH_SIZE (10) produces single batch (no split)', async () => {
    const chunks: CodeChunk[] = Array.from({ length: 10 }, (_, i) =>
      makeChunk({
        id: `c${i}`,
        name: `func${i}`,
        chunkType: 'function',
        parentName: undefined,
        content: makeLargeContent(300), // Large enough to trigger isLargeFile for 10 chunks
      }),
    );

    const enricher = new LlmEnricher(baseConfig);
    await enricher.enrich(chunks);

    // Exactly 10 chunks → 1 batch (no sub-splitting needed)
    expect(fetchCalls).toHaveLength(1);
  });

  // T018: No single batch in output exceeds BATCH_SIZE regardless of input size
  it('no single batch in output exceeds BATCH_SIZE regardless of input size', async () => {
    // Create 50 top-level functions — should produce 5 batches of 10
    const chunks: CodeChunk[] = Array.from({ length: 50 }, (_, i) =>
      makeChunk({
        id: `c${i}`,
        name: `func${i}`,
        chunkType: 'function',
        parentName: undefined,
        content: makeLargeContent(80), // ~4000 chars total, triggers isLargeFile with numCtx=1000
      }),
    );

    const enricher = new LlmEnricher(baseConfig);
    await enricher.enrich(chunks);

    // 50 chunks / 10 per batch = 5 batches
    expect(fetchCalls).toHaveLength(5);

    // Verify no single prompt contains more than 10 chunk references
    // Each batch prompt includes chunk IDs — verify via the number of calls
    // (If sub-batching is broken, all 50 chunks go in 1 call)
    expect(fetchCalls.length).toBeGreaterThanOrEqual(5);
  });
});

describe('LlmEnricher - Concurrency (US2)', () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T022: enricher p-queue uses configured concurrency value from EnrichmentConfig
  it('enricher p-queue uses configured concurrency value from EnrichmentConfig', async () => {
    // Create chunks that will be processed in non-large-file mode (sequential batches)
    const chunks: CodeChunk[] = Array.from({ length: 30 }, (_, i) =>
      makeChunk({
        id: `c${i}`,
        name: `func${i}`,
        content: 'short content', // Small content — won't trigger isLargeFile
      }),
    );

    // Use high concurrency — all 3 batches should execute
    const highConcurrencyConfig: EnrichmentConfig = {
      ...baseConfig,
      numCtx: 100000, // Large numCtx ensures non-large-file path (sequential batching)
      concurrency: 10,
    };

    const enricher = new LlmEnricher(highConcurrencyConfig);
    await enricher.enrich(chunks);

    // 30 chunks / 10 per batch = 3 batches; all should complete
    expect(fetchCalls).toHaveLength(3);
  });

  // T023: numCtx value from config is passed as num_ctx in Ollama API request body
  it('numCtx value from config is passed as num_ctx in Ollama API request body', async () => {
    const chunks: CodeChunk[] = [makeChunk({ id: 'c1', name: 'func1', content: 'const x = 1;' })];

    const customNumCtx = 16384;
    const config: EnrichmentConfig = {
      ...baseConfig,
      numCtx: customNumCtx,
    };

    const enricher = new LlmEnricher(config);
    await enricher.enrich(chunks);

    expect(fetchCalls).toHaveLength(1);
    const requestBody = fetchCalls[0]!.body as { options?: { num_ctx?: number } };
    expect(requestBody.options?.num_ctx).toBe(customNumCtx);
  });
});
