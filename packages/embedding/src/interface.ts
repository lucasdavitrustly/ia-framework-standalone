import type { EmbeddingContract } from '@ia-framework/core';

/**
 * Per-request HTTP timeout (ms) for embedding provider calls. Prevents a wedged
 * request from stalling the index run indefinitely and from making `ia index
 * --stop` ineffective (the pipeline's Promise.all can never settle otherwise).
 */
export const EMBEDDING_REQUEST_TIMEOUT_MS = 120_000;

/** Task type for embedding calls.
 * 'document' — text being indexed/stored.
 * 'query' — text being used for retrieval search.
 */
export type EmbeddingTaskType = 'document' | 'query';

/** A failure associated with one input in an embedding batch. */
export interface InputFailure {
  /** Zero-based position in the original input array. */
  readonly index: number;
  /** Actionable provider or validation reason. */
  readonly reason: string;
  /** Whether retrying this input may succeed. */
  readonly retryable: boolean;
}

/** Per-input embedding outcome that preserves positional success and failure data. */
export interface EmbedBatchOutcome {
  readonly vectors: (number[] | null)[];
  readonly failures: InputFailure[];
}

/**
 * Provider-agnostic interface for generating text/code embeddings.
 * Implementations: OpenAIEmbeddingProvider, OllamaEmbeddingProvider
 */
export interface EmbeddingProvider {
  /** Provider name: 'openai' or 'ollama' */
  readonly name: string;
  /** Model identifier used for embeddings */
  readonly model: string;
  /** Vector dimensionality for this model */
  readonly dimensions: number;
  /** Contract describing the vectors produced by this provider. */
  readonly contract: EmbeddingContract;

  /**
   * Embed a single text string.
   * Returns the embedding vector as an array of floats.
   * @param taskType - optional task type to apply configured prefix
   * @param signal - optional AbortSignal to cancel the request
   */
  embed(text: string, taskType?: EmbeddingTaskType, signal?: AbortSignal): Promise<number[]>;

  /**
   * Embed multiple texts in one batch call.
   * More efficient than calling embed() repeatedly.
   * Returns vectors and per-input failures in the same order as inputs.
   * @param taskType - optional task type to apply configured prefix
   * @param signal - optional AbortSignal to cancel the request
   */
  embedBatch(
    texts: string[],
    taskType?: EmbeddingTaskType,
    signal?: AbortSignal,
  ): Promise<EmbedBatchOutcome>;

  /**
   * Rough token estimate for budget tracking.
   * Not required to be exact — used for usage monitoring only.
   */
  estimateTokens(text: string): number;
}
