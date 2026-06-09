import type { CodeChunk } from '@ia-framework/ast-parser';

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

export interface SparseVector {
  /** Hash-bucketed token positions (stable within a run) */
  indices: number[];
  /** Term frequency counts corresponding to each index */
  values: number[];
}

export interface EmbedderResult {
  /** Dense vector for semantic search (description + context) */
  semantic: number[];
  /** Dense vector for signature/structural search */
  signature: number[];
  /** Sparse vector for keyword/BM25-style search */
  sparse: SparseVector;
}

/** Minimal embedding provider interface (subset of EmbeddingProvider) */
interface EmbeddingProvider {
  embed(text: string, type?: string): Promise<number[]>;
  embedBatch(texts: string[], type?: string): Promise<number[][]>;
}

// Extended CodeChunk with enrichment fields (added by LlmEnricher)
type EnrichedCodeChunk = CodeChunk & {
  description?: string | undefined;
  businessContext?: string | undefined;
  semanticTags?: string[] | undefined;
  signature?: string | undefined;
};

// ── Sparse vector helpers ─────────────────────────────────────────────────────

/** Number of hash buckets for sparse vector indices */
const SPARSE_BUCKET_SIZE = 65536;

/**
 * Tokenize a string by camelCase, dots, underscores, and spaces.
 * "processPayment" → ["process", "Payment", "payment"]
 * "com.example.foo" → ["com", "example", "foo"]
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  // Split on non-alphanumeric characters
  const byNonAlpha = text.split(/[^a-zA-Z0-9]+/).filter((t) => t.length > 0);
  // Further split camelCase: "processPayment" → ["process", "Payment"]
  const tokens: string[] = [];
  for (const word of byNonAlpha) {
    const camelParts = word.split(/(?=[A-Z])/).filter((t) => t.length > 0);
    tokens.push(...camelParts);
  }
  // Lowercase all tokens and deduplicate
  return [...new Set(tokens.map((t) => t.toLowerCase()))].filter((t) => t.length > 1);
}

/**
 * Hash a token string to a stable bucket index in [0, SPARSE_BUCKET_SIZE).
 * Uses djb2-inspired 32-bit hash.
 */
function hashToken(token: string): number {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) >>> 0;
  }
  return hash % SPARSE_BUCKET_SIZE;
}

/**
 * Build a sparse vector from a collection of token sources.
 * Counts term frequencies and maps to hash bucket indices.
 */
function buildSparseVector(sources: (string | string[] | undefined)[]): SparseVector {
  const termFreq = new Map<number, number>();

  for (const source of sources) {
    if (!source) continue;
    const texts = Array.isArray(source) ? source : [source];
    for (const text of texts) {
      for (const token of tokenize(text)) {
        const idx = hashToken(token);
        termFreq.set(idx, (termFreq.get(idx) ?? 0) + 1);
      }
    }
  }

  // Sort by index for deterministic output
  const sorted = [...termFreq.entries()].sort(([a], [b]) => a - b);
  return {
    indices: sorted.map(([idx]) => idx),
    values: sorted.map(([, freq]) => freq),
  };
}

// ── ThreeVectorEmbedder class ─────────────────────────────────────────────────

export class ThreeVectorEmbedder {
  constructor(private readonly provider: EmbeddingProvider) {}

  /**
   * Produce semantic, signature, and sparse vectors for a single enriched chunk.
   */
  async embed(chunk: EnrichedCodeChunk): Promise<EmbedderResult> {
    const [semantic, signature] = await Promise.all([
      this.provider.embed(buildSemanticInput(chunk), 'document'),
      this.provider.embed(buildSignatureInput(chunk), 'document'),
    ]);

    const sparse = buildSparseVector([chunk.name, chunk.defines, chunk.imports, chunk.annotations]);

    return { semantic, signature, sparse };
  }

  /**
   * Produce vectors for a batch of enriched chunks.
   * Batches the embedding calls for efficiency.
   */
  async embedBatch(chunks: EnrichedCodeChunk[]): Promise<EmbedderResult[]> {
    if (chunks.length === 0) return [];

    const semanticInputs = chunks.map(buildSemanticInput);
    const signatureInputs = chunks.map(buildSignatureInput);

    const [semanticVectors, signatureVectors] = await Promise.all([
      this.provider.embedBatch(semanticInputs, 'document'),
      this.provider.embedBatch(signatureInputs, 'document'),
    ]);

    return chunks.map((chunk, i) => ({
      semantic: semanticVectors[i] ?? [],
      signature: signatureVectors[i] ?? [],
      sparse: buildSparseVector([chunk.name, chunk.defines, chunk.imports, chunk.annotations]),
    }));
  }
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
  const parts: string[] = [];

  if (chunk.signature) parts.push(chunk.signature);
  if (chunk.contextHeader) parts.push(chunk.contextHeader);

  if (parts.length > 0) return parts.join('\n');

  // Fallback: name + type
  return `${chunk.name ?? chunk.chunkType} ${chunk.chunkType}`.trim();
}
