import { parseFile } from '@ia-framework/ast-parser';
import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore, VectorPoint, ChunkPayload } from '@ia-framework/vector-store';
import type { CodeChunk } from '@ia-framework/ast-parser';
import { createLogger } from '@ia-framework/core';
import { walkFiles } from './file-walker.js';
import {
  getLastIndexedCommit,
  saveLastIndexedCommit,
  getCurrentCommit,
  getChangedFiles,
} from './incremental.js';

const logger = createLogger('indexer');

export interface IndexingConfig {
  /** Path to the target project to index */
  targetProjectPath: string;
  /** Path to .ia-framework/ dir for state persistence */
  frameworkDir: string;
  /** Qdrant collection name */
  collectionName: string;
  /** Embedding provider */
  embeddingProvider: EmbeddingProvider;
  /** Vector store */
  vectorStore: VectorStore;
  /** Glob include patterns */
  includePatterns?: string[] | undefined;
  /** Glob exclude patterns */
  excludePatterns?: string[] | undefined;
  /** Max chunk lines (default: 200) */
  maxChunkLines?: number | undefined;
  /** Embedding batch size (default: 50) */
  embeddingBatchSize?: number | undefined;
  /** Use incremental indexing based on git diff (default: false) */
  incremental?: boolean | undefined;
}

export interface IndexingProgress {
  stage: 'walking' | 'parsing' | 'embedding' | 'storing' | 'done';
  filesTotal: number;
  filesProcessed: number;
  chunksTotal: number;
  chunksIndexed: number;
  currentFile?: string | undefined;
}

export type ProgressCallback = (progress: IndexingProgress) => void;

export class IndexingPipeline {
  async run(
    config: IndexingConfig,
    onProgress?: ProgressCallback,
  ): Promise<{ filesIndexed: number; chunksIndexed: number }> {
    const {
      targetProjectPath,
      frameworkDir,
      collectionName,
      embeddingProvider,
      vectorStore,
      includePatterns,
      excludePatterns,
      maxChunkLines = 200,
      embeddingBatchSize = 50,
      incremental = false,
    } = config;

    // Initialize vector store collection
    await vectorStore.initialize({
      textDimensions: embeddingProvider.dimensions,
      codeDimensions: embeddingProvider.dimensions,
    });

    // Determine which files to process
    let filesToProcess: string[];

    onProgress?.({
      stage: 'walking',
      filesTotal: 0,
      filesProcessed: 0,
      chunksTotal: 0,
      chunksIndexed: 0,
    });

    if (incremental) {
      const lastCommit = await getLastIndexedCommit(frameworkDir);
      if (lastCommit) {
        const changedFiles = await getChangedFiles(targetProjectPath, lastCommit);
        // Delete old chunks for changed files before re-indexing
        for (const filePath of changedFiles) {
          await vectorStore.deleteByFilter({ filePath });
        }
        filesToProcess = changedFiles;
      } else {
        // No prior state — full index
        filesToProcess = await walkFiles({
          projectPath: targetProjectPath,
          includePatterns,
          excludePatterns,
        });
      }
    } else {
      filesToProcess = await walkFiles({
        projectPath: targetProjectPath,
        includePatterns,
        excludePatterns,
      });
    }

    const progress: IndexingProgress = {
      stage: 'parsing',
      filesTotal: filesToProcess.length,
      filesProcessed: 0,
      chunksTotal: 0,
      chunksIndexed: 0,
    };
    onProgress?.({ ...progress });

    // Parse all files into chunks
    const allChunks: CodeChunk[] = [];
    for (const filePath of filesToProcess) {
      progress.currentFile = filePath;
      try {
        const chunks = await parseFile(filePath, {
          projectRoot: targetProjectPath,
          maxChunkLines,
        });
        allChunks.push(...chunks);
      } catch (err) {
        logger.error({ filePath, err }, 'Failed to parse file — skipping');
      }
      progress.filesProcessed++;
      onProgress?.({ ...progress });
    }

    progress.chunksTotal = allChunks.length;
    progress.stage = 'embedding';
    onProgress?.({ ...progress });

    // Embed chunks in batches
    const vectorPoints: VectorPoint[] = [];
    for (let i = 0; i < allChunks.length; i += embeddingBatchSize) {
      const batch = allChunks.slice(i, i + embeddingBatchSize);
      const texts = batch.map((c) => c.content);

      const vectors = await embeddingProvider.embedBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const vector = vectors[j]!;
        const payload: ChunkPayload = {
          chunkId: chunk.id,
          filePath: chunk.filePath,
          relativePath: chunk.relativePath,
          language: chunk.language,
          chunkType: chunk.chunkType,
          name: chunk.name,
          content: chunk.content,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          imports: chunk.imports,
          exports: chunk.exports,
          indexedAt: new Date().toISOString(),
        };
        vectorPoints.push({
          id: chunk.id,
          textVector: vector,
          codeVector: vector, // Same model for both in Phase 3
          payload,
        });
      }
      progress.chunksIndexed += batch.length;
      onProgress?.({ ...progress });
    }

    // Store in Qdrant in batches
    progress.stage = 'storing';
    onProgress?.({ ...progress });

    const storeBatchSize = 100;
    for (let i = 0; i < vectorPoints.length; i += storeBatchSize) {
      const batch = vectorPoints.slice(i, i + storeBatchSize);
      await vectorStore.upsertBatch(batch);
    }

    // Save incremental state
    const currentCommit = await getCurrentCommit(targetProjectPath);
    if (currentCommit) {
      await saveLastIndexedCommit(frameworkDir, currentCommit, collectionName);
    }

    progress.stage = 'done';
    progress.currentFile = undefined;
    onProgress?.({ ...progress });

    return {
      filesIndexed: progress.filesProcessed,
      chunksIndexed: vectorPoints.length,
    };
  }
}
