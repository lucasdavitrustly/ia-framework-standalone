import type { CodeChunk } from '@ia-framework/ast-parser';
import {
  buildSparseVector as buildCanonicalSparseVector,
  EmbeddingResponseError,
} from '@ia-framework/core';
import type { EmbeddingProvider, InputFailure } from '@ia-framework/embedding';
import PQueue from 'p-queue';

/** Max simultaneous per-item embed() calls during response-shape fan-out. */
export const FANOUT_CONCURRENCY = 4;

/**
 * T029: 3-vector embedder
 *
 * Produces three vectors per code chunk for Qdrant storage:
 *
 *   semantic   → embedded from: description + businessContext + semanticTags.join(' ')
 *                Fallback when no LLM enrichment: uses chunk content
 *
 *   signature  → embedded from: signature + contextHeader
 *                Fallback: chunk name + chunkType
 *
 *   sparse     → tokenized from: name + defines + imports + annotations
 *                Tokenization splits on camelCase, dots, and underscores
 *                Uses term-frequency weighting (IDF approximation via hash bucketing)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SparseVector = ReturnType<typeof buildCanonicalSparseVector>;

export interface EmbedderResult {
  /** Dense vector for semantic search (description + context) */
  semantic: number[];
  /** Dense vector for signature/structural search */
  signature: number[];
  /** Sparse vector for keyword/BM25-style search */
  sparse: SparseVector;
}

// Extended CodeChunk with enrichment fields (added by LlmEnricher)
export type EnrichedCodeChunk = CodeChunk & {
  description?: string | undefined;
  businessContext?: string | undefined;
  semanticTags?: string[] | undefined;
  signature?: string | undefined;
  signatureOnly?: boolean | undefined;
};

export interface EmbedderBatchOutcome {
  readonly results: (EmbedderResult | null)[];
  readonly failures: InputFailure[];
}

export function embeddingFailureFromError(error: unknown, index: number): InputFailure {  const reason = error instanceof Error ? error.message : String(error);
  let retryable = true;

  if (error instanceof EmbeddingResponseError) {
    retryable = false;
  } else if (typeof error === 'object' && error !== null && 'retryable' in error) {
    retryable = Boolean((error as { retryable?: unknown }).retryable);
  } else if (/(?:runner-failure|llama-server process no longer running|llama runner process no longer running)/i.test(reason)) {
    retryable = true;
  } else if (
    /\b(?:400|401|403|404)\b|malformed|dimension|returned \d+ embeddings|context length|model not found/i.test(
      reason,
    )
  ) {
    retryable = false;
  }

  return { index, reason, retryable };
}

/**
 * Detect a context-length / oversized-input embedding error. Such errors are
 * deterministic for a given input, so the pipeline splits the batch rather than
 * retrying the identical request.
 */
export function isContextLengthError(error: unknown): boolean {
  const reason = error instanceof Error ? error.message : String(error);
  return /context[- ]?length|context window|exceeds context|input too large|too large|context-length/i.test(
    reason,
  );
}

// ── ThreeVectorEmbedder class ─────────────────────────────────────────────────

export class ThreeVectorEmbedder {
  constructor(private readonly provider: Pick<EmbeddingProvider, 'embed' | 'embedBatch'>) {}

  /**
   * Produce semantic, signature, and sparse vectors for a single enriched chunk.
   */
  async embed(chunk: EnrichedCodeChunk): Promise<EmbedderResult> {
    const [semantic, signature] = await Promise.all([
      this.provider.embed(buildSemanticInput(chunk), 'document'),
      this.provider.embed(buildSignatureInput(chunk), 'document'),
    ]);

    const sparse = buildCanonicalSparseVector([
      chunk.name,
      chunk.defines,
      chunk.imports,
      chunk.annotations,
    ]);

    return { semantic, signature, sparse };
  }

