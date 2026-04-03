import type { EmbeddingProvider } from '../interface.js';

interface OpenAIEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface OpenAIProviderConfig {
  model: string;
  apiKey: string;
  baseUrl?: string | undefined;
  dimensions: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAIProviderConfig) {
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com';
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding error: ${response.status} ${error}`);
    }

    const result = (await response.json()) as OpenAIEmbedResponse;
    // Sort by index to ensure order matches input
    return result.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    const first = results[0];
    if (!first) throw new Error('No embedding returned from OpenAI');
    return first;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}
