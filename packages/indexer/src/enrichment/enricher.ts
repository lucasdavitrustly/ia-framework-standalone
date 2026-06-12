import { createLogger } from '@ia-framework/core';
import type { EnrichmentConfig } from '@ia-framework/core';
import type { CodeChunk } from '@ia-framework/ast-parser';
import PQueue from 'p-queue';
import {
  buildEnrichmentPrompt,
  parseEnrichmentResponse,
  type ChunkForPrompt,
  type EnrichedChunkResponse,
} from './prompt.js';
import type { CachedEnrichment } from './cache.js';
import { formatOllamaError } from '../errors/ollama-errors.js';

/**
 * T027: LLM enricher
 *
 * Calls Ollama to enrich code chunks with metadata:
 *   - description: one-sentence summary
 *   - businessContext: business domain
 *   - semanticTags: 3-7 search keywords
 *   - relationships: dependencies / references
 *
 * Features:
 *   - Batches up to 10 methods per Ollama call (configurable)
 *   - Retries up to retryAttempts times on failure
 *   - Graceful degradation: if skipOnFailure=true, returns chunks unchanged
 *   - Sets enrichedAt and enrichmentModel on each enriched chunk
 */

const logger = createLogger('enricher');

// ── Dynamic batching constants (exported for testability) ─────────────────────

/** Fraction of numCtx allocated to input token budget. */
export const DEFAULT_TOKEN_BUDGET_RATIO = 0.45;
export const PROMPT_OVERHEAD_TOKENS = 500;
export const MAX_BATCH_CHUNKS = 20;
export const DEFAULT_CHARS_PER_TOKEN = 3;
export const DEFAULT_OUTPUT_TOKENS_PER_CHUNK = 300;
export const OUTPUT_TOKENS_OVERHEAD = 100;

// Legacy aliases (kept for existing test imports)
export const TOKEN_BUDGET_RATIO = DEFAULT_TOKEN_BUDGET_RATIO;
export const CHARS_PER_TOKEN = DEFAULT_CHARS_PER_TOKEN;
export const OUTPUT_TOKENS_PER_CHUNK = DEFAULT_OUTPUT_TOKENS_PER_CHUNK;

// ── Dynamic batch builder ─────────────────────────────────────────────────────

/**
 * Builds batches using greedy bin-packing based on token budget.
 * Each batch respects both the token budget (derived from numCtx) and maxChunks.
 * Oversized chunks that exceed the budget alone still get their own batch (never dropped).
 */
export function buildDynamicBatches(
  chunks: CodeChunk[],
  numCtx: number,
  maxChunks: number = MAX_BATCH_CHUNKS,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
  tokenBudgetRatio: number = DEFAULT_TOKEN_BUDGET_RATIO,
): CodeChunk[][] {
  if (chunks.length === 0) return [];

  const tokenBudget = numCtx * tokenBudgetRatio - PROMPT_OVERHEAD_TOKENS;
  const batches: CodeChunk[][] = [];
  let currentBatch: CodeChunk[] = [];
  let currentBatchTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = (chunk.content?.length ?? 0) / charsPerToken;

    if (
      currentBatch.length > 0 &&
      (currentBatchTokens + chunkTokens > tokenBudget || currentBatch.length >= maxChunks)
    ) {
      // Close current batch and start a new one
      batches.push(currentBatch);
      currentBatch = [chunk];
      currentBatchTokens = chunkTokens;
    } else {
      currentBatch.push(chunk);
      currentBatchTokens += chunkTokens;
    }
  }

  // Push the last batch if non-empty
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

// ── Enriched chunk type ───────────────────────────────────────────────────────

export type EnrichedCodeChunk = CodeChunk & {
  description?: string | undefined;
  businessContext?: string | undefined;
  semanticTags?: string[] | undefined;
  relationships?:
    | Array<{
        target: string;
        type: 'uses' | 'implements' | 'extends' | 'configures' | 'produces' | 'consumes' | 'tests';
        label?: string | undefined;
      }>
    | undefined;
  enrichedAt?: string | undefined;
  enrichmentModel?: string | undefined;
};

// ── Progress callback type ────────────────────────────────────────────────────

export interface EnrichmentProgress {
  /** Number of Ollama calls completed so far */
  batchesCompleted: number;
  /** Total number of Ollama calls that will be made */
  batchesTotal: number;
  /** filePath of the first chunk in the current batch */
  currentFile?: string | undefined;
  /** Warning message from a failed batch (when skipOnFailure is true) */
  warning?: string | undefined;
}

// ── LlmEnricher class ─────────────────────────────────────────────────────────

export class LlmEnricher {
  private readonly config: Required<Pick<EnrichmentConfig, 'provider' | 'model'>> &
    Pick<
      EnrichmentConfig,
      | 'baseUrl'
      | 'numCtx'
      | 'concurrency'
      | 'retryAttempts'
      | 'skipOnFailure'
      | 'maxBatchChunks'
      | 'charsPerToken'
      | 'tokenBudgetRatio'
      | 'outputTokensPerChunk'
    >;

