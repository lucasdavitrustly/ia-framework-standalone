import {
  EmbeddingResponseError,
  capabilitiesFor,
  resolveContract,
  type EmbeddingContract,
} from '@ia-framework/core';
import type { EmbedBatchOutcome, EmbeddingProvider, EmbeddingTaskType } from '../interface.js';
import { requestSignal } from '../http.js';
import { applyPrefix } from '../prefix.js';

/** How long Ollama keeps the embedding model resident between calls. */
const OLLAMA_KEEP_ALIVE = '30m';

interface OllamaEmbedResponse {
  embeddings: unknown;
}

export interface OllamaProviderConfig {
  model: string;
  baseUrl?: string | undefined;
  dimensions: number;
  prefixes?: { document: string; query: string } | undefined;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly model: string;
  readonly dimensions: number;
  readonly contract: EmbeddingContract;
  private readonly baseUrl: string;
  private readonly prefixes: { document: string; query: string } | undefined;
  private readonly maxInputTokens: number;

  constructor(config: OllamaProviderConfig) {
    this.model = config.model;
    this.contract = resolveContract({
      provider: 'ollama',
      model: config.model,
      dimensions: config.dimensions,
      ...(config.prefixes === undefined ? {} : { prefixes: config.prefixes }),
    });
    this.dimensions = this.contract.dimension;
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.prefixes = config.prefixes;
    // Send an explicit num_ctx so Ollama's real context matches the capability
    // caps the budgeter uses; otherwise some models default to 2048 and 400.
    this.maxInputTokens = capabilitiesFor('ollama', config.model).maxInputTokens;
  }

  async embedBatch(
    texts: string[],
    taskType?: EmbeddingTaskType,
    signal?: AbortSignal,
  ): Promise<EmbedBatchOutcome> {
    if (texts.length === 0) return { vectors: [], failures: [] };

    const input = texts.map((text) => applyPrefix(text, taskType, this.prefixes));
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input,
        truncate: false,
        dimensions: this.contract.dimension,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_ctx: this.maxInputTokens },
      }),
      signal: requestSignal(signal),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(formatOllamaEmbeddingError(response.status, error, this.model, this.baseUrl));
    }

    const result = (await response.json()) as OllamaEmbedResponse;
    if (!Array.isArray(result.embeddings)) {
      throw new EmbeddingResponseError(this.name, this.model, this.contract.dimension, 'malformed');
    }
    if (result.embeddings.length !== texts.length) {
      throw new Error(
        `Ollama embedding response returned ${result.embeddings.length} embeddings for ${texts.length} inputs ` +
          `from ${this.model}`,
      );
    }

    const vectors = result.embeddings.map((embedding) => {
      if (!Array.isArray(embedding)) {
        throw new EmbeddingResponseError(
          this.name,
          this.model,
          this.contract.dimension,
          'malformed',
        );
      }
      if (embedding.length === 0) {
        throw new EmbeddingResponseError(this.name, this.model, this.contract.dimension, 0);
      }
      if (embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new EmbeddingResponseError(
          this.name,
          this.model,
          this.contract.dimension,
          'malformed',
        );
      }
      if (embedding.length !== this.contract.dimension) {
        throw new EmbeddingResponseError(
          this.name,
          this.model,
          this.contract.dimension,
          embedding.length,
        );
      }
      return embedding as number[];
    });

    return { vectors, failures: [] };
  }

  async embed(text: string, taskType?: EmbeddingTaskType, signal?: AbortSignal): Promise<number[]> {
    const results = await this.embedBatch([text], taskType, signal);
    const first = results.vectors[0];
    if (!first) throw new Error('No embedding returned from Ollama');
    return first;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}

function formatOllamaEmbeddingError(
  status: number,
  body: string,
  model: string,
  baseUrl: string,
): string {
  const lowerBody = body.toLowerCase();
  const category = lowerBody.includes('llama-server process no longer running') ||
    lowerBody.includes('llama runner process no longer running')
    ? 'runner-failure'
    : lowerBody.includes('context length') ||
        lowerBody.includes('context window') ||
        lowerBody.includes('exceeds context') ||
        lowerBody.includes('too large')
    ? 'context-length'
    : lowerBody.includes('not found')
    ? 'model-not-found'
    : status >= 500
      ? 'server-error'
      : 'unknown';
  const suggestion = category === 'runner-failure'
    ? 'Inspect Ollama logs for a runner crash or memory/Metal failure, then retry'
    : category === 'context-length'
      ? 'Input exceeded the model context — the batch will be split and retried; reduce embeddingBatchSize if it persists'
    : category === 'model-not-found'
      ? `Try running: ollama pull ${model}`
      : category === 'server-error'
        ? 'Ollama internal error — check server logs or restart Ollama'
      : 'Verify the Ollama request and model configuration before retrying';
  return [
    `Ollama embedding error (${category}): ${status} — ${body}`,
    `  Model: ${model}`,
    `  URL: ${baseUrl}`,
    `  Response: ${body}`,
    `  Suggestion: ${suggestion}`,
  ].join('\n');
}
