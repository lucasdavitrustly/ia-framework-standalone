export { createEmbeddingProvider, discoverDimensions, DEFAULT_DIMENSIONS } from './factory.js';
export type {
  EmbedBatchOutcome,
  EmbeddingProvider,
  EmbeddingTaskType,
  InputFailure,
} from './interface.js';
export { EMBEDDING_REQUEST_TIMEOUT_MS } from './interface.js';
export { OpenAIEmbeddingProvider } from './providers/openai.js';
export type { OpenAIProviderConfig } from './providers/openai.js';
export { OllamaEmbeddingProvider } from './providers/ollama.js';
export type { OllamaProviderConfig } from './providers/ollama.js';
export { CachingEmbeddingProvider } from './caching-provider.js';
export type { CachingProviderOptions } from './caching-provider.js';
