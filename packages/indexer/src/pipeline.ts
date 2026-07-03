import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore, VectorPoint, ChunkPayload } from '@ia-framework/vector-store';
import type { CodeChunk } from '@ia-framework/ast-parser';
import { parseFile, extractCalls, buildCalledByIndex, classify } from '@ia-framework/ast-parser';
import type { ContextSource, EnrichmentConfig } from '@ia-framework/core';
import { createLogger } from '@ia-framework/core';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { relative, extname } from 'node:path';
import PQueue from 'p-queue';
import {
  LlmEnricher,
  type EnrichedCodeChunk,
  type EnrichmentProgress,
} from './enrichment/enricher.js';
import { walkFiles } from './file-walker.js';
import {
  getLastIndexedCommit,
  saveLastIndexedCommit,
  getCurrentCommit,
  getChangedFiles,
} from './incremental.js';
import type { ChunkingStrategy } from './strategies/types.js';
import {
  inferLayerHints,
  inferModulePath,
  inferPackageName,
  inferMavenModule,
} from './retrieval-metadata.js';
import { detectConcepts, generateConceptChunks } from './concept-generator.js';
import type { ModuleGraph } from '@ia-framework/core';
import { ThreeVectorEmbedder } from './embedder.js';

const logger = createLogger('indexer');

/** Default languages excluded from LLM enrichment (non-code config/build files). */
export const DEFAULT_EXCLUDE_LANGUAGES = ['xml', 'yaml', 'sql', 'proto'];

/** Default stereotypes excluded from LLM enrichment (low-value for semantic search). */
export const DEFAULT_EXCLUDE_STEREOTYPES = ['test', 'dto', 'config-block', 'migration'];

/** Default minimum line count for method/function chunks to qualify for enrichment. */
export const DEFAULT_MIN_ENRICHMENT_LINES = 6;

/**
 * Splits chunks into enrichable and skipped sets based on the excludeLanguages,
 * excludeStereotypes, and minEnrichmentLines config.
 * Chunks whose language matches the language exclusion list OR whose stereotype
 * matches the stereotype exclusion list are skipped from LLM enrichment.
 * Method/function chunks below minEnrichmentLines are also skipped.
 * All skipped chunks retain full AST metadata for embedding and search.
 */
export function filterChunksForEnrichment(
  chunks: CodeChunk[],
  config: EnrichmentConfig,
): { enrichable: CodeChunk[]; skipped: CodeChunk[] } {
  const excludeLanguages = config.excludeLanguages ?? DEFAULT_EXCLUDE_LANGUAGES;
  const excludeStereotypes = config.excludeStereotypes ?? DEFAULT_EXCLUDE_STEREOTYPES;
  const langSet = new Set(excludeLanguages.map((l) => l.toLowerCase()));
  const stereoSet = new Set(excludeStereotypes.map((s) => s.toLowerCase()));

  const enrichable: CodeChunk[] = [];
  const skipped: CodeChunk[] = [];

  // Step 1 & 2: Language and stereotype exclusion
  if (langSet.size === 0 && stereoSet.size === 0) {
    enrichable.push(...chunks);
  } else {
    for (const chunk of chunks) {
      const lang = (chunk.language ?? '').toLowerCase();
      const stereo = (
        (chunk as CodeChunk & { stereotype?: string }).stereotype ?? ''
      ).toLowerCase();
      if (langSet.has(lang) || (stereo && stereoSet.has(stereo))) {
        skipped.push(chunk);
      } else {
        enrichable.push(chunk);
      }
    }
  }

  // Step 3: Extension exclusion
  const excludeExtensions = config.excludeExtensions;
  let afterExtension: CodeChunk[];
  if (!excludeExtensions || excludeExtensions.length === 0) {
    afterExtension = enrichable;
  } else {
    const extSet = new Set(
      excludeExtensions.map((ext) => {
        const normalized = ext.startsWith('.') ? ext : `.${ext}`;
        return normalized.toLowerCase();
      }),
    );
    afterExtension = [];
    for (const chunk of enrichable) {
      const fileExt = extname(chunk.filePath).toLowerCase();
      if (fileExt && extSet.has(fileExt)) {
        skipped.push(chunk);
      } else {
        afterExtension.push(chunk);
      }
    }
  }

  // Step 4: Trivial line-count exclusion (method/function only)
  const minLines = config.minEnrichmentLines ?? DEFAULT_MIN_ENRICHMENT_LINES;
  if (minLines <= 1) {
    // minEnrichmentLines of 1 or less disables trivial filtering
    return { enrichable: afterExtension, skipped };
  }

  const afterTrivial: CodeChunk[] = [];
  for (const chunk of afterExtension) {
    const type = chunk.chunkType;
    if (type === 'method' || type === 'function') {
      const lineCount = (chunk.endLine ?? 0) - (chunk.startLine ?? 0) + 1;
      if (lineCount < minLines) {
        skipped.push(chunk);
      } else {
        afterTrivial.push(chunk);
      }
    } else {
      afterTrivial.push(chunk);
    }
  }

  return { enrichable: afterTrivial, skipped };
}

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
  /**
   * @deprecated ChunkingStrategy is no longer used by the unified pipeline.
   * When provided, the pipeline delegates file parsing to this strategy for backward compat.
   */
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
  /** Skip LLM enrichment even if enrichmentConfig is provided (default: false) */
  skipEnrichment?: boolean | undefined;
  /** LLM enrichment configuration. When omitted, enrichment is skipped. */
  enrichmentConfig?: EnrichmentConfig | undefined;
  /**
   * Force re-creation of the Qdrant collection even if it uses the old schema (text/code).
   * When true, the old collection is deleted and recreated with the new 3-vector schema.
   * Equivalent to the CLI --force flag.
   */
  force?: boolean | undefined;
}

