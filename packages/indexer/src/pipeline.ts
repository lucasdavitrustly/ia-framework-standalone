import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore, VectorPoint, ChunkPayload } from '@ia-framework/vector-store';
import type { CodeChunk } from '@ia-framework/ast-parser';
import { parseFile, extractCalls, buildCalledByIndex, classify } from '@ia-framework/ast-parser';
import type { ChunkMetadata, ContextSource, EnrichmentConfig } from '@ia-framework/core';
import {
  EmbeddingResponseError,
  capabilitiesFor,
  contractFingerprint,
  createLogger,
  estimateProviderInputTokens,
  type ModelCapabilities,
} from '@ia-framework/core';
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
import type { ChangeFailure } from './incremental.js';
import type { ChunkingStrategy } from './strategies/types.js';
import {
  inferLayerHints,
  inferModulePath,
  inferPackageName,
  inferMavenModule,
} from './retrieval-metadata.js';
import { detectConcepts, generateConceptChunks } from './concept-generator.js';
import type { ModuleGraph } from '@ia-framework/core';
import {
  ThreeVectorEmbedder,
  buildEmbeddingBudgetChannels,
  embeddingFailureFromError,
  isContextLengthError,
  type EmbedderResult,
} from './embedder.js';
import {
  packBatches,
  sizedInputFromChannels,
  type SizedInput,
} from './embedding/input-budgeter.js';
import { handleOversizedInput } from './embedding/oversized-input-handler.js';

const logger = createLogger('indexer');

type RuntimeChunk = EnrichedCodeChunk & {
  repoId?: string;
  signatureOnly?: boolean;
  embeddingContent?: string;
  sourceContent?: string;
};

interface BatchStoreResult {
  indexed: number;
  skipped: number;
  failures: Array<{ chunk: EnrichedCodeChunk | ChunkMetadata; reason: string; retryable: boolean }>;
}

export interface ChunkIdentity {
  repoId?: string | undefined;
  relativePath: string;
  name?: string | undefined;
  startLine: number;
  endLine: number;
}

export interface SkippedChunk extends ChunkIdentity {
  reason: string;
}

export type SignatureOnlyChunk = ChunkIdentity;

export interface FailedFile {
  relativePath: string;
  reason: string;
}

export interface IndexRunMetrics {
  mode: 'incremental' | 'full';
  filesChanged: number;
  chunksDeleted: number;
  chunksReindexed: number;
  chunksAffected: number;
  failedFiles: FailedFile[];
  failedChanges: ChangeFailure[];
}

export interface IndexRunSummary {
  filesIndexed: number;
  chunksIndexed: number;
  /** Retained as a scalar for existing callers; equal to skipped.length. */
  skippedChunks: number;
  skipped: SkippedChunk[];
  signatureOnlyCount: number;
  signatureOnly: SignatureOnlyChunk[];
  failedFiles: FailedFile[];
  failedChanges: ChangeFailure[];
  metrics: IndexRunMetrics;
}

type ChunkIdentitySource = {
  repoId?: string | undefined;
  relativePath: string;
  name?: string | undefined;
  startLine: number;
  endLine: number;
};

function toChunkIdentity(chunk: ChunkIdentitySource, fallbackRepoId?: string): ChunkIdentity {
  return {
    repoId: chunk.repoId ?? fallbackRepoId,
    relativePath: chunk.relativePath,
    ...(chunk.name != null ? { name: chunk.name } : {}),
    startLine: chunk.startLine,
    endLine: chunk.endLine,
  };
}

function cancelledBatchResult(
  batch: RuntimeChunk[],
  failures: BatchStoreResult['failures'],
  embedded: Array<{ chunk: RuntimeChunk; result: EmbedderResult; position: number }>,
): BatchStoreResult {
  const byChunk = new Map<string, BatchStoreResult['failures'][number]>();
  for (const failure of failures) byChunk.set(failure.chunk.id, failure);
  for (const { chunk } of embedded) {
    if (!byChunk.has(chunk.id)) {
      byChunk.set(chunk.id, {
        chunk,
        reason: 'indexing cancelled before upsert',
        retryable: false,
      });
    }
  }
  for (const chunk of batch) {
    if (!byChunk.has(chunk.id)) {
      byChunk.set(chunk.id, {
        chunk,
        reason: 'indexing cancelled before upsert',
        retryable: false,
      });
    }
  }
  return { indexed: 0, skipped: batch.length, failures: [...byChunk.values()] };
}

function providerCapabilities(provider: EmbeddingProvider, batchSize: number): ModelCapabilities {
  const capabilities = capabilitiesFor(provider.contract.provider, provider.model);
  const maxBatchItems = Math.min(capabilities.maxBatchItems ?? Number.POSITIVE_INFINITY, batchSize);
  return {
    ...capabilities,
    ...(Number.isFinite(maxBatchItems) ? { maxBatchItems } : {}),
  };
}

function isRetryableEmbeddingError(error: unknown): boolean {
  return embeddingFailureFromError(error, 0).retryable;
}

function embedderFailureIsRetryable(reason: string): boolean {
  return !reason.startsWith('short provider response:');
}

