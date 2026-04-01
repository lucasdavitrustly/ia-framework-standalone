export { IndexingPipeline } from './pipeline.js';
export type { IndexingConfig, IndexingProgress, ProgressCallback } from './pipeline.js';
export { walkFiles } from './file-walker.js';
export type { WalkOptions } from './file-walker.js';
export {
  getChangedFiles,
  getCurrentCommit,
  getLastIndexedCommit,
  saveLastIndexedCommit,
} from './incremental.js';