  /**
   * Produce vectors for a batch of enriched chunks.
   * Batches the embedding calls for efficiency.
   */
  async embedBatch(chunks: EnrichedCodeChunk[]): Promise<EmbedderResult[]> {
    const outcome = await this.embedBatchWithFailures(chunks);
    if (outcome.failures.length > 0) {
      throw new Error(outcome.failures.map((failure) => `[${failure.index}] ${failure.reason}`).join('; '));
    }

    return outcome.results.map((result, index) => {
      if (!result) {
        throw new Error(`short provider response: missing embedding vector for input ${index}`);
      }
      return result;
    });
  }

  /**
   * Produce all vectors while retaining provider failures by chunk position.
   * The pipeline uses this form to store successful siblings independently.
   */
  async embedBatchWithFailures(
    chunks: EnrichedCodeChunk[],
    signal?: AbortSignal,
  ): Promise<EmbedderBatchOutcome> {
    if (chunks.length === 0) return { results: [], failures: [] };

    const semanticInputs = chunks.map(buildSemanticInput);
    const signatureInputs = chunks.map(buildSignatureInput);

    const [semanticOutcome, signatureOutcome] = await Promise.all([
      this.embedChannelWithFailures(semanticInputs, signal),
      this.embedChannelWithFailures(signatureInputs, signal),
    ]);

    const failures = new Map<number, InputFailure>();
    const addFailure = (failure: InputFailure): void => {
      const previous = failures.get(failure.index);
      if (!previous || (!failure.retryable && previous.retryable)) {
        failures.set(failure.index, failure);
      }
    };

    for (const failure of [...semanticOutcome.failures, ...signatureOutcome.failures]) {
      addFailure(failure);
    }

    const results = chunks.map((chunk, index) => {
      const semantic = semanticOutcome.vectors[index];
      const signature = signatureOutcome.vectors[index];
      if (!semantic || !signature) {
        if (!failures.has(index)) {
          addFailure({
            index,
            reason: 'short provider response: missing semantic or signature vector',
            retryable: false,
          });
        }
        return null;
      }

      return {
        semantic,
        signature,
        sparse: buildCanonicalSparseVector([
          chunk.name,
          chunk.defines,
          chunk.imports,
          chunk.annotations,
        ]),
      };
    });

    return { results, failures: [...failures.values()].sort((a, b) => a.index - b.index) };
  }

  private async embedChannelWithFailures(
    inputs: string[],
    signal?: AbortSignal,
  ): Promise<{
    vectors: (number[] | null)[];
    failures: InputFailure[];
  }> {
    try {
      return await this.provider.embedBatch(inputs, 'document', signal);
    } catch (error) {
      const failure = embeddingFailureFromError(error, 0);
      const responseShapeFailure =
        error instanceof EmbeddingResponseError ||
        /malformed|dimension|returned \d+ embeddings|empty vector|no embedding returned/i.test(
          failure.reason,
        );
      if (!responseShapeFailure) throw error;

      // Per-item fan-out to isolate the offending input. Bounded so a batch of
      // 50 does not open 50 simultaneous sockets (which, with the whole-run
      // concurrency, could exhaust connections and induce the very hangs the
      // request timeout guards against).
      const vectors = new Array<number[] | null>(inputs.length).fill(null);
      const failures: InputFailure[] = [];
      const queue = new PQueue({ concurrency: FANOUT_CONCURRENCY });
      await Promise.all(
        inputs.map((_input, index) =>
          queue.add(async () => {
            try {
              vectors[index] = await this.provider.embed(inputs[index]!, 'document', signal);
            } catch (error) {
              failures.push(embeddingFailureFromError(error, index));
            }
          }),
        ),
      );
      return {
        vectors,
        failures: failures.sort((left, right) => left.index - right.index),
      };
    }
  }

}

/**
 * Per-channel budget texts for one chunk, each including the document prefix so
 * the estimate matches what the provider actually sends. The embedder issues one
 * request per channel, so these are measured separately by the budgeter (see
 * sizedInputFromChannels) rather than concatenated.
 */
