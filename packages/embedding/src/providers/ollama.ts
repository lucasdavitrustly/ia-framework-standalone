import type { EmbeddingProvider, EmbeddingTaskType } from '../interface.js';

interface OllamaEmbedResponse {
  embeddings: number[][];
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
  private readonly baseUrl: string;
  private readonly prefixes: { document: string; query: string } | undefined;

  constructor(config: OllamaProviderConfig) {
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.prefixes = config.prefixes;
  }

  private applyPrefix(texts: string[], taskType?: EmbeddingTaskType): string[] {
    if (!taskType || !this.prefixes) return texts;
    const prefix = this.prefixes[taskType];
    return texts.map((t) => prefix + t);
  }

  async embedBatch(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]> {
    if (texts.length === 0) return [];

    const input = this.applyPrefix(texts, taskType);
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding error [model=${this.model}]: ${response.status} ${error}`);
    }

    const result = (await response.json()) as OllamaEmbedResponse;
    return result.embeddings;
  }

  async embed(text: string, taskType?: EmbeddingTaskType): Promise<number[]> {
    const results = await this.embedBatch([text], taskType);
    const first = results[0];
    if (!first) throw new Error('No embedding returned from Ollama');
    return first;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}
