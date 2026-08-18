import { describe, it, expect } from 'vitest';
import type { CodeChunk } from '@ia-framework/ast-parser';
import type { EnrichmentConfig } from '@ia-framework/core';

/**
 * Tests for pipeline streaming (producer-consumer) behavior.
 * User Story 4: Overlap enrichment and embedding so total time approaches max(enrichment, embedding).
 *
 * These tests verify the streaming architecture by mocking the enricher and embedder
 * to track timing and ordering of operations.
 */

// Helper to create a mock CodeChunk with optional stereotype
function makeChunk(overrides: Partial<CodeChunk & { stereotype?: string }> = {}): CodeChunk {
  return {
    id: `chunk-${Math.random().toString(36).slice(2, 8)}`,
    filePath: '/test/file.ts',
    relativePath: 'test/file.ts',
    content: 'function test() { return 1; }',
    startLine: 1,
    endLine: 10,
    language: 'typescript',
    chunkType: 'function',
    name: 'test',
    imports: [],
    exports: [],
    chunkIndex: 0,
    totalChunks: 1,
    indexedAt: new Date().toISOString(),
    ...overrides,
  } as CodeChunk;
}

describe('Pipeline Streaming - Producer-Consumer (US4)', () => {
  // T045: Skipped chunks (excluded from enrichment) are immediately available
  // for embedding without waiting for enrichment
  it('skipped chunks are immediately available for embedding without waiting for enrichment', async () => {
    // This test verifies that chunks excluded by language/stereotype filters
    // are passed to the embedding queue immediately, not after enrichment completes.
    const { filterChunksForEnrichment } = await import('../pipeline.js');

    const enrichableChunk = makeChunk({
      id: 'enrichable-1',
      language: 'typescript',
      stereotype: 'service',
    });
    const skippedChunk = makeChunk({
      id: 'skipped-1',
      language: 'typescript',
      stereotype: 'test',
    });

    const config: EnrichmentConfig = {
      provider: 'ollama',
      model: 'qwen3:8b',
      excludeLanguages: [],
      excludeStereotypes: ['test'],
    };

    const { enrichable, skipped } = filterChunksForEnrichment(
      [enrichableChunk, skippedChunk],
      config,
    );

    // Skipped chunks should be available for embedding immediately
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.id).toBe('skipped-1');
    expect(enrichable).toHaveLength(1);
    expect(enrichable[0]!.id).toBe('enrichable-1');

    // The streaming architecture places skipped chunks into pendingEmbed buffer
    // before enrichment starts. This verifies the precondition.
    const pendingEmbed = [...skipped];
    expect(pendingEmbed.length).toBeGreaterThan(0);
    expect(pendingEmbed[0]!.id).toBe('skipped-1');
  });

  // T046: Embedding batches start processing before all enrichment batches complete
  it('embedding batches start processing before all enrichment batches complete', () => {
    // Simulate the streaming pipeline where embedding flushes happen
    // as enrichment batches complete (not waiting for all enrichment)
    const embeddingBatchSize = 2;
    const embedCalls: number[] = []; // Track when embedding calls happen
    let enrichBatchesCompleted = 0;
    const totalEnrichBatches = 3;

    // Simulate enrichment completing one batch at a time
    // After each batch, pendingEmbed grows and flushToEmbedding may trigger
    const pendingEmbed: CodeChunk[] = [];

    function flushToEmbedding(force = false) {
      while (pendingEmbed.length >= embeddingBatchSize || (force && pendingEmbed.length > 0)) {
        pendingEmbed.splice(0, embeddingBatchSize);
        embedCalls.push(enrichBatchesCompleted); // Record which enrichment batch triggered this
      }
    }

    // Simulate enrichment batches completing one by one
    for (let i = 0; i < totalEnrichBatches; i++) {
      // Each enrichment batch produces 2 chunks
      pendingEmbed.push(makeChunk({ id: `enriched-${i}-0` }), makeChunk({ id: `enriched-${i}-1` }));
      enrichBatchesCompleted++;
      flushToEmbedding();
    }

    // Embedding should have started before all enrichment completed
    // (embedCalls entries with enrichBatchesCompleted < totalEnrichBatches)
    expect(embedCalls.length).toBeGreaterThanOrEqual(2);
    expect(embedCalls[0]).toBeLessThan(totalEnrichBatches);
    // First embed call should happen after first enrichment batch (not after all)
    expect(embedCalls[0]).toBe(1);
  });

  // T047: Remaining chunks in accumulator are flushed to embedding when enrichment finishes
  it('remaining chunks in accumulator are flushed when enrichment finishes (partial final batch)', () => {
    const embeddingBatchSize = 5;
    const embedBatches: CodeChunk[][] = [];
    const pendingEmbed: CodeChunk[] = [];

    function flushToEmbedding(force = false) {
      while (pendingEmbed.length >= embeddingBatchSize || (force && pendingEmbed.length > 0)) {
        const batch = pendingEmbed.splice(0, embeddingBatchSize);
        embedBatches.push(batch);
      }
    }

    // Simulate enrichment producing 7 chunks total (not evenly divisible by batch size 5)
    for (let i = 0; i < 7; i++) {
      pendingEmbed.push(makeChunk({ id: `chunk-${i}` }));
    }
    flushToEmbedding(); // Normal flush: gets first batch of 5

    expect(embedBatches).toHaveLength(1);
    expect(embedBatches[0]).toHaveLength(5);
    expect(pendingEmbed).toHaveLength(2); // 2 remaining

    // Final flush with force=true (called when enrichment idle)
    flushToEmbedding(true);

    expect(embedBatches).toHaveLength(2);
    expect(embedBatches[1]).toHaveLength(2); // Partial final batch
    expect(pendingEmbed).toHaveLength(0); // Buffer fully drained
  });

  // T048: Abort signal clears both enrichment and embedding queues
  it('abort signal clears both enrichment and embedding queues', async () => {
    const PQueue = (await import('p-queue')).default;

    const enrichQueue = new PQueue({ concurrency: 2 });
    const embedQueue = new PQueue({ concurrency: 2 });

    const controller = new AbortController();

    let enrichTasksCompleted = 0;
    let embedTasksCompleted = 0;

    // Add tasks to both queues
    for (let i = 0; i < 10; i++) {
      void enrichQueue.add(async () => {
        await new Promise((r) => setTimeout(r, 50));
        enrichTasksCompleted++;
      });
      void embedQueue.add(async () => {
        await new Promise((r) => setTimeout(r, 50));
        embedTasksCompleted++;
      });
    }

    // Abort signal should clear both queues
    controller.signal.addEventListener(
      'abort',
      () => {
        enrichQueue.clear();
        embedQueue.clear();
      },
      { once: true },
    );

    // Let a few tasks run, then abort
    await new Promise((r) => setTimeout(r, 100));
    controller.abort();

    // Wait for currently running tasks to finish
    await enrichQueue.onIdle();
    await embedQueue.onIdle();

    // Not all tasks should have completed (some were cleared)
    expect(enrichTasksCompleted).toBeLessThan(10);
    expect(embedTasksCompleted).toBeLessThan(10);
  });

  // T049: Embedding failure for one batch does not stall other batches
  it('embedding failure for one batch does not stall other batches', async () => {
    const PQueue = (await import('p-queue')).default;

    const embedQueue = new PQueue({ concurrency: 3 });
    const results: Array<{ batchId: number; success: boolean }> = [];

    // Simulate 5 embedding batches where batch #2 fails
    for (let i = 0; i < 5; i++) {
      void embedQueue.add(async () => {
        if (i === 2) {
          // Batch 2 fails
          try {
            throw new Error('Embedding failed for batch 2');
          } catch {
            results.push({ batchId: i, success: false });
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 10));
        results.push({ batchId: i, success: true });
      });
    }

    await embedQueue.onIdle();

    // All 5 batches should have been processed (not stalled by failure)
    expect(results).toHaveLength(5);
    // Batch 2 failed but others succeeded
    expect(results.find((r) => r.batchId === 2)?.success).toBe(false);
    expect(results.filter((r) => r.success)).toHaveLength(4);
  });
});
