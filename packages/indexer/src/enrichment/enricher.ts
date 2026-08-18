import { createLogger } from '@ia-framework/core';
import type { EnrichmentConfig } from '@ia-framework/core';
import type { CodeChunk } from '@ia-framework/ast-parser';
import PQueue from 'p-queue';
import {
  buildEnrichmentPrompt,
  buildEnrichmentSchema,
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

/** Per-request Ollama HTTP timeout (ms). Prevents a wedged request from
 * stalling the run indefinitely, especially with retryAttempts > 0. */
export const OLLAMA_REQUEST_TIMEOUT_MS = 120_000;

/** How long Ollama keeps the enrichment model resident between calls. */
export const OLLAMA_KEEP_ALIVE = '30m';

/**
 * Thrown when Ollama cuts generation off at num_predict (done_reason 'length').
 * Carries the raw (truncated) body for diagnostics. Distinct from a generic
 * parse failure because the fix is deterministic: split the batch so each half
 * has more output budget, rather than retrying the identical prompt.
 */
export class EnrichmentTruncationError extends Error {
  constructor(public readonly rawBody: string) {
    super('Ollama enrichment output truncated at num_predict (done_reason: length)');
    this.name = 'EnrichmentTruncationError';
  }
}

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
        // enrichWithSplit recovers from truncation by halving the batch, so a
        // few oversized chunks no longer discard their whole batch's worth of
        // enrichment. Returns per-chunk enrichments aligned to `batch`.
        const enrichments = await this.enrichWithSplit(batch, (w) => {
          // Surface the first split/skip warning so the CLI shows it.
          if (!batchWarning) batchWarning = w;
        });
        const enrichedAt = new Date().toISOString();
        const enrichmentModel = this.config.model;
        for (let i = 0; i < batch.length && i < enrichments.length; i++) {
          const enrichment = enrichments[i];
          if (!enrichment) continue; // chunk skipped (e.g. size-1 truncation)
          const globalIdx = indexMap.get(batch[i]!.id);
          if (globalIdx !== undefined) {
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
   * Enrich a batch, recovering from output truncation by splitting.
   *
   * Normal case: one call returns all N enrichments.
   * On truncation (done_reason 'length'): the batch is halved and each half
   * enriched independently — smaller batches get proportionally more output
   * budget, so nothing is discarded. Recurses down to size 1.
   * At size 1, if the single chunk still truncates, it is skipped (returned as
   * `undefined`) so the rest of the run proceeds; this is bounded to exactly
   * one chunk and, with the bounded output schema, effectively unreachable.
   *
   * @returns array aligned to `batch`; entry is `undefined` for a skipped chunk.
   */
  private async enrichWithSplit(
    batch: CodeChunk[],
    onWarning?: (warning: string) => void,
  ): Promise<Array<EnrichedChunkResponse | undefined>> {
    const filePath = batch[0]?.relativePath ?? batch[0]?.filePath ?? '(unknown)';
    try {
      const enrichments = await this.enrichBatchWithRetry(batch, filePath);
      // enrichBatch guarantees a full-length array on success.
      return enrichments;
    } catch (err) {
      if (!(err instanceof EnrichmentTruncationError)) {
        throw err; // connection/parse/etc. — handled by caller's skipOnFailure
      }

      // Truncation. If we can still split, do so; retrying the identical
      // prompt is pointless because the failure is deterministic.
      if (batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        const left = batch.slice(0, mid);
        const right = batch.slice(mid);
        const warning = `Enrichment output truncated for ${batch.length} chunks at ${filePath} — splitting into ${left.length}+${right.length}`;
        logger.warn(warning);
        onWarning?.(warning);
        const [l, r] = await Promise.all([
          this.enrichWithSplit(left, onWarning),
          this.enrichWithSplit(right, onWarning),
        ]);
        return [...l, ...r];
      }

      // Size-1 floor: cannot split further. Skip this one chunk.
      const skipWarning = `Enrichment output truncated for a single chunk at ${filePath} — skipping enrichment for it (raise outputTokensPerChunk if frequent)`;
      logger.warn(skipWarning);
      onWarning?.(skipWarning);
      return [undefined];
    }
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
        // Truncation is deterministic — retrying the identical prompt always
        // fails. Propagate immediately so enrichWithSplit can split the batch.
        if (err instanceof EnrichmentTruncationError) {
          throw err;
        }
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

    // Use the relative path (not the absolute filesystem path) in the prompt
    // header: it is shorter and stops the model from copying a long absolute
    // path into every relationship target, which blows the output budget.
    const headerPath = chunks[0]?.relativePath ?? filePath;
    const prompt = buildEnrichmentPrompt(chunkInputs, headerPath);
    const outputTokensPerChunk =
      this.config.outputTokensPerChunk ?? DEFAULT_OUTPUT_TOKENS_PER_CHUNK;
    const numPredict = chunks.length * outputTokensPerChunk + OUTPUT_TOKENS_OVERHEAD;
    const { response: rawResponse, doneReason } = await this.callOllama(
      prompt,
      chunks.length,
      numPredict,
    );

    // Generation was cut off at num_predict: the JSON is truncated and
    // unparseable. Signal truncation specifically so the caller can split the
    // batch (deterministic fix) instead of retrying the identical prompt.
    if (doneReason === 'length') {
      throw new EnrichmentTruncationError(rawResponse);
    }

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

    // Reject partial responses so enrichBatchWithRetry retries instead of
    // silently dropping the unenriched chunks. The bounded array schema in
    // callOllama makes a full-length response the expected outcome.
    if (parsed.length !== chunks.length) {
      throw new Error(
        formatOllamaError({
          body: `Expected ${chunks.length} enrichment objects, got ${parsed.length}. Raw: ${rawResponse}`,
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

  private async callOllama(
    prompt: string,
    chunkCount: number,
    numPredict?: number,
  ): Promise<{ response: string; doneReason?: string | undefined }> {
    const url = `${this.config.baseUrl}/api/generate`;
    const requestBody = JSON.stringify({
      model: this.config.model,
      prompt,
      stream: false,
      // Bounded array schema forces one object per chunk. Generic format:'json'
      // let small models collapse a batch into a single object (see D-011).
      format: buildEnrichmentSchema(chunkCount),
      keep_alive: OLLAMA_KEEP_ALIVE,
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
        signal: AbortSignal.timeout(OLLAMA_REQUEST_TIMEOUT_MS),
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

    let data: { response: string; done_reason?: string };
    try {
      data = (await response.json()) as { response: string; done_reason?: string };
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
    return { response: data.response, doneReason: data.done_reason };
  }

  /**
   * Ask Ollama to unload the enrichment model (keep_alive: 0). Called at the end
   * of the enrich phase so the generation model does not hold a 30-minute lease
   * while the embedding phase needs memory. Best-effort: never throws.
   */
  async releaseModel(): Promise<void> {
    try {
      await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, keep_alive: 0 }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Model eviction is an optimization; ignore failures.
    }
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
