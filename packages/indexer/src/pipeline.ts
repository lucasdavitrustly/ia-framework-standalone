import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore, VectorPoint, ChunkPayload } from '@ia-framework/vector-store';
import type { CodeChunk } from '@ia-framework/ast-parser';
import type { ContextSource } from '@ia-framework/core';
import { createLogger } from '@ia-framework/core';
import PQueue from 'p-queue';
import { walkFiles } from './file-walker.js';
import {
  getLastIndexedCommit,
  saveLastIndexedCommit,
  getCurrentCommit,
  getChangedFiles,
} from './incremental.js';
import { chunkToDescription } from './chunk-description.js';
import { computeTermFrequencySparseVector } from '@ia-framework/retrieval';
import type { ChunkingStrategy } from './strategies/types.js';
import { AstChunkingStrategy } from './strategies/ast-strategy.js';

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
  /** Embedding concurrency override (default: provider-aware — Ollama=3, OpenAI=10) */
  embeddingConcurrency?: number | undefined;
  /** Chunking strategy (default: AstChunkingStrategy). Phase 14 will add LlmChunkingStrategy. */
  chunkingStrategy?: ChunkingStrategy | undefined;
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
  /** Total number of embedding batches to process */
  batchesTotal?: number | undefined;
  /** Number of embedding batches completed so far */
  batchesCompleted?: number | undefined;
}

export type ProgressCallback = (progress: IndexingProgress) => void;

/**
 * Provider-aware concurrency defaults for embedding batch processing.
 * Ollama: 3 (local model, limited by GPU VRAM)
 * OpenAI: 10 (cloud API, higher rate limits)
 */
function getDefaultConcurrency(providerName: string): number {
  switch (providerName) {
    case 'ollama':
      return 3;
    case 'openai':
      return 10;
    default:
      return 3; // Safe default
  }
}

/**
 * Embed a single batch with retry logic.
 * Retries once on failure; if both attempts fail, throws.
 */
async function embedBatchWithRetry(
  batch: CodeChunk[],
  provider: EmbeddingProvider,
  results: VectorPoint[],
  maxRetries = 1,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const textDescriptions = batch.map((c) => c.description ?? chunkToDescription(c));
      const codeTexts = batch.map((c) => c.content);
      // Text and code embeddings run in parallel within each batch
      const [textVectors, codeVectors] = await Promise.all([
        provider.embedBatch(textDescriptions),
        provider.embedBatch(codeTexts),
      ]);
      // Build VectorPoints from results
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
        results.push({
          id: chunk.id,
          textVector: textVectors[j]!,
          codeVector: codeVectors[j]!,
          sparseVector: computeTermFrequencySparseVector(chunk.content),
          payload,
        });
      }
      return; // Success
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        logger.warn({ attempt, err }, 'Embedding batch failed — retrying');
      }
    }
  }
  throw lastError; // All retries exhausted
}

export class IndexingPipeline {
  async run(
    config: IndexingConfig,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<{ filesIndexed: number; chunksIndexed: number; skippedChunks: number }> {
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
      chunkingStrategy,
      embeddingConcurrency,
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
      const lastCommit = await getLastIndexedCommit(frameworkDir, collectionName);
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

    // Parse all files into chunks using the configured strategy
    const strategy = chunkingStrategy ?? new AstChunkingStrategy();
    const allChunks: CodeChunk[] = [];
    for (const filePath of filesToProcess) {
      progress.currentFile = filePath;
      try {
        const chunks = await strategy.chunk(filePath, {
          maxChunkLines,
          projectRoot: targetProjectPath,
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

    // Embed chunks in batches using p-queue for concurrent processing
    const concurrency = embeddingConcurrency ?? getDefaultConcurrency(embeddingProvider.name);
    const queue = new PQueue({ concurrency });
    const vectorPoints: VectorPoint[] = [];
    let skippedChunks = 0;

    // Build batch list
    const batches: CodeChunk[][] = [];
    for (let i = 0; i < allChunks.length; i += embeddingBatchSize) {
      batches.push(allChunks.slice(i, i + embeddingBatchSize));
    }

    progress.batchesTotal = batches.length;
    progress.batchesCompleted = 0;
    onProgress?.({ ...progress });

    // Abort integration: when signal fires, clear queued tasks
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          queue.clear();
        },
        { once: true },
      );
    }

    await Promise.all(
      batches.map((batch) =>
        queue.add(async () => {
          if (signal?.aborted) return; // Skip if already aborted

          try {
            await embedBatchWithRetry(batch, embeddingProvider, vectorPoints);
          } catch {
            // Retry exhausted — skip batch
            skippedChunks += batch.length;
            logger.warn({ batchSize: batch.length }, 'Embedding batch skipped after retry failure');
          }

          progress.batchesCompleted = (progress.batchesCompleted ?? 0) + 1;
          progress.chunksIndexed = vectorPoints.length;
          onProgress?.({ ...progress });
        }),
      ),
    );

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
                sparseVector: computeTermFrequencySparseVector(chunk.content), // BM25 TF sparse
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
      skippedChunks,
    };
  }
}
