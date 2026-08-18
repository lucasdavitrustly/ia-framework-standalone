import {
  EmbeddingResponseError,
  capabilitiesFor,
  resolveContract,
  type EmbeddingContract,
} from '@ia-framework/core';
import type { EmbedBatchOutcome, EmbeddingProvider, EmbeddingTaskType } from '../interface.js';
import { requestSignal } from '../http.js';
import { applyPrefix } from '../prefix.js';

/** Delay before retrying a retryable OpenAI request (429/5xx). */
const OPENAI_RETRY_DELAY_MS = 500;

interface OpenAIEmbedResponse {
  data: Array<{ embedding: unknown; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

export class OpenAIEmbeddingRequestError extends Error {
  constructor(
    public readonly status: number | undefined,
    public readonly retryable: boolean,
    detail: string,
  ) {
    super(
      `OpenAI embedding request failed${status === undefined ? '' : ` with status ${status}`}: ${detail}`,
    );
    this.name = 'OpenAIEmbeddingRequestError';
  }
}

export interface OpenAIProviderConfig {
  model: string;
  apiKey: string;
  baseUrl?: string | undefined;
  dimensions: number;
  prefixes?: { document: string; query: string } | undefined;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly dimensions: number;
  readonly contract: EmbeddingContract;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly prefixes: { document: string; query: string } | undefined;
  private readonly supportsDimensionParam: boolean;

  constructor(config: OpenAIProviderConfig) {
    this.model = config.model;
    this.contract = resolveContract({
      provider: 'openai',
      model: config.model,
      dimensions: config.dimensions,
      ...(config.prefixes === undefined ? {} : { prefixes: config.prefixes }),
    });
    this.dimensions = this.contract.dimension;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com';
    this.prefixes = config.prefixes;
    this.supportsDimensionParam = capabilitiesFor('openai', config.model).supportsDimensionParam;
  }

  async embedBatch(
    texts: string[],
    taskType?: EmbeddingTaskType,
    signal?: AbortSignal,
  ): Promise<EmbedBatchOutcome> {
    if (texts.length === 0) return { vectors: [], failures: [] };

    const vectors = new Array<number[] | null>(texts.length).fill(null);
    const failures = texts.flatMap((text, index) =>
      text.trim().length === 0
        ? [{ index, reason: 'embedding input is empty or whitespace-only', retryable: false }]
        : [],
    );
    const validInputs = texts.flatMap((text, index) =>
      text.trim().length === 0 ? [] : [{ index, text }],
    );

    if (validInputs.length === 0) return { vectors, failures };

    const input = validInputs.map(({ text }) => applyPrefix(text, taskType, this.prefixes));
    const body = {
      model: this.model,
      input,
      ...(this.supportsDimensionParam ? { dimensions: this.contract.dimension } : {}),
    };

    const result = await this.request(body, signal);
    if (!Array.isArray(result.data)) {
      throw new EmbeddingResponseError(this.name, this.model, this.contract.dimension, 'malformed');
    }
    if (result.data.length !== validInputs.length) {
      throw new Error(
        `OpenAI embedding response returned ${result.data.length} embeddings for ${validInputs.length} inputs ` +
          `from ${this.model}`,
      );
    }

    const ordered = [...result.data].sort((a, b) => a.index - b.index);
    for (let responseIndex = 0; responseIndex < ordered.length; responseIndex++) {
      const item = ordered[responseIndex]!;
      if (item.index !== responseIndex) {
        throw new Error(
          `OpenAI embedding response indexes are incomplete or duplicated for ${this.model}`,
        );
      }
      const embedding = item.embedding;
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
      vectors[validInputs[responseIndex]!.index] = embedding as number[];
    }

    return { vectors, failures };
  }

  private async request(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<OpenAIEmbedResponse> {
    let lastError: OpenAIEmbeddingRequestError | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      // Back off before a retry (attempt > 0). A 429/5xx re-sent instantly is
      // exactly wrong for rate limiting.
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, OPENAI_RETRY_DELAY_MS));
      }
      try {
        const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: requestSignal(signal),
        });

        if (response.ok) return (await response.json()) as OpenAIEmbedResponse;

        const detail = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new OpenAIEmbeddingRequestError(response.status, retryable, detail);
        if (!retryable) throw lastError;
      } catch (error) {
        if (error instanceof OpenAIEmbeddingRequestError) {
          lastError = error;
          if (!error.retryable) throw error;
        } else {
          lastError = new OpenAIEmbeddingRequestError(
            undefined,
            true,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
    throw lastError ?? new OpenAIEmbeddingRequestError(undefined, true, 'unknown request failure');
  }

  async embed(text: string, taskType?: EmbeddingTaskType, signal?: AbortSignal): Promise<number[]> {
    const results = await this.embedBatch([text], taskType, signal);
    const first = results.vectors[0];
    if (!first) throw new Error('No embedding returned from OpenAI');
    return first;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}
