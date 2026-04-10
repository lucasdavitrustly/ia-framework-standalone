export { IndexingPipeline } from './pipeline.js';
export type { IndexingConfig, IndexingProgress, ProgressCallback } from './pipeline.js';
export { walkFiles } from './file-walker.js';
export type { WalkOptions } from './file-walker.js';
export {
  getChangedFiles,
  getCurrentCommit,
  getLastIndexedCommit,
  getLastEmbeddingModel,
  saveLastIndexedCommit,
} from './incremental.js';
export { chunkToDescription } from './chunk-description.js';
export { AstChunkingStrategy } from './strategies/index.js';
export type { ChunkingStrategy, ChunkingConfig } from './strategies/index.js';
