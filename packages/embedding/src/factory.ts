import type { EmbeddingProvider } from './interface.js';
import type { EmbeddingProviderConfig } from '@ia-framework/core';
import { OpenAIEmbeddingProvider } from './providers/openai.js';
import { OllamaEmbeddingProvider } from './providers/ollama.js';

// Default dimensions per well-known models
const DEFAULT_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
};

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  const dimensions = config.dimensions ?? DEFAULT_DIMENSIONS[config.model] ?? 1536;

  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider({
        model: config.model,
        apiKey: config.apiKey ?? '',
        baseUrl: config.baseUrl,
        dimensions,
      });

    case 'ollama':
      return new OllamaEmbeddingProvider({
        model: config.model,
        baseUrl: config.baseUrl,
        dimensions,
      });

    default: {
      // TypeScript exhaustiveness — provider is 'never' here in strict mode
      const p = (config as EmbeddingProviderConfig).provider;
      throw new Error(`Unknown provider: ${String(p)}. Supported: openai, ollama`);
    }
  }
}
