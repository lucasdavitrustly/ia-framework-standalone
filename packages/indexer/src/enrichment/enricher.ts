import { createLogger } from '@ia-framework/core';
import type { EnrichmentConfig } from '@ia-framework/core';
import type { CodeChunk } from '@ia-framework/ast-parser';
import {
  buildEnrichmentPrompt,
  parseEnrichmentResponse,
  type ChunkForPrompt,
  type EnrichedChunkResponse,
} from './prompt.js';
import type { CachedEnrichment } from './cache.js';

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

// ── LlmEnricher class ─────────────────────────────────────────────────────────

export class LlmEnricher {
  private readonly config: Required<Pick<EnrichmentConfig, 'provider' | 'model'>> &
    Pick<
      EnrichmentConfig,
      'baseUrl' | 'numCtx' | 'concurrency' | 'retryAttempts' | 'skipOnFailure'
    >;

  constructor(config: EnrichmentConfig) {
    this.config = {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl ?? 'http://localhost:11434',
      numCtx: config.numCtx ?? 32768,
      concurrency: config.concurrency ?? 3,
      retryAttempts: config.retryAttempts ?? 2,
      skipOnFailure: config.skipOnFailure ?? true,
    };
  }

  /**
   * Enrich a batch of chunks with LLM-generated metadata.
   * Processes up to 10 chunks per Ollama call.
   * On failure, behaviour depends on skipOnFailure config.
   *
   * Large-file strategy: when total chunk content exceeds 70% of numCtx
   * (measured in approximate tokens = chars / 4), chunks are grouped by
   * class (parentName / class-signature name) and each class is sent as
   * one Ollama call. This avoids mixing unrelated classes in a single
   * prompt and keeps each prompt within a manageable context budget.
   */
  async enrich(chunks: CodeChunk[]): Promise<EnrichedCodeChunk[]> {
    if (chunks.length === 0) return [];

    const BATCH_SIZE = 10;
    const CHARS_PER_TOKEN = 4;
    const LARGE_FILE_THRESHOLD = 0.7;

    const totalChars = chunks.reduce((sum, c) => sum + (c.content?.length ?? 0), 0);
    const totalTokens = totalChars / CHARS_PER_TOKEN;
    const numCtx = this.config.numCtx ?? 32768;
    const isLargeFile = totalTokens > LARGE_FILE_THRESHOLD * numCtx;

    const result: EnrichedCodeChunk[] = [...chunks] as EnrichedCodeChunk[];

    const applyBatch = async (batch: CodeChunk[]): Promise<void> => {
      const filePath = batch[0]?.filePath ?? '(unknown)';
      try {
        const enriched = await this.enrichBatchWithRetry(batch, filePath);
        for (const enrichedChunk of enriched) {
          const idx = result.findIndex((c) => c.id === enrichedChunk.id);
          if (idx >= 0) result[idx] = enrichedChunk;
        }
      } catch (err) {
        if (this.config.skipOnFailure) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            `Ollama enrichment failed for batch (${batch.length} chunks) — skipping enrichment. Error: ${msg}`,
          );
          console.warn(
            `[enricher] Ollama enrichment failed — skipping enrichment for ${batch.length} chunks. Error: ${msg}`,
          );
        } else {
          throw err;
        }
      }
    };

    if (isLargeFile) {
      // Large-file strategy: group by class, one call per group
      const groups = this.groupByClass(chunks);
      for (const group of groups.values()) {
        await applyBatch(group);
      }
    } else {
      // Standard strategy: flat batches of BATCH_SIZE
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        await applyBatch(chunks.slice(i, i + BATCH_SIZE));
      }
    }

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
  ): Promise<EnrichedCodeChunk[]> {
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

  private async enrichBatch(chunks: CodeChunk[], filePath: string): Promise<EnrichedCodeChunk[]> {
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
    const rawResponse = await this.callOllama(prompt);
    const parsed = parseEnrichmentResponse(rawResponse);

    if (!parsed) {
      throw new Error(`Failed to parse Ollama response for batch at ${filePath}`);
    }

    // Build a lookup map: id → enrichment
    const enrichmentMap = new Map<string, EnrichedChunkResponse>();
    for (const e of parsed.chunks) {
      enrichmentMap.set(e.id, e);
    }

    const enrichedAt = new Date().toISOString();
    const enrichmentModel = this.config.model;

    return chunks.map((chunk): EnrichedCodeChunk => {
      const enrichment = enrichmentMap.get(chunk.id);
      if (!enrichment) {
        return chunk as EnrichedCodeChunk;
      }

      const result: EnrichedCodeChunk = {
        ...chunk,
        enrichedAt,
        enrichmentModel,
      };
      if (enrichment.description) result.description = enrichment.description;
      if (enrichment.businessContext) result.businessContext = enrichment.businessContext;
      if (enrichment.semanticTags.length > 0) result.semanticTags = enrichment.semanticTags;
      if (enrichment.relationships.length > 0) result.relationships = enrichment.relationships;
      return result;
    });
  }

  private async callOllama(prompt: string): Promise<string> {
    const url = `${this.config.baseUrl}/api/generate`;
    const body = JSON.stringify({
      model: this.config.model,
      prompt,
      stream: false,
      options: {
        num_ctx: this.config.numCtx,
        temperature: 0.1,
      },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
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
