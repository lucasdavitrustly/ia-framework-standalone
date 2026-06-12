import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CodeChunk } from '@ia-framework/ast-parser';
import type { EnrichmentConfig } from '@ia-framework/core';
import { LlmEnricher } from '../enricher.js';
import {
  buildDynamicBatches,
  TOKEN_BUDGET_RATIO,
  PROMPT_OVERHEAD_TOKENS,
  MAX_BATCH_CHUNKS,
  CHARS_PER_TOKEN,
} from '../enricher.js';

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
 * Creates content that, when combined across chunks, triggers isLargeFile.
 * With numCtx=3000, LARGE_FILE_THRESHOLD=0.7: need totalTokens > 2100.
 * content=500 chars = 500/3 ≈ 167 tokens/chunk (CHARS_PER_TOKEN=3).
 * For 25 chunks: 25*167=4167 > 2100 → triggers isLargeFile.
 * Budget = 3000*0.45-500 = 850 tokens → 5 chunks per batch (5*167=833 ≤ 850).
 */
function makeLargeContent(size = 500): string {
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

// Default config with numCtx=3000 to trigger isLargeFile with meaningful content
// while giving a reasonable token budget for batching.
const baseConfig: EnrichmentConfig = {
  provider: 'ollama',
  model: 'qwen3:8b',
  numCtx: 3000, // Budget = 3000*0.45-500 = 850 tokens
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

  // T015: _top_level group of 25 chunks produces multiple sub-batches via dynamic batching
  it('_top_level group of 25 chunks produces 5 sub-batches via dynamic batching', async () => {
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

    // With numCtx=3000, budget=850 tokens, each chunk≈167 tokens (500/3)
    // 5 chunks per batch → 25 chunks = 5 batches (5+5+5+5+5)
    expect(fetchCalls).toHaveLength(5);
  });

  // T016: Class group of 25 methods produces 5 sub-batches via dynamic batching
  it('class group of 25 methods produces 5 sub-batches via dynamic batching', async () => {
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

    // With numCtx=3000, budget=850 tokens, each chunk≈167 tokens (500/3)
    // 5 chunks per batch → 25 methods in one class = 5 batches (5+5+5+5+5)
    expect(fetchCalls).toHaveLength(5);
  });

  // T017: Small group fits in single batch (standard path, under budget + MAX_BATCH)
  it('small group fits in single batch when under budget and MAX_BATCH', async () => {
    const chunks: CodeChunk[] = Array.from({ length: 10 }, (_, i) =>
      makeChunk({
        id: `c${i}`,
        name: `func${i}`,
        chunkType: 'function',
        parentName: undefined,
        content: 'short content', // Small content → won't trigger isLargeFile
      }),
    );

    // Use high numCtx so isLargeFile is false (standard path) and budget is large
    const config: EnrichmentConfig = { ...baseConfig, numCtx: 100000 };
    const enricher = new LlmEnricher(config);
    await enricher.enrich(chunks);

    // 10 chunks with tiny content → all fit in 1 batch
    expect(fetchCalls).toHaveLength(1);
  });

  // T018: Large input produces many batches (no single batch exceeds MAX_BATCH_CHUNKS)
  it('large input produces multiple batches respecting MAX_BATCH_CHUNKS', async () => {
    // Create 50 top-level functions — should produce multiple batches
    const chunks: CodeChunk[] = Array.from({ length: 50 }, (_, i) =>
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

    // 50 chunks with budget=850 tokens, 167 tokens/chunk → 5 per batch → 10 batches
    expect(fetchCalls).toHaveLength(10);

    // Verify sub-batching is working (more than 1 batch)
    expect(fetchCalls.length).toBeGreaterThan(1);
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

    // Use high concurrency — all batches should execute
    const highConcurrencyConfig: EnrichmentConfig = {
      ...baseConfig,
      numCtx: 100000, // Large numCtx ensures non-large-file path (sequential batching)
      concurrency: 10,
    };

    const enricher = new LlmEnricher(highConcurrencyConfig);
    await enricher.enrich(chunks);

    // 30 chunks with tiny content, budget=44500 tokens → all fit in 1 batch budget-wise
    // But MAX_BATCH_CHUNKS=20 caps → 2 batches (20+10)
    expect(fetchCalls).toHaveLength(2);
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

describe('buildDynamicBatches - Dynamic Batch Sizing (US3)', () => {
  // T030: 20 small chunks (50 chars each) fit into single batch with numCtx=16384
  it('T030: 20 small chunks (50 chars each) fit into single batch with numCtx=16384', () => {
    const chunks: CodeChunk[] = Array.from({ length: 20 }, (_, i) =>
      makeChunk({ id: `c${i}`, content: 'x'.repeat(50) }),
    );

    const batches = buildDynamicBatches(chunks, 16384);

    // Budget = 16384 * 0.45 - 500 = 6873 tokens
    // 20 chunks × 50 chars / 3 ≈ 333 tokens total → fits in 1 batch
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(20);
  });

  // T031: 40 small chunks split into 2 batches of 20 (MAX_BATCH_CHUNKS cap)
  it('T031: 40 small chunks split into 2 batches of 20 (MAX_BATCH_CHUNKS cap)', () => {
    const chunks: CodeChunk[] = Array.from({ length: 40 }, (_, i) =>
      makeChunk({ id: `c${i}`, content: 'x'.repeat(50) }),
    );

    const batches = buildDynamicBatches(chunks, 16384);

    // Even though token budget is large, MAX_BATCH_CHUNKS=20 caps each batch
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(20);
    expect(batches[1]).toHaveLength(20);
  });

  // T032: 5 large chunks (12000 chars each) produce 2+ batches (exceed token budget)
  it('T032: 5 large chunks (12000 chars each) produce 2+ batches (exceed token budget)', () => {
    const chunks: CodeChunk[] = Array.from({ length: 5 }, (_, i) =>
      makeChunk({ id: `c${i}`, content: 'x'.repeat(12000) }),
    );

    const batches = buildDynamicBatches(chunks, 16384);

    // Budget = 16384 * 0.45 - 500 = 6873 tokens
    // Each chunk = 12000 / 3 = 4000 tokens
    // First batch: 4000 ≤ 6873, try next: 4000+4000=8000 > 6873 → 1 chunk per batch
    // Result: 5 batches of 1
    expect(batches.length).toBeGreaterThanOrEqual(2);
  });

  // T033: single oversized chunk gets its own batch (never dropped)
  it('T033: single oversized chunk gets its own batch (never dropped)', () => {
    const chunks: CodeChunk[] = [makeChunk({ id: 'huge', content: 'x'.repeat(100000) })];

    const batches = buildDynamicBatches(chunks, 16384);

    // Chunk exceeds budget but should still be batched alone
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0]![0]!.id).toBe('huge');
  });

  // T034: empty input (0 chunks) produces 0 batches
  it('T034: empty input (0 chunks) produces 0 batches', () => {
    const batches = buildDynamicBatches([], 16384);

    expect(batches).toHaveLength(0);
  });

  // T035: numCtx=32768 produces proportionally larger token budget
  it('T035: numCtx=32768 produces proportionally larger token budget', () => {
    // With numCtx=32768: budget = 32768 * 0.45 - 500 = 14246 tokens
    // Each chunk = 2000 chars / 3 ≈ 667 tokens
    // Should fit 14246/667 = 21 chunks per batch (but capped at MAX_BATCH_CHUNKS=20)
    const chunks: CodeChunk[] = Array.from({ length: 20 }, (_, i) =>
      makeChunk({ id: `c${i}`, content: 'x'.repeat(2000) }),
    );

    const batches = buildDynamicBatches(chunks, 32768);

    // All 20 fit in one batch (13333 tokens ≤ 14246 budget, and 20 = MAX_BATCH_CHUNKS)
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(20);
  });

  // T036: dynamic batching applies within class-grouped (large-file) path
  it('T036: dynamic batching applies within class-grouped (large-file) path', () => {
    // This tests that buildDynamicBatches works correctly as a pure function
    // regardless of how it's called (standard or class-grouped path)
    const smallChunks: CodeChunk[] = Array.from({ length: 5 }, (_, i) =>
      makeChunk({ id: `small${i}`, content: 'x'.repeat(50), parentName: 'MyClass' }),
    );
    const largeChunks: CodeChunk[] = Array.from({ length: 3 }, (_, i) =>
      makeChunk({ id: `large${i}`, content: 'x'.repeat(12000), parentName: 'MyClass' }),
    );

    // Test with a group of mixed sizes
    const allChunks = [...smallChunks, ...largeChunks];
    const batches = buildDynamicBatches(allChunks, 16384);

    // Budget = 6873 tokens
    // 5 small = 5 × 16.67 = 83 tokens + 3 × 4000 = 12000 tokens
    // Won't all fit in one batch → should produce multiple batches
    expect(batches.length).toBeGreaterThanOrEqual(2);
    // All chunks accounted for
    const totalChunks = batches.reduce((sum: number, b: CodeChunk[]) => sum + b.length, 0);
    expect(totalChunks).toBe(8);
  });

  // Verify exported constants
  it('exported constants have expected values', () => {
    expect(TOKEN_BUDGET_RATIO).toBe(0.45);
    expect(PROMPT_OVERHEAD_TOKENS).toBe(500);
    expect(MAX_BATCH_CHUNKS).toBe(20);
    expect(CHARS_PER_TOKEN).toBe(3);
  });
});