export function buildEmbeddingBudgetChannels(
  chunk: EnrichedCodeChunk,
  documentPrefix = '',
): string[] {
  return [
    `${documentPrefix}${buildSemanticInput(chunk)}`,
    `${documentPrefix}${buildSignatureInput(chunk)}`,
  ];
}

/**
 * @deprecated Concatenates both channels, which double-counts tokens and causes
 * false-positive oversized rejections. Use buildEmbeddingBudgetChannels with
 * sizedInputFromChannels. Retained for callers not yet migrated.
 */
export function buildEmbeddingBudgetInput(
  chunk: EnrichedCodeChunk,
  documentPrefix = '',
): string {
  return `${documentPrefix}${buildSemanticInput(chunk)}\n${documentPrefix}${buildSignatureInput(chunk)}`;
}

// ── Input builders ────────────────────────────────────────────────────────────

/**
 * Build a descriptive string from annotationMeta for semantic enrichment.
 * Returns empty string if no annotationMeta is present.
 */
function buildAnnotationMetaText(chunk: EnrichedCodeChunk): string {
  const meta = (
    chunk as EnrichedCodeChunk & {
      annotationMeta?: {
        operationSummaries?: string[];
        endpointPaths?: string[];
        httpMethods?: string[];
        tagName?: string;
      };
    }
  ).annotationMeta;
  if (!meta) return '';

  const parts: string[] = [];

  if (meta.tagName) {
    parts.push(`API tag: ${meta.tagName}`);
  }
  if (meta.endpointPaths && meta.endpointPaths.length > 0) {
    parts.push(`endpoints: ${meta.endpointPaths.join(' ')}`);
  }
  if (meta.httpMethods && meta.httpMethods.length > 0) {
    parts.push(`HTTP methods: ${meta.httpMethods.join(' ')}`);
  }
  if (meta.operationSummaries && meta.operationSummaries.length > 0) {
    parts.push(`operations: ${meta.operationSummaries.join('; ')}`);
  }

  return parts.join(' | ');
}

/**
 * Build the semantic embedding input for a chunk.
 * Primary: description + businessContext + semanticTags [+ annotationMeta supplement (T120)]
 * Fallback: annotationMeta synthesis (T119) → raw chunk content
 */
function buildSemanticInput(chunk: EnrichedCodeChunk): string {
  if (chunk.signatureOnly) return chunk.content;

  const parts: string[] = [];

  if (chunk.description) parts.push(chunk.description);
  if (chunk.businessContext) parts.push(chunk.businessContext);
  if (chunk.semanticTags && chunk.semanticTags.length > 0) {
    parts.push(chunk.semanticTags.join(' '));
  }

  // T120: Supplementary mode — append annotationMeta even when LLM enrichment is present
  const metaText = buildAnnotationMetaText(chunk);

  if (parts.length > 0) {
    if (metaText) parts.push(metaText);
    return parts.join(' ');
  }

  // T119: Heuristic fallback — use annotationMeta to build rich embedding input
  if (metaText) {
    return `${chunk.language} ${chunk.chunkType} ${chunk.name ?? ''} ${metaText}`.trim();
  }

  // Final fallback: language-aware description (includes language and chunkType for search relevance)
  const rawContent = chunk.content ?? '';
  return `${chunk.language} ${chunk.chunkType} ${chunk.name ?? ''} ${rawContent}`.trim();
}

/**
 * Build the signature embedding input for a chunk.
 * Primary: signature + contextHeader
 * Fallback: name + chunkType
 */
function buildSignatureInput(chunk: EnrichedCodeChunk): string {
  if (chunk.signatureOnly) return chunk.content;

  const parts: string[] = [];

  if (chunk.signature) parts.push(chunk.signature);
  if (chunk.contextHeader) parts.push(chunk.contextHeader);

  if (parts.length > 0) return parts.join('\n');

  // Fallback: name + type
  return `${chunk.name ?? chunk.chunkType} ${chunk.chunkType}`.trim();
}
