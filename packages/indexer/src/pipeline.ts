import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore, VectorPoint, ChunkPayload } from '@ia-framework/vector-store';
import type { CodeChunk } from '@ia-framework/ast-parser';
import { extractCalls, buildCalledByIndex } from '@ia-framework/ast-parser';
import type { ContextSource } from '@ia-framework/core';
import { createLogger } from '@ia-framework/core';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
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
 * Reload content for a batch of chunks, reading each file only once.
 * Groups chunks by filePath, reads each file via streaming line reader,
 * and extracts all needed line ranges in a single pass.
 */
async function reloadBatchContents(batch: CodeChunk[]): Promise<string[]> {
  // Group chunk indices by file path
  const fileGroups = new Map<string, number[]>();
  for (let i = 0; i < batch.length; i++) {
    const chunk = batch[i]!;
    const indices = fileGroups.get(chunk.filePath);
    if (indices) {
      indices.push(i);
    } else {
      fileGroups.set(chunk.filePath, [i]);
    }
  }

  const results = new Array<string>(batch.length);

  // Process each file once
  for (const [filePath, indices] of fileGroups) {
    // Sort chunks by startLine to enable single-pass extraction
    const sortedIndices = [...indices].sort((a, b) => batch[a]!.startLine - batch[b]!.startLine);
    const maxEndLine = Math.max(...sortedIndices.map((i) => batch[i]!.endLine));

    // Read file line by line, extracting needed ranges
    const chunkLines = new Map<number, string[]>(); // index -> collected lines
    for (const idx of sortedIndices) {
      chunkLines.set(idx, []);
    }

    let lineNum = 0;
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      lineNum++;
      if (lineNum > maxEndLine) {
        rl.close();
        break;
      }
      // Check which chunks need this line
      for (const idx of sortedIndices) {
        const chunk = batch[idx]!;
        if (lineNum >= chunk.startLine && lineNum <= chunk.endLine) {
          chunkLines.get(idx)!.push(line);
        }
      }
    }

    // Join collected lines for each chunk
    for (const idx of sortedIndices) {
      results[idx] = chunkLines.get(idx)!.join('\n');
    }
  }

  return results;
}

/**
 * Embed a single batch with retry logic and immediately upsert to Qdrant.
 * This avoids accumulating all vector points in memory — each batch is
 * stored and then released for GC.
 * Retries once on failure; if both attempts fail, throws.
 */
