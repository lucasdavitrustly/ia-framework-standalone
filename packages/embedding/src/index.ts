export { createEmbeddingProvider, discoverDimensions, DEFAULT_DIMENSIONS } from './factory.js';
export type { EmbeddingProvider, EmbeddingTaskType } from './interface.js';
export { OpenAIEmbeddingProvider } from './providers/openai.js';
export type { OpenAIProviderConfig } from './providers/openai.js';
export { OllamaEmbeddingProvider } from './providers/ollama.js';
export type { OllamaProviderConfig } from './providers/ollama.js';
