import type { EmbeddingProvider } from '../interface.js';

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export interface OllamaProviderConfig {
  model: string;
  baseUrl?: string | undefined;
  dimensions: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly model: string;
  readonly dimensions: number;
  private readonly baseUrl: string;

  constructor(config: OllamaProviderConfig) {
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding error: ${response.status} ${error}`);
    }

    const result = (await response.json()) as OllamaEmbedResponse;
    return result.embeddings;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    const first = results[0];
    if (!first) throw new Error('No embedding returned from Ollama');
    return first;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}