async function embedBatchAndStore(
  batch: CodeChunk[],
  provider: EmbeddingProvider,
  vectorStore: VectorStore,
  maxRetries = 1,
  mavenModuleGraph?: ModuleGraph | undefined,
  callMeta?: Map<
    string,
    { defines?: string | undefined; calls?: string[] | undefined; calledBy?: string[] | undefined }
  >,
  repoId?: string | undefined,
): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Reload full content from disk for this batch (content was truncated to save memory)
      const contents = await reloadBatchContents(batch);
      const textDescriptions = batch.map((c) => c.description ?? chunkToDescription(c));
      const codeTexts = contents;
      // Text and code embeddings run in parallel within each batch
      const [textVectors, codeVectors] = await Promise.all([
        provider.embedBatch(textDescriptions, 'document'),
        provider.embedBatch(codeTexts, 'document'),
      ]);
      // Build VectorPoints and upsert immediately
      const points: VectorPoint[] = [];
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const content = contents[j]!;
        const payload: ChunkPayload = {
          chunkId: chunk.id,
          filePath: chunk.filePath,
          relativePath: chunk.relativePath,
          language: chunk.language,
          chunkType: chunk.chunkType,
          name: chunk.name,
          content,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          imports: chunk.imports,
          exports: chunk.exports,
          parentName: chunk.parentName,
          superclass: chunk.superclass,
          interfaces: chunk.interfaces,
          isInnerClass: chunk.isInnerClass,
          modulePath: inferModulePath(chunk.relativePath),
          packageName: inferPackageName(chunk.relativePath, content),
          layerHints: inferLayerHints(chunk.relativePath, chunk.chunkType, content),
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          indexedAt: new Date().toISOString(),
          ...(repoId ? { repoId } : {}),
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
        points.push({
          id: chunk.id,
          textVector: textVectors[j]!,
          codeVector: codeVectors[j]!,
          sparseVector: computeTermFrequencySparseVector(chunk.content),
          payload,
        });
      }
      // Upsert immediately — don't hold in memory
      await vectorStore.upsertBatch(points);
      return points.length; // Success — return count
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
    const { repoId } = config;

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
    // Extract call-chain info per-file during parsing to avoid a second pass
    const callInfoMap = new Map<string, { defines: string; calls: string[] }>();
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

        // Extract call-chain info while content is in memory
        for (const chunk of chunks) {
          const info = extractCalls(chunk.content, chunk.language, chunk.name ?? undefined);
          if (info) {
            callInfoMap.set(chunk.id, info);
          }
        }

        // Strip content from chunks to avoid holding all file contents in memory.
        // Content will be re-read from disk during the embedding phase.
        // Keep only first 500 chars for concept detection pattern matching.
        for (const chunk of chunks) {
          chunk.content = chunk.content.length > 500 ? chunk.content.slice(0, 500) : chunk.content;
        }

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

    // Build calledBy index from extracted call info
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

    // Embed chunks in batches using p-queue for concurrent processing.
    // Each batch is upserted to Qdrant immediately after embedding to avoid
    // accumulating all vector points in memory (OOM fix for large repos).
    const concurrency = embeddingConcurrency ?? getDefaultConcurrency(embeddingProvider.name);
    const queue = new PQueue({ concurrency });
    let chunksIndexed = 0;
    let skippedChunks = 0;

    // Build batch list (references into allChunks — no copy)
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
            const count = await embedBatchAndStore(
              batch,
              embeddingProvider,
              vectorStore,
              1,
              config.mavenModuleGraph,
              chunkCallMeta,
              repoId,
            );
            chunksIndexed += count;
          } catch {
            // Retry exhausted — skip batch
            skippedChunks += batch.length;
            logger.warn({ batchSize: batch.length }, 'Embedding batch skipped after retry failure');
          }

          progress.batchesCompleted = (progress.batchesCompleted ?? 0) + 1;
          progress.chunksIndexed = chunksIndexed;
          onProgress?.({ ...progress });
        }),
      ),
    );

    // Process additional context sources — embed and upsert immediately per batch
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

          // Embed source chunks in batches and upsert immediately
          for (let i = 0; i < sourceChunks.length; i += embeddingBatchSize) {
            const batch = sourceChunks.slice(i, i + embeddingBatchSize);

            // For context sources, also split text vs code embedding
            const textDescs = batch.map((c) => chunkToDescription(c));
            const textVecs = await embeddingProvider.embedBatch(textDescs);
            const codeTexts = batch.map((c) => c.content);
            const codeVecs = await embeddingProvider.embedBatch(codeTexts);

            const points: VectorPoint[] = [];
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
              points.push({
                id: chunk.id,
                textVector: textVecs[j]!,
                codeVector: codeVecs[j]!,
                sparseVector: computeTermFrequencySparseVector(chunk.content),
                payload,
              });
            }
            await vectorStore.upsertBatch(points);
            chunksIndexed += points.length;
            progress.chunksIndexed = chunksIndexed;
            onProgress?.({ ...progress });
          }
        } catch (err) {
          logger.error({ source: source.name, err }, 'Context source failed — skipping');
        }
      }
    }

    // Storing phase complete (batches already upserted during embedding)
    progress.stage = 'storing';
    onProgress?.({ ...progress });

    // Cross-cutting concept generation (post-store)
    // Content is already truncated to 500 chars from parsing phase — sufficient for pattern matching
    // Enrich chunks with layerHints in-place (avoids copying entire allChunks array)
    for (const chunk of allChunks) {
      (chunk as CodeChunk & { layerHints?: string[] }).layerHints = inferLayerHints(
        chunk.relativePath,
        chunk.chunkType,
        chunk.content,
      );
    }
    const detectedConcepts = detectConcepts(allChunks as (CodeChunk & { layerHints?: string[] })[]);
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
      const conceptBatchSize = 100;
      for (let i = 0; i < conceptPoints.length; i += conceptBatchSize) {
        const batch = conceptPoints.slice(i, i + conceptBatchSize);
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
      chunksIndexed,
      skippedChunks,
    };
  }
}