  constructor(config: EnrichmentConfig) {
    this.config = {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl ?? 'http://localhost:11434',
      numCtx: config.numCtx ?? 32768,
      concurrency: config.concurrency ?? 5,
      retryAttempts: config.retryAttempts ?? 2,
      skipOnFailure: config.skipOnFailure ?? true,
      maxBatchChunks: config.maxBatchChunks ?? MAX_BATCH_CHUNKS,
      charsPerToken: config.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN,
      tokenBudgetRatio: config.tokenBudgetRatio ?? DEFAULT_TOKEN_BUDGET_RATIO,
      outputTokensPerChunk: config.outputTokensPerChunk ?? DEFAULT_OUTPUT_TOKENS_PER_CHUNK,
    };
  }

  /**
   * Enrich a batch of chunks with LLM-generated metadata.
   * Uses dynamic token-budget batching and positional response mapping.
   * On failure, behaviour depends on skipOnFailure config.
   *
   * Large-file strategy: when total chunk content exceeds 70% of numCtx
   * (measured in approximate tokens), chunks are grouped by class
   * (parentName / class-signature name) and each class is batched independently.
   */
  async enrich(
    chunks: CodeChunk[],
    onProgress?: (p: EnrichmentProgress) => void,
  ): Promise<EnrichedCodeChunk[]> {
    if (chunks.length === 0) return [];

    const LARGE_FILE_THRESHOLD = 0.7;
    const charsPerToken = this.config.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
    const tokenBudgetRatio = this.config.tokenBudgetRatio ?? DEFAULT_TOKEN_BUDGET_RATIO;

    const totalChars = chunks.reduce((sum, c) => sum + (c.content?.length ?? 0), 0);
    const totalTokens = totalChars / charsPerToken;
    const numCtx = this.config.numCtx ?? 32768;
    const isLargeFile = totalTokens > LARGE_FILE_THRESHOLD * numCtx;
    const maxChunks = this.config.maxBatchChunks ?? MAX_BATCH_CHUNKS;

    const result: EnrichedCodeChunk[] = [...chunks] as EnrichedCodeChunk[];

    // Pre-build index map for concurrent-safe positional writes
    const indexMap = new Map<string, number>();
    for (let i = 0; i < chunks.length; i++) {
      indexMap.set(chunks[i]!.id, i);
    }

    // Pre-compute batchesTotal so we can report it on every progress event
    let batchGroups: CodeChunk[][];
    if (isLargeFile) {
      batchGroups = [];
      const groups = this.groupByClass(chunks);
      for (const group of groups.values()) {
        const groupBatches = buildDynamicBatches(
          group,
          numCtx,
          maxChunks,
          charsPerToken,
          tokenBudgetRatio,
        );
        batchGroups.push(...groupBatches);
      }
    } else {
      batchGroups = buildDynamicBatches(chunks, numCtx, maxChunks, charsPerToken, tokenBudgetRatio);
    }
    const batchesTotal = batchGroups.length;
    let batchesCompleted = 0;

    const applyBatch = async (batch: CodeChunk[]): Promise<void> => {
      const filePath = batch[0]?.filePath ?? '(unknown)';
      let batchWarning: string | undefined;
      try {
        const enrichments = await this.enrichBatchWithRetry(batch, filePath);
        // Positional mapping: enrichments[i] corresponds to batch[i]
        const enrichedAt = new Date().toISOString();
        const enrichmentModel = this.config.model;
        for (let i = 0; i < batch.length && i < enrichments.length; i++) {
          const globalIdx = indexMap.get(batch[i]!.id);
          if (globalIdx !== undefined) {
            const enrichment = enrichments[i]!;
            const chunk = batch[i]!;
            const enriched: EnrichedCodeChunk = { ...chunk, enrichedAt, enrichmentModel };
            if (enrichment.description) enriched.description = enrichment.description;
            if (enrichment.businessContext) enriched.businessContext = enrichment.businessContext;
            if (enrichment.semanticTags && enrichment.semanticTags.length > 0)
              enriched.semanticTags = enrichment.semanticTags;
            if (enrichment.relationships && enrichment.relationships.length > 0)
              enriched.relationships = enrichment.relationships;
            result[globalIdx] = enriched;
          }
        }
        // Warn on partial response
        if (enrichments.length < batch.length) {
          batchWarning = `Partial enrichment: got ${enrichments.length}/${batch.length} results for ${filePath}`;
          logger.warn(batchWarning);
        }
      } catch (err) {
        if (this.config.skipOnFailure) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            `Ollama enrichment failed for batch (${batch.length} chunks) — skipping enrichment. Error: ${msg}`,
          );
          batchWarning = `Enrichment failed for ${batch.length} chunks at ${filePath}\n${msg}`;
        } else {
          throw err;
        }
      }
      batchesCompleted++;
      onProgress?.({
        batchesCompleted,
        batchesTotal,
        currentFile: batch[0]?.filePath,
        warning: batchWarning,
      });
    };

    // Process batches concurrently using p-queue bounded by config.concurrency
    const concurrency = this.config.concurrency ?? 3;
    const queue = new PQueue({ concurrency });
    await Promise.all(batchGroups.map((batch) => queue.add(() => applyBatch(batch))));

    return result;
  }

  /**
   * Group chunks by their class (parentName for methods/fields, name for
   * class-signature chunks). Chunks without a class go under '_top_level'.
   */
  private groupByClass(chunks: CodeChunk[]): Map<string, CodeChunk[]> {
    const groups = new Map<string, CodeChunk[]>();

    for (const chunk of chunks) {
      let key: string;
      if (chunk.chunkType === 'class-signature') {
        key = chunk.name ?? '_top_level';
      } else if (chunk.parentName) {
        key = chunk.parentName;
      } else {
        key = '_top_level';
      }

      const existing = groups.get(key);
      if (existing) {
        existing.push(chunk);
      } else {
        groups.set(key, [chunk]);
      }
    }

    return groups;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async enrichBatchWithRetry(
    chunks: CodeChunk[],
    filePath: string,
  ): Promise<EnrichedChunkResponse[]> {
    let lastError: unknown;
    const attempts = (this.config.retryAttempts ?? 2) + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.enrichBatch(chunks, filePath);
      } catch (err) {
        lastError = err;
        if (attempt < attempts - 1) {
          // Wait briefly before retry
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  private async enrichBatch(
    chunks: CodeChunk[],
    filePath: string,
  ): Promise<EnrichedChunkResponse[]> {
    const chunkInputs: ChunkForPrompt[] = chunks.map((c) => ({
      id: c.id,
      name: c.name,
      language: c.language,
      chunkType: c.chunkType,
      content: c.content,
      imports: c.imports,
      annotations: c.annotations,
    }));

    const prompt = buildEnrichmentPrompt(chunkInputs, filePath);
    const outputTokensPerChunk =
      this.config.outputTokensPerChunk ?? DEFAULT_OUTPUT_TOKENS_PER_CHUNK;
    const numPredict = chunks.length * outputTokensPerChunk + OUTPUT_TOKENS_OVERHEAD;
    const rawResponse = await this.callOllama(prompt, numPredict);
    const parsed = parseEnrichmentResponse(rawResponse);

    if (!parsed) {
      throw new Error(
        formatOllamaError({
          body: rawResponse,
          model: this.config.model,
          baseUrl: this.config.baseUrl ?? 'http://localhost:11434',
          phase: 'enrichment',
          parseFailure: true,
        }),
      );
    }

    // Return the flat array — caller maps positionally
    return parsed;
  }

  private async callOllama(prompt: string, numPredict?: number): Promise<string> {
    const url = `${this.config.baseUrl}/api/generate`;
    const requestBody = JSON.stringify({
      model: this.config.model,
      prompt,
      stream: false,
      format: 'json',
      options: {
        num_ctx: this.config.numCtx,
        num_predict: numPredict ?? 4096,
        temperature: 0.1,
      },
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
    } catch (err) {
      // Network error (connection refused, timeout, etc.)
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        formatOllamaError({
          body: message,
          model: this.config.model,
          baseUrl: this.config.baseUrl ?? 'http://localhost:11434',
          phase: 'enrichment',
        }),
      );
    }

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        formatOllamaError({
          status: response.status,
          body: responseBody,
          model: this.config.model,
          baseUrl: this.config.baseUrl ?? 'http://localhost:11434',
          phase: 'enrichment',
        }),
      );
    }

    let data: { response: string };
    try {
      data = (await response.json()) as { response: string };
    } catch {
      const rawText = await response.text().catch(() => '(unable to read response body)');
      throw new Error(
        formatOllamaError({
          status: response.status,
          body: rawText,
          model: this.config.model,
          baseUrl: this.config.baseUrl ?? 'http://localhost:11434',
          phase: 'enrichment',
          parseFailure: true,
        }),
      );
    }
    return data.response;
  }

  /** Build a CachedEnrichment entry from a fully enriched chunk. */
  static toCacheEntry(chunk: EnrichedCodeChunk): CachedEnrichment {
    const entry: CachedEnrichment = {
      enrichedAt: chunk.enrichedAt ?? new Date().toISOString(),
      enrichmentModel: chunk.enrichmentModel ?? 'unknown',
    };
    if (chunk.description) entry.description = chunk.description;
    if (chunk.businessContext) entry.businessContext = chunk.businessContext;
    if (chunk.semanticTags) entry.semanticTags = chunk.semanticTags;
    if (chunk.relationships) entry.relationships = chunk.relationships;
    return entry;
  }
}