export interface IndexingProgress {
  stage: 'walking' | 'parsing' | 'enriching' | 'embedding' | 'storing' | 'done';
  filesTotal: number;
  filesProcessed: number;
  chunksTotal: number;
  chunksIndexed: number;
  currentFile?: string | undefined;
  /** Total number of embedding batches to process */
  batchesTotal?: number | undefined;
  /** Number of embedding batches completed so far */
  batchesCompleted?: number | undefined;
  /** Warning message from a failed batch (when skipOnFailure is true) */
  warning?: string | undefined;
}

export type ProgressCallback = (progress: IndexingProgress) => void;

/**
 * Provider-aware concurrency defaults for embedding batch processing.
 * Ollama: 6 (optimized for Apple Silicon 16GB — embedding is lightweight, no KV cache)
 * OpenAI: 10 (cloud API, higher rate limits)
 */
function getDefaultConcurrency(providerName: string): number {
  switch (providerName) {
    case 'ollama':
      return 6;
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
 * Uses ThreeVectorEmbedder to produce semantic/signature/sparse vectors.
 * Payloads are lean — no raw code content stored (T019).
 * Retries once on failure; if both attempts fail, throws.
 */
async function embedBatchAndStore(
  batch: EnrichedCodeChunk[],
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
  const embedder = new ThreeVectorEmbedder(provider);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Reload full content from disk for this batch (content was truncated to save memory)
      const contents = await reloadBatchContents(batch);
      // Pre-populate content on each chunk so ThreeVectorEmbedder can build embeddings
      const chunksWithContent = batch.map((chunk, i) => ({ ...chunk, content: contents[i]! }));
      // Embed all 3 vectors (semantic/signature/sparse) in a single batched operation
      const embedResults = await embedder.embedBatch(chunksWithContent);
      // Build VectorPoints and upsert immediately
      const points: VectorPoint[] = [];
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const content = contents[j]!;
        const embedResult = embedResults[j]!;
        // T078: filePath NOT stored — absolute path leaks host machine paths.
        // Reconstruct at retrieval time as projectRoot + '/' + relativePath.
        // T080: contentHash computed from reloaded content (not the truncated in-memory copy).
        const contentHash = createHash('sha256').update(content).digest('hex');
        // Lean payload — no raw code content (T019), no filePath (T078)
        const payload: ChunkPayload = {
          chunkId: chunk.id,
          relativePath: chunk.relativePath,
          language: chunk.language,
          chunkType: chunk.chunkType,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          imports: chunk.imports,
          exports: chunk.exports,
          modulePath: inferModulePath(chunk.relativePath),
          packageName: inferPackageName(chunk.relativePath, content),
          layerHints: inferLayerHints(chunk.relativePath, chunk.chunkType, content),
          contentHash,
          indexedAt: new Date().toISOString(),
          ...(chunk.name != null ? { name: chunk.name } : {}),
          ...(chunk.parentName != null ? { parentName: chunk.parentName } : {}),
          ...(chunk.superclass != null ? { superclass: chunk.superclass } : {}),
          ...(chunk.interfaces != null ? { interfaces: chunk.interfaces } : {}),
          ...(chunk.isInnerClass != null ? { isInnerClass: chunk.isInnerClass } : {}),
          ...(chunk.chunkIndex != null ? { chunkIndex: chunk.chunkIndex } : {}),
          ...(chunk.totalChunks != null ? { totalChunks: chunk.totalChunks } : {}),
          ...(repoId ? { repoId } : {}),
          // T079: classifier results (only when positive evidence found — 'unknown' skipped)
          ...(chunk.stereotype != null ? { stereotype: chunk.stereotype } : {}),
          ...(chunk.archLayer != null ? { archLayer: chunk.archLayer } : {}),
          // T080: missing CodeChunk fields
          ...(chunk.annotations != null ? { annotations: chunk.annotations } : {}),
          ...(chunk.visibility != null ? { visibility: chunk.visibility } : {}),
          ...(chunk.contextHeader != null ? { contextHeader: chunk.contextHeader } : {}),
          ...(chunk.classSignature != null ? { classSignature: chunk.classSignature } : {}),
          ...(chunk.dependencyEdges != null ? { dependencyEdges: chunk.dependencyEdges } : {}),
          ...(chunk.moduleInfo != null ? { moduleInfo: chunk.moduleInfo } : {}),
          // T122: Phase 14 — annotationMeta for thin-class semantic enrichment
          ...(chunk.annotationMeta != null ? { annotationMeta: chunk.annotationMeta } : {}),
          // T081: LLM enrichment fields (present only when LlmEnricher ran)
          ...(chunk.description != null ? { description: chunk.description } : {}),
          ...(chunk.businessContext != null ? { businessContext: chunk.businessContext } : {}),
          ...(chunk.semanticTags != null ? { semanticTags: chunk.semanticTags } : {}),
          ...(chunk.relationships != null ? { relationships: chunk.relationships } : {}),
          ...(chunk.enrichedAt != null ? { enrichedAt: chunk.enrichedAt } : {}),
          ...(chunk.enrichmentModel != null ? { enrichmentModel: chunk.enrichmentModel } : {}),
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
          semantic: embedResult.semantic,
          signature: embedResult.signature,
          sparse: embedResult.sparse,
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
      ...(config.force ? { force: true } : {}),
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

      // Check if the LLM chunking prompt has changed — no longer applicable (strategy removed)
      const promptChanged = false;

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
          await vectorStore.deleteByFilter({
            must: [{ key: 'relativePath', match: { value: relative(targetProjectPath, filePath) } }],
          });
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

    // Parse all files into chunks — use chunkingStrategy if provided (backward compat),
    // otherwise call parseFile directly (the new default AST-first pipeline).
    const allChunks: CodeChunk[] = [];
    // Extract call-chain info per-file during parsing to avoid a second pass
    const callInfoMap = new Map<string, { defines: string; calls: string[] }>();
    for (const filePath of filesToProcess) {
      progress.currentFile = filePath;
      try {
        const chunks = chunkingStrategy
          ? await chunkingStrategy.chunk(filePath, {
              maxChunkLines,
              projectRoot: targetProjectPath,
              signal,
            })
          : await parseFile(filePath, { maxChunkLines, projectRoot: targetProjectPath });

        // Assign chunk ordering metadata for adjacent-chunk retrieval
        const totalChunks = chunks.length;
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (chunk) {
            chunk.chunkIndex = i;
            chunk.totalChunks = totalChunks;
          }
        }

        // T079: Classify each chunk — assign stereotype/archLayer from heuristic rules.
        // Only set when positive evidence found (skip 'unknown' to avoid noise in payload).
        for (const chunk of chunks) {
          const classification = classify(chunk);
          if (classification.stereotype !== 'unknown') {
            chunk.stereotype = classification.stereotype;
          }
          if (classification.archLayer) {
            chunk.archLayer = classification.archLayer;
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

    // T081: Run LLM enricher if configured and not skipped.
    // T082: Emit 'enriching' progress stage between parsing and embedding.
    // NOTE: Pipeline is sequential (enrich all → embed all) because Ollama cannot reliably
    // hold both the generate model and embed model in memory simultaneously on 16GB devices.
    // See D-002 in spec for rationale.
    let processedChunks: EnrichedCodeChunk[];
    if (config.enrichmentConfig && !config.skipEnrichment) {
      // Filter out non-code languages and low-value stereotypes from enrichment (US1, US5)
      const { enrichable: enrichableChunks, skipped: filteredSkippedChunks } =
        filterChunksForEnrichment(allChunks, config.enrichmentConfig);

      if (filteredSkippedChunks.length > 0) {
        logger.info(
          `Filtered ${filteredSkippedChunks.length} chunks from enrichment (${enrichableChunks.length} enrichable)`,
        );
      }

      progress.stage = 'enriching';
      progress.batchesTotal = undefined;
      progress.batchesCompleted = undefined;
      onProgress?.({ ...progress });

      const enricher = new LlmEnricher(config.enrichmentConfig);
      const enrichedChunks = await enricher.enrich(enrichableChunks, (ep: EnrichmentProgress) => {
        progress.batchesTotal = ep.batchesTotal;
        progress.batchesCompleted = ep.batchesCompleted;
        progress.currentFile = ep.currentFile;
        progress.warning = ep.warning;
        onProgress?.({ ...progress });
        progress.warning = undefined; // Clear after emitting so it doesn't repeat
      });

      // Merge enriched chunks with skipped chunks (skipped retain AST metadata only)
      processedChunks = [...enrichedChunks, ...(filteredSkippedChunks as EnrichedCodeChunk[])];
    } else {
      processedChunks = allChunks as EnrichedCodeChunk[];
    }

    // Reset batch counters before embedding so the embedding renderer starts fresh
    progress.batchesTotal = undefined;
    progress.batchesCompleted = undefined;
    progress.stage = 'embedding';
    onProgress?.({ ...progress });

    // Embed chunks in batches using p-queue for concurrent processing.
    // Each batch is upserted to Qdrant immediately after embedding to avoid
    // accumulating all vector points in memory (OOM fix for large repos).
    const concurrency = embeddingConcurrency ?? getDefaultConcurrency(embeddingProvider.name);
    const queue = new PQueue({ concurrency });
    let chunksIndexed = 0;
    let skippedChunks = 0;

    // Build batch list (references into processedChunks — no copy)
    const batches: EnrichedCodeChunk[][] = [];
    for (let i = 0; i < processedChunks.length; i += embeddingBatchSize) {
      batches.push(processedChunks.slice(i, i + embeddingBatchSize));
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
          } catch (err) {
            // Retry exhausted — skip batch
            skippedChunks += batch.length;
            logger.warn(
              { batchSize: batch.length, error: err instanceof Error ? err.message : String(err) },
              'Embedding batch skipped after retry failure',
            );
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

          // Embed source chunks in batches and upsert immediately using ThreeVectorEmbedder
          const srcEmbedder = new ThreeVectorEmbedder(embeddingProvider);
          for (let i = 0; i < sourceChunks.length; i += embeddingBatchSize) {
            const batch = sourceChunks.slice(i, i + embeddingBatchSize);

            // Context source chunks have content populated — cast to CodeChunk for embedder
            const embedResults = await srcEmbedder.embedBatch(batch as unknown as CodeChunk[]);

            const points: VectorPoint[] = [];
            for (let j = 0; j < batch.length; j++) {
              const chunk = batch[j]!;
              const embedResult = embedResults[j]!;
              // Context source chunks keep content in payload (no filesystem file to read)
              const payload: ChunkPayload = {
                chunkId: chunk.id,
                filePath: chunk.filePath,
                relativePath: chunk.relativePath,
                language: chunk.language,
                chunkType: chunk.chunkType,
                content: chunk.content,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                imports: chunk.imports,
                exports: chunk.exports,
                modulePath: inferModulePath(chunk.relativePath),
                packageName: inferPackageName(chunk.relativePath, chunk.content),
                layerHints: inferLayerHints(chunk.relativePath, chunk.chunkType, chunk.content),
                indexedAt: chunk.indexedAt,
                ...(chunk.name != null ? { name: chunk.name } : {}),
                ...(chunk.chunkIndex != null ? { chunkIndex: chunk.chunkIndex } : {}),
                ...(chunk.totalChunks != null ? { totalChunks: chunk.totalChunks } : {}),
              };
              points.push({
                id: chunk.id,
                semantic: embedResult.semantic,
                signature: embedResult.signature,
                sparse: embedResult.sparse,
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

      // Embed and store concept chunks using ThreeVectorEmbedder
      const conceptEmbedder = new ThreeVectorEmbedder(embeddingProvider);
      const conceptBatchSize = 100;
      for (let i = 0; i < conceptChunks.length; i += conceptBatchSize) {
        const batchMeta = conceptChunks.slice(i, i + conceptBatchSize);
        const batchChunks = batchMeta.map((m) => m.chunk);
        const embedResults = await conceptEmbedder.embedBatch(batchChunks);
        const conceptPoints: VectorPoint[] = [];
        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j]!;
          const embedResult = embedResults[j]!;
          // Concept chunks keep content in payload (synthetic — no filesystem file)
          const payload: ChunkPayload = {
            chunkId: chunk.id,
            filePath: chunk.filePath,
            relativePath: chunk.relativePath,
            language: chunk.language,
            chunkType: chunk.chunkType,
            content: chunk.content,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            imports: chunk.imports,
            exports: chunk.exports,
            indexedAt: new Date().toISOString(),
            ...(chunk.name != null ? { name: chunk.name } : {}),
          };
          conceptPoints.push({
            id: chunk.id,
            semantic: embedResult.semantic,
            signature: embedResult.signature,
            sparse: embedResult.sparse,
            payload,
          });
        }
        await vectorStore.upsertBatch(conceptPoints);
      }
    }

    // Save incremental state
    const currentCommit = await getCurrentCommit(targetProjectPath);
    if (currentCommit) {
      await saveLastIndexedCommit(
        frameworkDir,
        currentCommit,
        collectionName,
        undefined,
        undefined,
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
