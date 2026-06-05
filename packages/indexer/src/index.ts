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
export { AstChunkingStrategy, LlmChunkCache, isOllamaReachable } from './strategies/index.js';
export type { ChunkingStrategy, ChunkingConfig, CachedChunkEntry } from './strategies/index.js';
export { scanMavenModuleGraph } from './maven-graph-scanner.js';
export type { MavenGraphScannerOptions } from './maven-graph-scanner.js';
