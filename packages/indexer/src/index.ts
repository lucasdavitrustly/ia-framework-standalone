export { IndexingPipeline } from './pipeline.js';
export type { IndexingConfig, IndexingProgress, ProgressCallback } from './pipeline.js';
export { walkFiles } from './file-walker.js';
export type { WalkOptions } from './file-walker.js';
export {
  getChangedFiles,
  getCurrentCommit,
  getLastIndexedCommit,
  getLastEmbeddingModel,
  getLastPromptContentHash,
  saveLastIndexedCommit,
} from './incremental.js';
export { chunkToDescription } from './chunk-description.js';
export { PROMPT_CONTENT_HASH } from './strategies/prompt.js';
export {
  AstChunkingStrategy,
  LlmChunkingStrategy,
  LlmChunkCache,
  isOllamaReachable,
} from './strategies/index.js';
export type {
  ChunkingStrategy,
  ChunkingConfig,
  LlmChunkingOptions,
  CachedChunkEntry,
} from './strategies/index.js';
