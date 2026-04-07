import { parseFile } from '@ia-framework/ast-parser';
import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore, VectorPoint, ChunkPayload } from '@ia-framework/vector-store';
import type { CodeChunk } from '@ia-framework/ast-parser';
import type { ContextSource } from '@ia-framework/core';
import { createLogger } from '@ia-framework/core';
import { walkFiles } from './file-walker.js';
import {
  getLastIndexedCommit,
  saveLastIndexedCommit,
  getCurrentCommit,
  getChangedFiles,
} from './incremental.js';
import { chunkToDescription } from './chunk-description.js';

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
  /** Optional additional context sources (DB schema, docs, etc.) */
  contextSources?: ContextSource[] | undefined;
  /** Optional dependency graph for building file-level import adjacency */
  dependencyGraph?:
    | {
        initialize(): void;
        upsertEdges(sourceFilePath: string, imports: string[], projectRoot: string): void;
        deleteEdgesForFile(filePath: string): void;
      }
    | undefined;
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
    signal?: AbortSignal,
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
      contextSources,
      dependencyGraph,
    } = config;

    // Initialize vector store collection
    await vectorStore.initialize({
      textDimensions: embeddingProvider.dimensions,
      codeDimensions: embeddingProvider.dimensions,
    });

    // Initialize dependency graph if configured
    if (dependencyGraph) {
      dependencyGraph.initialize();
    }

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
          if (dependencyGraph) {
            dependencyGraph.deleteEdgesForFile(filePath);
          }
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

        // Build dependency graph edges from parsed imports
        if (dependencyGraph) {
          const fileImports = chunks.flatMap((c) => c.imports);
          if (fileImports.length > 0) {
            dependencyGraph.upsertEdges(filePath, fileImports, targetProjectPath);
          }
        }
      } catch (err) {
        logger.error({ filePath, err }, 'Failed to parse file — skipping');
      }
      progress.filesProcessed++;
      onProgress?.({ ...progress });

      // Check for cancellation after each file
      if (signal?.aborted) {
        throw new Error('Indexing cancelled');
      }
    }

    progress.chunksTotal = allChunks.length;
    progress.stage = 'embedding';
    onProgress?.({ ...progress });

    // Embed chunks in batches
    const vectorPoints: VectorPoint[] = [];
    for (let i = 0; i < allChunks.length; i += embeddingBatchSize) {
      // Check for cancellation before each batch
      if (signal?.aborted) {
        throw new Error('Indexing cancelled');
      }

      const batch = allChunks.slice(i, i + embeddingBatchSize);

      // Embed prose descriptions for text vectors (semantic search)
      const textDescriptions = batch.map((c) => chunkToDescription(c));
      const textVectors = await embeddingProvider.embedBatch(textDescriptions);

      // Embed raw code for code vectors (identifier/keyword search)
      const codeTexts = batch.map((c) => c.content);
      const codeVectors = await embeddingProvider.embedBatch(codeTexts);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
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
          parentName: chunk.parentName,
          indexedAt: new Date().toISOString(),
        };
        vectorPoints.push({
          id: chunk.id,
          textVector: textVectors[j]!, // prose description embedding
          codeVector: codeVectors[j]!, // raw code embedding
          payload,
        });
      }
      progress.chunksIndexed += batch.length;
      onProgress?.({ ...progress });
    }

    // Process additional context sources
    if (contextSources && contextSources.length > 0) {
      for (const source of contextSources) {
        logger.info({ source: source.name }, 'Processing context source');
        try {
          const sourceChunks = await source.getChunks();
          logger.info(
            { source: source.name, count: sourceChunks.length },
            'Got chunks from context source',
          );

          progress.chunksTotal += sourceChunks.length;

          // Embed source chunks in batches using same pipeline
          for (let i = 0; i < sourceChunks.length; i += embeddingBatchSize) {
            const batch = sourceChunks.slice(i, i + embeddingBatchSize);

            // For context sources, also split text vs code embedding
            const textDescs = batch.map((c) => chunkToDescription(c));
            const textVecs = await embeddingProvider.embedBatch(textDescs);
            const codeTexts = batch.map((c) => c.content);
            const codeVecs = await embeddingProvider.embedBatch(codeTexts);

            for (let j = 0; j < batch.length; j++) {
              const chunk = batch[j]!;
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
                parentName: chunk.parentName,
                indexedAt: chunk.indexedAt,
              };
              vectorPoints.push({
                id: chunk.id,
                textVector: textVecs[j]!, // prose description embedding
                codeVector: codeVecs[j]!, // raw code embedding
                payload,
              });
            }
            progress.chunksIndexed += batch.length;
            onProgress?.({ ...progress });
          }
        } catch (err) {
          logger.error({ source: source.name, err }, 'Context source failed — skipping');
        }
      }
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
