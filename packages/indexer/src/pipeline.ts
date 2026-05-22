import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore, VectorPoint, ChunkPayload } from '@ia-framework/vector-store';
import type { CodeChunk } from '@ia-framework/ast-parser';
import { extractCalls, buildCalledByIndex } from '@ia-framework/ast-parser';
import type { ContextSource } from '@ia-framework/core';
import { createLogger } from '@ia-framework/core';
import { readFile } from 'node:fs/promises';
import PQueue from 'p-queue';
import { walkFiles } from './file-walker.js';
import {
  getLastIndexedCommit,
  getLastPromptContentHash,
  saveLastIndexedCommit,
  getCurrentCommit,
  getChangedFiles,
} from './incremental.js';
import { chunkToDescription } from './chunk-description.js';
import { computeTermFrequencySparseVector } from '@ia-framework/retrieval';
import type { ChunkingStrategy } from './strategies/types.js';
import { AstChunkingStrategy } from './strategies/ast-strategy.js';
import { PROMPT_CONTENT_HASH } from './strategies/prompt.js';
import {
  inferLayerHints,
  inferModulePath,
  inferPackageName,
  inferMavenModule,
} from './retrieval-metadata.js';
import { detectConcepts, generateConceptChunks } from './concept-generator.js';
import type { ModuleGraph } from '@ia-framework/core';

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
  /** Optional Maven module graph — if provided, chunks are enriched with maven_module metadata */
  mavenModuleGraph?: ModuleGraph | undefined;
  /** Source repo identifier — added to every chunk payload for per-repo filtering */
  repoId?: string | undefined;
  /** Optional dependency graph for building file-level import adjacency */
  dependencyGraph?:
    | {
        initialize(): void;
        upsertEdges(
          sourceFilePath: string,
          imports: string[],
          projectRoot: string,
          collection?: string,
        ): void;
        deleteEdgesForFile(filePath: string, collection?: string): void;
        getDensityStats?(collection?: string): {
          total_edges: number;
          files_with_imports: number;
          external_edges: number;
        };
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
  mavenModuleGraph?: ModuleGraph | undefined,
  callMeta?: Map<
    string,
    { defines?: string | undefined; calls?: string[] | undefined; calledBy?: string[] | undefined }
  >,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const textDescriptions = batch.map((c) => c.description ?? chunkToDescription(c));
      const codeTexts = batch.map((c) => c.content);
      // Text and code embeddings run in parallel within each batch
      const [textVectors, codeVectors] = await Promise.all([
        provider.embedBatch(textDescriptions, 'document'),
        provider.embedBatch(codeTexts, 'document'),
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
          superclass: chunk.superclass,
          interfaces: chunk.interfaces,
          isInnerClass: chunk.isInnerClass,
          modulePath: inferModulePath(chunk.relativePath),
          packageName: inferPackageName(chunk.relativePath, chunk.content),
          layerHints: inferLayerHints(chunk.relativePath, chunk.chunkType, chunk.content),
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          indexedAt: new Date().toISOString(),
        };
        // Call-chain metadata enrichment
        if (callMeta) {
          const meta = callMeta.get(chunk.id);
          if (meta) {
            if (meta.defines) payload.defines = [meta.defines];
            payload.calls = meta.calls;
            payload.calledBy = meta.calledBy;
          }
        }
        // Maven module enrichment (per D-05)
        if (mavenModuleGraph) {
          const mavenMod = inferMavenModule(chunk.relativePath, mavenModuleGraph);
          if (mavenMod) {
            payload.mavenModule = mavenMod;
          }
        }
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

      // Check if the LLM chunking prompt has changed — if so, force full re-index (D-20)
      const isLlmStrategy = chunkingStrategy?.name === 'llm';
      let promptChanged = false;
      if (isLlmStrategy && lastCommit) {
        const lastHash = await getLastPromptContentHash(frameworkDir, collectionName);
        if (lastHash !== null && lastHash !== PROMPT_CONTENT_HASH) {
          logger.info(
            { lastHash, currentHash: PROMPT_CONTENT_HASH },
            'LLM prompt changed — forcing full re-index',
          );
          promptChanged = true;
        }
      }

      if (promptChanged) {
        // Prompt changed — full re-index needed
        filesToProcess = await walkFiles({
          projectPath: targetProjectPath,
          includePatterns,
          excludePatterns,
        });
      } else if (lastCommit) {
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
          signal,
        });

        // Assign chunk ordering metadata for adjacent-chunk retrieval
        const totalChunks = chunks.length;
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (chunk) {
            chunk.chunkIndex = i;
            chunk.totalChunks = totalChunks;
          }
        }

        allChunks.push(...chunks);

        // Validate line numbers against actual file line count (LNC-05)
        try {
          const fileContent = await readFile(filePath, 'utf-8');
          const fileLineCount = fileContent.split('\n').length;
          for (const chunk of chunks) {
            if (chunk.endLine > fileLineCount) {
              logger.warn(
                {
                  event: 'chunk_line_number_mismatch',
                  filePath: chunk.relativePath,
                  chunkName: chunk.name,
                  endLine: chunk.endLine,
                  fileLineCount,
                },
                `Chunk endLine (${chunk.endLine}) exceeds file line count (${fileLineCount})`,
              );
            }
          }
        } catch {
          // If file can't be read for validation, skip check silently
        }

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

    // Call-chain extraction: extract defines/calls for each chunk, then build calledBy index
    const callInfoMap = new Map<string, { defines: string; calls: string[] }>();
    for (const chunk of allChunks) {
      const info = extractCalls(chunk.content, chunk.language, chunk.name ?? undefined);
      if (info) {
        callInfoMap.set(chunk.id, info);
      }
    }
    const calledByIndex = buildCalledByIndex([...callInfoMap.values()]);
    // Enrich chunks with call metadata (stored as transient properties for payload building)
    const chunkCallMeta = new Map<
      string,
      {
        defines?: string | undefined;
        calls?: string[] | undefined;
        calledBy?: string[] | undefined;
      }
    >();
    for (const chunk of allChunks) {
      const info = callInfoMap.get(chunk.id);
      if (info) {
        const calledBy = calledByIndex.get(info.defines);
        chunkCallMeta.set(chunk.id, {
          defines: info.defines,
          calls: info.calls.length > 0 ? info.calls : undefined,
          calledBy: calledBy && calledBy.length > 0 ? calledBy : undefined,
        });
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
            await embedBatchWithRetry(
              batch,
              embeddingProvider,
              vectorPoints,
              1,
              config.mavenModuleGraph,
              chunkCallMeta,
            );
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
                modulePath: inferModulePath(chunk.relativePath),
                packageName: inferPackageName(chunk.relativePath, chunk.content),
                layerHints: inferLayerHints(chunk.relativePath, chunk.chunkType, chunk.content),
                chunkIndex: chunk.chunkIndex,
                totalChunks: chunk.totalChunks,
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

    // Cross-cutting concept generation (post-store)
    // Enrich chunks with layerHints for concept detection, then generate aspect chunks
    const enrichedForConcepts = allChunks.map((chunk) => ({
      ...chunk,
      layerHints: inferLayerHints(chunk.relativePath, chunk.chunkType, chunk.content),
    }));
    const detectedConcepts = detectConcepts(enrichedForConcepts);
    if (detectedConcepts.length > 0) {
      const conceptChunks = generateConceptChunks(detectedConcepts, targetProjectPath);
      logger.info(
        {
          conceptCount: conceptChunks.length,
          totalSources: conceptChunks.reduce((s, c) => s + c.sourceCount, 0),
        },
        'Generated cross-cutting concept chunks',
      );

      // Embed and store concept chunks
      const conceptPoints: VectorPoint[] = [];
      for (const { chunk } of conceptChunks) {
        const description = chunk.content.split('\n').slice(0, 5).join(' ');
        const [textVector, codeVector] = await Promise.all([
          embeddingProvider.embed(description),
          embeddingProvider.embed(chunk.content.slice(0, 2000)),
        ]);
        const sparseVector = computeTermFrequencySparseVector(chunk.content);
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
        conceptPoints.push({ id: chunk.id, payload, textVector, codeVector, sparseVector });
      }
      for (let i = 0; i < conceptPoints.length; i += storeBatchSize) {
        const batch = conceptPoints.slice(i, i + storeBatchSize);
        await vectorStore.upsertBatch(batch);
      }
    }

    // Save incremental state
    const currentCommit = await getCurrentCommit(targetProjectPath);
    if (currentCommit) {
      const isLlmStrategy = chunkingStrategy?.name === 'llm';
      await saveLastIndexedCommit(
        frameworkDir,
        currentCommit,
        collectionName,
        undefined,
        isLlmStrategy ? PROMPT_CONTENT_HASH : undefined,
      );
    }

    progress.stage = 'done';
    progress.currentFile = undefined;
    onProgress?.({ ...progress });

    // Emit graph density stats if dependency graph is available
    if (dependencyGraph?.getDensityStats) {
      const stats = dependencyGraph.getDensityStats(collectionName);
      logger.info(
        {
          collection: collectionName,
          total_edges: stats.total_edges,
          files_with_imports: stats.files_with_imports,
          external_edges: stats.external_edges,
        },
        'Graph density stats after indexing',
      );
    }

    return {
      filesIndexed: progress.filesProcessed,
      chunksIndexed: vectorPoints.length,
      skippedChunks,
    };
  }
}