const EMBEDDING_RETRY_DELAY_MS = 500;

async function prepareEmbeddingChunks(
  chunks: EnrichedCodeChunk[],
  capabilities: ModelCapabilities,
  maxChunkLines: number,
  repoId?: string,
  documentPrefix = '',
): Promise<{
  chunks: RuntimeChunk[];
  failures: Array<{ chunk: EnrichedCodeChunk; reason: string }>;
}> {
  if (chunks.length === 0) return { chunks: [], failures: [] };

  // The provider prepends the document prefix at request time, so reserve its
  // tokens here — otherwise a chunk reduced to exactly maxInputTokens is
  // rejected by the budgeter once prefixed, and skipped despite being handled.
  const reservedTokens = documentPrefix ? estimateProviderInputTokens(documentPrefix) : 0;
  const fullContents = await reloadBatchContents(chunks);
  const prepared: RuntimeChunk[] = [];
  const failures: Array<{ chunk: EnrichedCodeChunk; reason: string }> = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]!;
    const reloaded = fullContents[index];
    const fullContent = reloaded?.content ?? chunk.content;
    const sourceRangeContent = reloaded?.sourceContent ?? fullContent;
    // Sub-chunks have the parent declaration prepended; account for those extra
    // leading lines when slicing source content back out by line offset.
    const prefixLineCount = reloaded?.prefixLineCount ?? 0;
    const sourceChunk: RuntimeChunk = {
      ...chunk,
      content: fullContent,
      ...(repoId ? { repoId } : {}),
    };

    try {
      const handled = handleOversizedInput(sourceChunk, {
        maxInputTokens: capabilities.maxInputTokens,
        maxChunkLines,
        reservedTokens,
        estimateInputTokens: (candidate) => {
          const runtimeCandidate = candidate as RuntimeChunk;
          const channels = buildEmbeddingBudgetChannels(
            {
              ...runtimeCandidate,
              content: runtimeCandidate.embeddingContent ?? runtimeCandidate.content,
            },
            documentPrefix,
          );
          return Math.max(...channels.map((channel) => estimateProviderInputTokens(channel)));
        },
      });
      for (const handledChunk of handled.chunks) {
        // `fullContent` may carry a prepended parent declaration, so a source
        // line maps to `line - chunk.startLine + prefixLineCount` in it. In
        // 'split' mode the splitter derived the part's startLine from that same
        // prefixed content, so the prefix is already included — adding it again
        // would double-count.
        const contentLineOffset = handled.mode === 'split' ? 0 : prefixLineCount;
        const handledStartOffset = handledChunk.startLine - chunk.startLine + contentLineOffset;
        const handledEndOffset = handledChunk.endLine - chunk.startLine + contentLineOffset;
        const sourceContent =
          handled.mode === 'signature-only'
            ? sourceRangeContent
            : handled.mode === 'split'
              ? fullContent
                  .split('\n')
                  .slice(handledStartOffset, handledEndOffset + 1)
                  .join('\n')
              : sourceRangeContent;
        prepared.push({
          ...handledChunk,
          ...(handled.mode === 'signature-only'
            ? { embeddingContent: handledChunk.content, sourceContent }
            : { sourceContent }),
        });
      }
    } catch (error) {
      failures.push({
        chunk,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { chunks: prepared, failures };
}

function preparedChunkBudgetChannels(chunk: RuntimeChunk, documentPrefix = ''): string[] {
  return buildEmbeddingBudgetChannels(
    {
      ...chunk,
      content: chunk.embeddingContent ?? chunk.content,
    },
    documentPrefix,
  );
}

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
 *
 * For split sub-chunks (`Foo$partN`), the raw `startLine..endLine` range covers
 * only the body segment — the parent declaration line(s) the splitter had
 * prepended are NOT in that range. Without them, the downstream oversized-input
 * handler cannot locate the declaration and drops the chunk. To keep sub-chunks
 * self-describing, we deterministically re-read the parent declaration using
 * `parentStartLine` (from parentStartLine up to and including the first line
 * containing `{`) and prepend it to the reloaded body.
 */
function isSubChunk(chunk: CodeChunk): boolean {
  return (
    chunk.parentStartLine != null &&
    chunk.parentEndLine != null &&
    typeof chunk.name === 'string' &&
    /(?:\$part|^part)\d+$/.test(chunk.name)
  );
}

function contextStartLine(chunk: CodeChunk): number {
  const isMember = chunk.chunkType === 'method' || chunk.chunkType === 'function';
  if (
    isMember &&
    chunk.docCommentStartLine != null &&
    chunk.docCommentStartLine < chunk.startLine
  ) {
    return chunk.docCommentStartLine;
  }
  return chunk.startLine;
}

/**
 * Upper bound on how many lines are read forward from `parentStartLine` while
 * looking for the declaration's opening brace. A brace-less construct (SQL,
 * YAML, Python) must never accumulate an unbounded prefix.
 */
const PARENT_DECLARATION_MAX_LINES = 64;

const DECLARATION_KEYWORDS = /(?:^|\s)(class|interface|enum|record|trait|module|object)\s+/;

function parentDeclarationName(chunk: CodeChunk): string | undefined {
  const name = chunk.parentName ?? chunk.name;
  if (!name) return undefined;
  const stripped = name.replace(/\$part\d+$/, '');
  return stripped.length > 0 && !/^part\d+$/.test(stripped) ? stripped : undefined;
}

function escapedWord(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isParentDeclarationLine(line: string, name: string | undefined): boolean {
  if (!name || !DECLARATION_KEYWORDS.test(line)) return false;
  return new RegExp(`\\b${escapedWord(name)}\\b`).test(line);
}

/**
 * Last line the parent-declaration scan may read for a sub-chunk. Capped at
 * `startLine - 1` so the prefix can never overlap (and therefore duplicate)
 * the sub-chunk body, and at a small window so a missing brace is bounded.
 */
function parentDeclarationEndLine(chunk: CodeChunk): number {
  return Math.min(chunk.startLine - 1, chunk.parentStartLine! + PARENT_DECLARATION_MAX_LINES - 1);
}

interface ParentDeclarationScan {
  /** Lines collected so far, starting at `parentStartLine`. */
  readonly lines: string[];
  /** Last line this scan may read (inclusive). */
  readonly endLine: number;
  /** True once the opening brace has been seen. */
  foundBrace: boolean;
  /** True once a declaration line for the parent has been found. */
  foundDeclaration: boolean;
  /** True once no further lines should be collected. */
  done: boolean;
}

interface ReloadedContent {
  /** Reloaded content, with the parent declaration prepended for sub-chunks. */
  readonly content: string;
  /** Exact source-range content, excluding any virtual parent declaration. */
  readonly sourceContent: string;
  /** Number of parent-declaration lines prepended (0 for non-sub-chunks). */
  readonly prefixLineCount: number;
}

async function reloadBatchContents(batch: CodeChunk[]): Promise<ReloadedContent[]> {
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

  const results = new Array<ReloadedContent>(batch.length);

  // Process each file once
  for (const [filePath, indices] of fileGroups) {
    // Sort chunks by startLine to enable single-pass extraction
    const sortedIndices = [...indices].sort((a, b) => batch[a]!.startLine - batch[b]!.startLine);

    // Sub-chunks additionally need the parent declaration line(s), which sit
    // BEFORE their body range. Scan state is per sub-chunk.
    const parentScans = new Map<number, ParentDeclarationScan>();
    for (const idx of sortedIndices) {
      const chunk = batch[idx]!;
      if (isSubChunk(chunk) && chunk.parentStartLine != null) {
        parentScans.set(idx, {
          lines: [],
          endLine: parentDeclarationEndLine(chunk),
          foundBrace: false,
          foundDeclaration: false,
          done: false,
        });
      }
    }

    const maxEndLine = Math.max(...sortedIndices.map((i) => batch[i]!.endLine));

    // Read file line by line, extracting needed ranges
    const chunkLines = new Map<number, string[]>(); // index -> collected source-range lines
    const contextChunkLines = new Map<number, string[]>(); // index -> docs + source range
    for (const idx of sortedIndices) {
      chunkLines.set(idx, []);
      contextChunkLines.set(idx, []);
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
        if (lineNum >= contextStartLine(chunk) && lineNum <= chunk.endLine) {
          contextChunkLines.get(idx)!.push(line);
        }
        // Collect the parent declaration for sub-chunks, deterministically from
        // parentStartLine up to and including the first line containing '{',
        // bounded so it can neither run away nor reach into the body.
        const scan = parentScans.get(idx);
        if (scan && !scan.done && lineNum >= chunk.parentStartLine!) {
          scan.lines.push(line);
          if (isParentDeclarationLine(line, parentDeclarationName(chunk))) {
            scan.foundDeclaration = true;
          }
          const canAcceptBrace =
            scan.foundDeclaration || parentDeclarationName(chunk) === undefined;
          if (canAcceptBrace && line.includes('{')) {
            scan.foundBrace = true;
            scan.done = true;
          } else if (lineNum >= scan.endLine) {
            scan.done = true;
          }
        }
      }
    }

    // Join collected lines for each chunk, prepending the parent declaration
    // for sub-chunks so they remain self-describing.
    for (const idx of sortedIndices) {
      const body = chunkLines.get(idx)!.join('\n');
      const context = contextChunkLines.get(idx)!.join('\n');
      const scan = parentScans.get(idx);
      // Without a brace inside the window the declaration is assumed to be the
      // single `parentStartLine` line.
      const prefixLines = scan ? (scan.foundBrace ? scan.lines : scan.lines.slice(0, 1)) : [];
      if (prefixLines.length > 0) {
        results[idx] = {
          content: prefixLines.join('\n') + '\n' + body,
          sourceContent: body,
          prefixLineCount: prefixLines.length,
        };
      } else if (context !== body) {
        results[idx] = {
          content: context,
          sourceContent: body,
          prefixLineCount: Math.max(0, context.split('\n').length - body.split('\n').length),
        };
      } else {
        results[idx] = { content: body, sourceContent: body, prefixLineCount: 0 };
      }
    }
  }

  return results;
}

function validateVector(vector: number[], provider: EmbeddingProvider): void {
  if (vector.length !== provider.contract.dimension) {
    throw new EmbeddingResponseError(
      provider.name,
      provider.model,
      provider.contract.dimension,
      vector.length,
    );
  }
}

function buildCodePoint(
  chunk: RuntimeChunk,
  embedResult: EmbedderResult,
  provider: EmbeddingProvider,
  mavenModuleGraph?: ModuleGraph,
  callMeta?: Map<
    string,
    { defines?: string | undefined; calls?: string[] | undefined; calledBy?: string[] | undefined }
  >,
  repoId?: string,
): VectorPoint {
  validateVector(embedResult.semantic, provider);
  validateVector(embedResult.signature, provider);
  const sourceContent = chunk.sourceContent ?? chunk.content;
  const contentHash = createHash('sha256').update(sourceContent).digest('hex');
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
    packageName: inferPackageName(chunk.relativePath, sourceContent),
    layerHints: inferLayerHints(chunk.relativePath, chunk.chunkType, sourceContent),
    contentHash,
    indexedAt: new Date().toISOString(),
    ...(chunk.name != null ? { name: chunk.name } : {}),
    ...(chunk.parentName != null ? { parentName: chunk.parentName } : {}),
    ...(chunk.parentStartLine != null ? { parentStartLine: chunk.parentStartLine } : {}),
    ...(chunk.parentEndLine != null ? { parentEndLine: chunk.parentEndLine } : {}),
    ...(chunk.partIndex != null ? { partIndex: chunk.partIndex } : {}),
    ...(chunk.totalParts != null ? { totalParts: chunk.totalParts } : {}),
    ...(chunk.truncated != null ? { truncated: chunk.truncated } : {}),
    ...(chunk.superclass != null ? { superclass: chunk.superclass } : {}),
    ...(chunk.interfaces != null ? { interfaces: chunk.interfaces } : {}),
    ...(chunk.isInnerClass != null ? { isInnerClass: chunk.isInnerClass } : {}),
    ...(chunk.chunkIndex != null ? { chunkIndex: chunk.chunkIndex } : {}),
    ...(chunk.totalChunks != null ? { totalChunks: chunk.totalChunks } : {}),
    ...(chunk.docCommentStartLine != null
      ? { docCommentStartLine: chunk.docCommentStartLine }
      : {}),
    ...(chunk.annotationStartLine != null
      ? { annotationStartLine: chunk.annotationStartLine }
      : {}),
    ...(repoId ? { repoId } : {}),
    ...(chunk.signatureOnly ? { signatureOnly: true } : {}),
    tokenizerVersion: provider.contract.tokenizerVersion,
    ...(chunk.stereotype != null ? { stereotype: chunk.stereotype } : {}),
    ...(chunk.archLayer != null ? { archLayer: chunk.archLayer } : {}),
    ...(chunk.annotations != null ? { annotations: chunk.annotations } : {}),
    ...(chunk.visibility != null ? { visibility: chunk.visibility } : {}),
    ...(chunk.contextHeader != null ? { contextHeader: chunk.contextHeader } : {}),
    ...(chunk.classSignature != null ? { classSignature: chunk.classSignature } : {}),
    ...(chunk.dependencyEdges != null ? { dependencyEdges: chunk.dependencyEdges } : {}),
    ...(chunk.moduleInfo != null ? { moduleInfo: chunk.moduleInfo } : {}),
    ...(chunk.annotationMeta != null ? { annotationMeta: chunk.annotationMeta } : {}),
    ...(chunk.description != null ? { description: chunk.description } : {}),
    ...(chunk.businessContext != null ? { businessContext: chunk.businessContext } : {}),
    ...(chunk.semanticTags != null ? { semanticTags: chunk.semanticTags } : {}),
    ...(chunk.relationships != null ? { relationships: chunk.relationships } : {}),
    ...(chunk.enrichedAt != null ? { enrichedAt: chunk.enrichedAt } : {}),
    ...(chunk.enrichmentModel != null ? { enrichmentModel: chunk.enrichmentModel } : {}),
  };

  if (callMeta) {
    const meta = callMeta.get(chunk.id);
    if (meta) {
      if (meta.defines) payload.defines = [meta.defines];
      payload.calls = meta.calls;
      payload.calledBy = meta.calledBy;
    }
  }

  if (mavenModuleGraph) {
    const mavenMod = inferMavenModule(chunk.relativePath, mavenModuleGraph);
    if (mavenMod) payload.mavenModule = mavenMod;
  }

  return {
    id: chunk.id,
    semantic: embedResult.semantic,
    signature: embedResult.signature,
    sparse: embedResult.sparse,
    payload,
  };
}

/**
 * Embed one batch with per-input retry isolation and immediately upsert the
 * successful points. Payloads remain lean and are never built for failures.
 */
async function embedBatchAndStore(
  batch: RuntimeChunk[],
  provider: EmbeddingProvider,
  vectorStore: VectorStore,
  maxRetries = 1,
  mavenModuleGraph?: ModuleGraph,
  callMeta?: Map<
    string,
    { defines?: string | undefined; calls?: string[] | undefined; calledBy?: string[] | undefined }
  >,
  repoId?: string,
  signal?: AbortSignal,
): Promise<BatchStoreResult> {
  const embedder = new ThreeVectorEmbedder(provider);
  let pending = [...batch];
  const embedded: Array<{ chunk: RuntimeChunk; result: EmbedderResult; position: number }> = [];
  const failures: BatchStoreResult['failures'] = [];

  for (let attempt = 0; attempt <= maxRetries && pending.length > 0; attempt++) {
    if (signal?.aborted) {
      return cancelledBatchResult(batch, failures, embedded);
    }

    try {
      const chunksWithContent = pending.map((chunk) => ({
        ...chunk,
        content: chunk.embeddingContent ?? chunk.content,
      }));
      const outcome = await embedder.embedBatchWithFailures(chunksWithContent, signal);
      const failureByIndex = new Map(outcome.failures.map((failure) => [failure.index, failure]));
      const nextPending: RuntimeChunk[] = [];

      for (let index = 0; index < pending.length; index++) {
        const chunk = pending[index]!;
        const failure = failureByIndex.get(index);
        const result = outcome.results[index];
        if (!failure && result) {
          embedded.push({ chunk, result, position: batch.indexOf(chunk) });
          continue;
        }

        const reason = failure?.reason ?? 'embedding provider returned no vector';
        const retryable = failure?.retryable ?? embedderFailureIsRetryable(reason);
        if (retryable && attempt < maxRetries) {
          nextPending.push(chunk);
        } else {
          failures.push({ chunk, reason, retryable });
        }
      }

      pending = nextPending;
      if (pending.length > 0) {
        logger.warn(
          { attempt, batchSize: pending.length },
          'Embedding inputs failed — retrying retryable inputs',
        );
        await new Promise((resolve) => setTimeout(resolve, EMBEDDING_RETRY_DELAY_MS));
      }
    } catch (err) {
      // Context-length overflow is deterministic: retrying the same batch fails
      // identically. Split it and recurse so one oversized chunk cannot discard
      // its ≤50 batch-mates. At size 1, fail only that chunk.
      if (isContextLengthError(err) && pending.length > 1) {
        const mid = Math.ceil(pending.length / 2);
        const left = pending.slice(0, mid);
        const right = pending.slice(mid);
        logger.warn(
          { batchSize: pending.length, left: left.length, right: right.length },
          'Embedding batch exceeded context — splitting',
        );
        const halves = await Promise.all([
          embedBatchAndStore(
            left,
            provider,
            vectorStore,
            maxRetries,
            mavenModuleGraph,
            callMeta,
            repoId,
            signal,
          ),
          embedBatchAndStore(
            right,
            provider,
            vectorStore,
            maxRetries,
            mavenModuleGraph,
            callMeta,
            repoId,
            signal,
          ),
        ]);
        pending = [];
        return {
          indexed: halves[0].indexed + halves[1].indexed,
          skipped: halves[0].skipped + halves[1].skipped,
          failures: [...failures, ...halves[0].failures, ...halves[1].failures],
        };
      }

      const retryable = isRetryableEmbeddingError(err);
      if (retryable && attempt < maxRetries) {
        logger.warn({ attempt, err }, 'Embedding batch failed — retrying');
        await new Promise((resolve) => setTimeout(resolve, EMBEDDING_RETRY_DELAY_MS));
      } else {
        if (isContextLengthError(err)) {
          logger.warn(
            { chunkId: pending[0]?.id },
            'Single chunk exceeded embedding context — skipping it',
          );
        }
        failures.push(
          ...pending.map((chunk) => ({
            chunk,
            reason: err instanceof Error ? err.message : String(err),
            retryable,
          })),
        );
        pending = [];
      }
    }
  }

  if (signal?.aborted) {
    return cancelledBatchResult(batch, failures, embedded);
  }

  const points: VectorPoint[] = [];
  const orderedEmbedded = [...embedded].sort((left, right) => left.position - right.position);
  for (const { chunk, result } of orderedEmbedded) {
    try {
      points.push(buildCodePoint(chunk, result, provider, mavenModuleGraph, callMeta, repoId));
    } catch (error) {
      failures.push({
        chunk,
        reason: error instanceof Error ? error.message : String(error),
        retryable: false,
      });
    }
  }

  if (signal?.aborted) {
    return cancelledBatchResult(batch, failures, orderedEmbedded);
  }

  if (points.length > 0) {
    try {
      await vectorStore.upsertBatch(points);
    } catch (error) {
      return {
        indexed: 0,
        skipped: failures.length + points.length,
        failures: [
          ...failures,
          ...points.map((point, index) => ({
            chunk: orderedEmbedded[index]!.chunk,
            reason: `vector store upsert failed: ${error instanceof Error ? error.message : String(error)}`,
            retryable: false,
          })),
        ],
      };
    }
  }
  return { indexed: points.length, skipped: failures.length, failures };
}

export class IndexingPipeline {
  async run(
    config: IndexingConfig,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<IndexRunSummary> {
    if (signal?.aborted) {
      throw new Error('Indexing cancelled');
    }

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

    // Initialize vector store collection.
    // The embedding contract is a per-collection invariant (EMB-08, D-6): every repo
    // sharing this collection must share one contract. indexGeneration combines the
    // contract fingerprint with this run's timestamp so a re-index invalidates any
    // response cache keyed on it (BUD-14).
    const embeddingContract = embeddingProvider.contract;
    const indexGeneration = `${contractFingerprint(embeddingContract)}-${new Date().toISOString()}`;
    await vectorStore.initialize({
      textDimensions: embeddingProvider.dimensions,
      codeDimensions: embeddingProvider.dimensions,
      embeddingContract,
      indexGeneration,
      ...(config.force ? { force: true } : {}),
    });

    // Initialize dependency graph if configured
    if (dependencyGraph) {
      dependencyGraph.initialize();
    }

    // Determine which files to process
    let filesToProcess: string[];
    let runMode: IndexRunMetrics['mode'] = 'full';
    let filesChanged = 0;
    let chunksDeleted = 0;
    const failedFiles: FailedFile[] = [];
    const failedFilePaths = new Set<string>();
    const failedChanges: ChangeFailure[] = [];
    const recordFailedFile = (relativePath: string, reason: string): void => {
      if (failedFilePaths.has(relativePath)) return;
      failedFilePaths.add(relativePath);
      failedFiles.push({ relativePath, reason });
    };

    onProgress?.({
      stage: 'walking',
      filesTotal: 0,
      filesProcessed: 0,
      chunksTotal: 0,
      chunksIndexed: 0,
    });

    if (incremental) {
      const lastCommit = await getLastIndexedCommit(frameworkDir, collectionName, repoId);

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
        runMode = 'incremental';
        const changed = await getChangedFiles(targetProjectPath, lastCommit);
        const { toProcess, toDelete } = changed;
        failedChanges.push(...(changed.failures ?? []));
        filesChanged = new Set(
          [...toDelete, ...toProcess].map((filePath) => relative(targetProjectPath, filePath)),
        ).size;

        // A file and all of its split parent/child chunks form one invalidation family.
        const filesToInvalidate = [...new Set([...toDelete, ...toProcess])];
        for (const filePath of filesToInvalidate) {
          const must: Array<Record<string, unknown>> = [
            { key: 'relativePath', match: { value: relative(targetProjectPath, filePath) } },
          ];
          if (repoId) {
            must.push({ key: 'repoId', match: { value: repoId } });
          }
          chunksDeleted += await vectorStore.deleteByFilter({ must });
          if (dependencyGraph) {
            dependencyGraph.deleteEdgesForFile(filePath);
          }
        }
        // Only parse files that still exist on disk (excludes deleted files)
        filesToProcess = toProcess;
      } else {
        // No prior state — full index
        filesToProcess = await walkFiles({
          projectPath: targetProjectPath,
          includePatterns,
          excludePatterns,
        });
        filesChanged = filesToProcess.length;
      }
    } else {
      filesToProcess = await walkFiles({
        projectPath: targetProjectPath,
        includePatterns,
        excludePatterns,
      });
      filesChanged = filesToProcess.length;
    }
    if (runMode === 'full') filesChanged = filesToProcess.length;

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
        recordFailedFile(
          relative(targetProjectPath, filePath),
          err instanceof Error ? err.message : String(err),
        );
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

      // Release the generation model so it does not hold a 30-minute lease while
      // the embedding phase (which runs next) needs GPU/RAM. Best-effort; guarded
      // so a mocked/older enricher without releaseModel does not break the run.
      await enricher.releaseModel?.();
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
    const skipped: SkippedChunk[] = [];
    const signatureOnly: SignatureOnlyChunk[] = [];
    const recordSkip = (chunk: ChunkIdentitySource, reason: string): void => {
      skipped.push({ ...toChunkIdentity(chunk, repoId), reason });
      recordFailedFile(chunk.relativePath, reason);
    };
    const recordSignatureOnly = (chunk: ChunkIdentitySource): void => {
      signatureOnly.push(toChunkIdentity(chunk, repoId));
    };

    const capabilities = providerCapabilities(embeddingProvider, embeddingBatchSize);
    const documentPrefix = embeddingProvider.contract.prefixes?.document ?? '';
    const prepared = await prepareEmbeddingChunks(
      processedChunks,
      capabilities,
      maxChunkLines,
      repoId,
      documentPrefix,
    );
    for (const failure of prepared.failures) {
      recordSkip(failure.chunk, failure.reason);
      logger.warn(
        {
          error: failure.reason,
          chunkId: failure.chunk.id,
          relativePath: failure.chunk.relativePath,
        },
        'Embedding input skipped before batching',
      );
    }

    const preparedById = new Map(prepared.chunks.map((chunk) => [chunk.id, chunk]));
    const packed = packBatches(
      prepared.chunks.map(
        (chunk): SizedInput =>
          sizedInputFromChannels(chunk.id, preparedChunkBudgetChannels(chunk, documentPrefix)),
      ),
      capabilities,
    );
    const batches: RuntimeChunk[][] = packed.batches.map((batch) =>
      batch.map((input) => preparedById.get(input.id)!).filter(Boolean),
    );

    for (const oversized of packed.oversized) {
      const chunk = preparedById.get(oversized.id);
      if (chunk) recordSkip(chunk, 'input remained oversized after handling');
      logger.warn(
        { chunkId: chunk?.id ?? oversized.id, error: 'input remained oversized after handling' },
        'Embedding input skipped before provider request',
      );
    }

    progress.batchesTotal = batches.length;
    progress.batchesCompleted = 0;
    onProgress?.({ ...progress });

    await Promise.all(
      batches.map((batch) =>
        queue.add(async () => {
          if (signal?.aborted) {
            for (const chunk of batch) recordSkip(chunk, 'indexing cancelled before embedding');
            progress.batchesCompleted = (progress.batchesCompleted ?? 0) + 1;
            progress.chunksIndexed = chunksIndexed;
            onProgress?.({ ...progress });
            return;
          }

          try {
            const result = await embedBatchAndStore(
              batch,
              embeddingProvider,
              vectorStore,
              1,
              config.mavenModuleGraph,
              chunkCallMeta,
              repoId,
              signal,
            );
            chunksIndexed += result.indexed;
            for (const failure of result.failures) recordSkip(failure.chunk, failure.reason);
            const failedChunkIds = new Set(result.failures.map((failure) => failure.chunk.id));
            for (const chunk of batch) {
              if (chunk.signatureOnly && !failedChunkIds.has(chunk.id)) {
                recordSignatureOnly(chunk);
              }
            }
            for (const failure of result.failures) {
              logger.warn(
                {
                  batchSize: batch.length,
                  chunkId: failure.chunk.id,
                  relativePath: failure.chunk.relativePath,
                  error: failure.reason,
                  retryable: failure.retryable,
                },
                'Embedding input skipped',
              );
            }
          } catch (err) {
            for (const chunk of batch) {
              recordSkip(chunk, err instanceof Error ? err.message : String(err));
            }
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
        let sourceChunks: ChunkMetadata[] = [];
        try {
          sourceChunks = await source.getChunks();
          logger.info(
            { source: source.name, count: sourceChunks.length },
            'Got chunks from context source',
          );

          progress.chunksTotal += sourceChunks.length;

          // Embed source chunks in batches and upsert immediately using ThreeVectorEmbedder
          const srcEmbedder = new ThreeVectorEmbedder(embeddingProvider);
          const sourcePacked = packBatches(
            sourceChunks.map((chunk) =>
              sizedInputFromChannels(
                chunk.id,
                preparedChunkBudgetChannels(chunk as RuntimeChunk, documentPrefix),
              ),
            ),
            capabilities,
          );
          const sourceById = new Map(sourceChunks.map((chunk) => [chunk.id, chunk]));
          for (const oversized of sourcePacked.oversized) {
            const chunk = sourceById.get(oversized.id);
            if (chunk) recordSkip(chunk, 'input remained oversized after handling');
            logger.warn(
              { source: source.name, chunkId: oversized.id },
              'Context source chunk skipped before provider request',
            );
          }

          for (const packedBatch of sourcePacked.batches) {
            const batch = packedBatch.map((input) => sourceById.get(input.id)!).filter(Boolean);

            // Context source chunks have content populated — cast to CodeChunk for embedder
            let embedOutcome: Awaited<ReturnType<typeof srcEmbedder.embedBatchWithFailures>>;
            try {
              embedOutcome = await srcEmbedder.embedBatchWithFailures(
                batch as unknown as CodeChunk[],
                signal,
              );
            } catch (error) {
              for (const chunk of batch) {
                recordSkip(chunk, error instanceof Error ? error.message : String(error));
              }
              logger.error(
                { source: source.name, batchSize: batch.length, error },
                'Context source embedding batch skipped',
              );
              continue;
            }

            const points: VectorPoint[] = [];
            for (let j = 0; j < batch.length; j++) {
              const chunk = batch[j]!;
              const failure = embedOutcome.failures.find((item) => item.index === j);
              const embedResult = embedOutcome.results[j];
              if (failure || !embedResult) {
                recordSkip(chunk, failure?.reason ?? 'embedding provider returned no vector');
                logger.error(
                  {
                    source: source.name,
                    chunkId: chunk.id,
                    error: failure?.reason ?? 'embedding provider returned no vector',
                  },
                  'Context source input skipped',
                );
                continue;
              }
              try {
                validateVector(embedResult.semantic, embeddingProvider);
                validateVector(embedResult.signature, embeddingProvider);
              } catch (error) {
                recordSkip(chunk, error instanceof Error ? error.message : String(error));
                logger.error(
                  { source: source.name, chunkId: chunk.id, error },
                  'Context source input failed vector validation',
                );
                continue;
              }
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
            if (signal?.aborted) {
              for (const chunk of batch) recordSkip(chunk, 'indexing cancelled before upsert');
              logger.warn(
                { source: source.name, batchSize: points.length },
                'Context source batch cancelled before upsert',
              );
              continue;
            }
            try {
              await vectorStore.upsertBatch(points);
              chunksIndexed += points.length;
            } catch (error) {
              for (const point of points) {
                const chunk = batch.find((candidate) => candidate.id === point.id);
                if (chunk) {
                  recordSkip(
                    chunk,
                    `vector store upsert failed: ${error instanceof Error ? error.message : String(error)}`,
                  );
                }
              }
              logger.error(
                { source: source.name, batchSize: points.length, error },
                'Context source batch upsert failed',
              );
            }
            progress.chunksIndexed = chunksIndexed;
            onProgress?.({ ...progress });
          }
        } catch (err) {
          if (sourceChunks.length === 0) {
            recordSkip(
              {
                relativePath: `__context_source__/${source.name}`,
                name: source.name,
                startLine: 0,
                endLine: 0,
              },
              err instanceof Error ? err.message : String(err),
            );
          } else {
            for (const chunk of sourceChunks) {
              recordSkip(chunk, err instanceof Error ? err.message : String(err));
            }
          }
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
      const conceptPrepared = conceptChunks.map((entry) => entry.chunk as RuntimeChunk);
      const conceptPacked = packBatches(
        conceptPrepared.map((chunk) =>
          sizedInputFromChannels(chunk.id, preparedChunkBudgetChannels(chunk, documentPrefix)),
        ),
        capabilities,
      );
      const conceptById = new Map(conceptPrepared.map((chunk) => [chunk.id, chunk]));
      for (const oversized of conceptPacked.oversized) {
        const chunk = conceptById.get(oversized.id);
        if (chunk) recordSkip(chunk, 'input remained oversized after handling');
      }
      for (const packedBatch of conceptPacked.batches) {
        const batchChunks = packedBatch.map((input) => conceptById.get(input.id)!).filter(Boolean);
        let outcome: Awaited<ReturnType<typeof conceptEmbedder.embedBatchWithFailures>>;
        try {
          outcome = await conceptEmbedder.embedBatchWithFailures(batchChunks, signal);
        } catch (error) {
          for (const chunk of batchChunks) {
            recordSkip(chunk, error instanceof Error ? error.message : String(error));
          }
          logger.error({ batchSize: batchChunks.length, error }, 'Concept embedding batch skipped');
          continue;
        }
        const conceptPoints: VectorPoint[] = [];
        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j]!;
          const embedResult = outcome.results[j];
          if (!embedResult || outcome.failures.some((failure) => failure.index === j)) {
            const failure = outcome.failures.find((item) => item.index === j);
            recordSkip(chunk, failure?.reason ?? 'embedding provider returned no vector');
            continue;
          }
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
        if (signal?.aborted) {
          for (const chunk of batchChunks) recordSkip(chunk, 'indexing cancelled before upsert');
          logger.warn({ batchSize: conceptPoints.length }, 'Concept batch cancelled before upsert');
          continue;
        }
        for (const point of conceptPoints) {
          validateVector(point.semantic, embeddingProvider);
          validateVector(point.signature, embeddingProvider);
        }
        try {
          await vectorStore.upsertBatch(conceptPoints);
          chunksIndexed += conceptPoints.length;
        } catch (error) {
          for (const point of conceptPoints) {
            const chunk = batchChunks.find((candidate) => candidate.id === point.id);
            if (chunk) {
              recordSkip(
                chunk,
                `vector store upsert failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
          logger.error({ batchSize: conceptPoints.length, error }, 'Concept batch upsert failed');
        }
      }
    }

    // Save incremental state — but ONLY if nothing was skipped and the run was
    // not cancelled. Advancing lastIndexedCommit after skips would make the next
    // incremental run diff past the failed files, permanently dropping them from
    // the collection (they are not in the commit diff). A full re-index recovers.
    const currentCommit = await getCurrentCommit(targetProjectPath);
    if (
      currentCommit &&
      skipped.length === 0 &&
      failedFiles.length === 0 &&
      failedChanges.length === 0 &&
      !signal?.aborted
    ) {
      await saveLastIndexedCommit(
        frameworkDir,
        currentCommit,
        collectionName,
        undefined,
        undefined,
        repoId,
      );
    } else if (
      currentCommit &&
      (skipped.length > 0 || failedFiles.length > 0 || failedChanges.length > 0 || signal?.aborted)
    ) {
      logger.warn(
        {
          skipped: skipped.length,
          failedFiles: failedFiles.length,
          failedChanges: failedChanges.length,
          aborted: Boolean(signal?.aborted),
        },
        'Not advancing lastIndexedCommit: indexing failed or was cancelled — next index will reprocess this scope',
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

    const metrics: IndexRunMetrics = {
      mode: runMode,
      filesChanged,
      chunksDeleted,
      chunksReindexed: chunksIndexed,
      chunksAffected: chunksDeleted + chunksIndexed,
      failedFiles,
      failedChanges,
    };

    return {
      filesIndexed: progress.filesProcessed,
      chunksIndexed,
      skippedChunks: skipped.length,
      skipped,
      signatureOnlyCount: signatureOnly.length,
      signatureOnly,
      failedFiles,
      failedChanges,
      metrics,
    };
  }
}
