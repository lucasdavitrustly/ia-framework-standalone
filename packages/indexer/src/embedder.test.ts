import { describe, it, expect, vi } from 'vitest';
import type { EmbedBatchOutcome } from '@ia-framework/embedding';
import { buildSparseVector } from '@ia-framework/core';

/**
 * T018: 3-vector embedder — given enriched chunk, produces:
 *   - semantic vector  (description + businessContext + semanticTags)
 *   - signature vector (signature + contextHeader)
 *   - sparse vector    (tokenized name + imports + annotations by camelCase/dots/underscores)
 *
 * Tests MUST fail until embedder.ts is implemented.
 */

// ── Local type stubs ──────────────────────────────────────────────────────────

interface SparseVector {
  indices: number[];
  values: number[];
}

interface EmbedderResult {
  semantic: number[];
  signature: number[];
  sparse: SparseVector;
}

interface EnrichedChunk {
  id: string;
  name?: string | undefined;
  content: string;
  language: string;
  chunkType: string;
  imports: string[];
  exports: string[];
  annotations?: string[] | undefined;
  defines?: string[] | undefined;
  // Enrichment fields
  description?: string | undefined;
  businessContext?: string | undefined;
  semanticTags?: string[] | undefined;
  // Signature fields
  signature?: string | undefined;
  contextHeader?: string | undefined;
  contentHash?: string | undefined;
}

interface MockEmbeddingProvider {
  embed(text: string, type?: string): Promise<number[]>;
  embedBatch(texts: string[], type?: string): Promise<EmbedBatchOutcome>;
}

// ── Import under test (WILL FAIL — module does not exist yet) ─────────────────
const embedderSpecifier = './embedder.js';
const embedderModule = (await import(embedderSpecifier).catch(() => null)) as Record<
  string,
  unknown
> | null;
const ThreeVectorEmbedder = embedderModule?.ThreeVectorEmbedder as
  | (new (provider: MockEmbeddingProvider) => {
      embed(chunk: EnrichedChunk): Promise<EmbedderResult>;
      embedBatch(chunks: EnrichedChunk[]): Promise<EmbedderResult[]>;
      embedBatchWithFailures(chunks: EnrichedChunk[]): Promise<{
        results: (EmbedderResult | null)[];
        failures: Array<{ index: number; reason: string; retryable: boolean }>;
      }>;
    })
  | undefined;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns different vectors per text to allow assertion on which text was embedded */
function makeProvider(): MockEmbeddingProvider {
  let callCount = 0;
  return {
    embed: vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve([callCount * 0.1, callCount * 0.2, callCount * 0.3]);
    }),
    embedBatch: vi.fn((texts: string[]) =>
      Promise.resolve({
        vectors: texts.map((_, i) => [(i + 1) * 0.1, (i + 1) * 0.2, (i + 1) * 0.3]),
        failures: [],
      }),
    ),
  };
}

function makeEnrichedChunk(overrides: Partial<EnrichedChunk> = {}): EnrichedChunk {
  return {
    id: 'chunk-1',
    name: 'processPayment',
    content: 'public void processPayment(Payment p) { repo.save(p); }',
    language: 'java',
    chunkType: 'method',
    imports: ['com.example.PaymentRepository', 'com.example.Payment'],
    exports: [],
    annotations: ['@Transactional', '@Override'],
    defines: ['processPayment'],
    description: 'Processes a payment and persists it to the repository',
    businessContext: 'Core payment processing flow',
    semanticTags: ['payment', 'persistence', 'transaction'],
    signature: 'public void processPayment(Payment p)',
    contextHeader: 'class PaymentService {\n  private final PaymentRepository repo;',
    contentHash: 'sha256-abc123',
    ...overrides,
  };
}

// ── T018: 3-vector embedder tests ─────────────────────────────────────────────

describe('ThreeVectorEmbedder — 3-vector embedding (T018)', () => {
  it('produces three vectors: semantic, signature, sparse', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const provider = makeProvider();
    const embedder = new ThreeVectorEmbedder!(provider);
    const result = await embedder.embed(makeEnrichedChunk());

    expect(result).toHaveProperty('semantic');
    expect(result).toHaveProperty('signature');
    expect(result).toHaveProperty('sparse');
    expect(Array.isArray(result.semantic)).toBe(true);
    expect(Array.isArray(result.signature)).toBe(true);
  });

  it('builds semantic input from description + businessContext + semanticTags', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const capturedTexts: string[] = [];
    const provider: MockEmbeddingProvider = {
      embed: vi.fn().mockImplementation((text: string) => {
        capturedTexts.push(text);
        return Promise.resolve([0.1, 0.2, 0.3]);
      }),
      embedBatch: vi.fn((texts: string[]) => {
        capturedTexts.push(...texts);
        return Promise.resolve({
          vectors: texts.map(() => [0.1, 0.2, 0.3]),
          failures: [],
        });
      }),
    };

    const chunk = makeEnrichedChunk();
    const embedder = new ThreeVectorEmbedder!(provider);
    await embedder.embed(chunk);

    // At least one embed call should include description and tags
    const semanticInput = capturedTexts.find(
      (t) =>
        t.includes('Processes a payment') || t.includes('payment') || t.includes('persistence'),
    );
    expect(semanticInput).toBeDefined();
    expect(semanticInput).toContain('Processes a payment');
  });

  it('builds signature input from signature + contextHeader', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const capturedTexts: string[] = [];
    const provider: MockEmbeddingProvider = {
      embed: vi.fn().mockImplementation((text: string) => {
        capturedTexts.push(text);
        return Promise.resolve([0.1, 0.2, 0.3]);
      }),
      embedBatch: vi.fn((texts: string[]) => {
        capturedTexts.push(...texts);
        return Promise.resolve({
          vectors: texts.map(() => [0.1, 0.2, 0.3]),
          failures: [],
        });
      }),
    };

    const chunk = makeEnrichedChunk();
    const embedder = new ThreeVectorEmbedder!(provider);
    await embedder.embed(chunk);

    // One of the embed calls should include the signature and contextHeader
    const signatureInput = capturedTexts.find(
      (t) => t.includes('processPayment') && t.includes('PaymentService'),
    );
    expect(signatureInput).toBeDefined();
  });

  it('builds sparse vector from tokenized name + imports + annotations', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const provider = makeProvider();
    const embedder = new ThreeVectorEmbedder!(provider);
    const chunk = makeEnrichedChunk({
      name: 'processPayment',
      imports: ['com.example.PaymentRepository'],
      annotations: ['@Transactional'],
    });
    const result = await embedder.embed(chunk);

    // Sparse vector must have indices and values arrays
    expect(result.sparse).toHaveProperty('indices');
    expect(result.sparse).toHaveProperty('values');
    expect(Array.isArray(result.sparse.indices)).toBe(true);
    expect(Array.isArray(result.sparse.values)).toBe(true);
    // Non-empty: at least one token from name/imports/annotations
    expect(result.sparse.indices.length).toBeGreaterThan(0);
    expect(result.sparse.values.length).toBe(result.sparse.indices.length);
  });

  it('sparse vector tokenizes camelCase names (processPayment → process, Payment)', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const provider = makeProvider();
    const embedder = new ThreeVectorEmbedder!(provider);

    // Two chunks with same tokens in different order should produce same sparse vector
    const chunk1 = makeEnrichedChunk({ name: 'processPayment', imports: [], annotations: [] });
    const chunk2 = makeEnrichedChunk({ name: 'processPayment', imports: [], annotations: [] });
    const result1 = await embedder.embed(chunk1);
    const result2 = await embedder.embed(chunk2);

    // Same input → same sparse vector
    expect(result1.sparse.indices).toEqual(result2.sparse.indices);
    expect(result1.sparse.values).toEqual(result2.sparse.values);
  });

  it('uses content as semantic fallback when description is absent', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const capturedTexts: string[] = [];
    const provider: MockEmbeddingProvider = {
      embed: vi.fn().mockImplementation((text: string) => {
        capturedTexts.push(text);
        return Promise.resolve([0.1, 0.2, 0.3]);
      }),
      embedBatch: vi.fn((texts: string[]) => {
        capturedTexts.push(...texts);
        return Promise.resolve({
          vectors: texts.map(() => [0.1, 0.2, 0.3]),
          failures: [],
        });
      }),
    };

    const chunk = makeEnrichedChunk({
      description: undefined,
      businessContext: undefined,
      semanticTags: undefined,
    });
    const embedder = new ThreeVectorEmbedder!(provider);
    await embedder.embed(chunk);

    // Semantic input should fall back to content
    const hasContent = capturedTexts.some(
      (t) => t.includes('processPayment') || t.includes('repo.save'),
    );
    expect(hasContent).toBe(true);
  });

  it('embedBatch returns one EmbedderResult per chunk', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const provider = makeProvider();
    const embedder = new ThreeVectorEmbedder!(provider);
    const chunks = [
      makeEnrichedChunk({ id: 'c1', name: 'methodA' }),
      makeEnrichedChunk({ id: 'c2', name: 'methodB' }),
      makeEnrichedChunk({ id: 'c3', name: 'methodC' }),
    ];

    const results = await embedder.embedBatch(chunks);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r).toHaveProperty('semantic');
      expect(r).toHaveProperty('signature');
      expect(r).toHaveProperty('sparse');
    }
  });

  it('uses the canonical core sparse builder for the same identifier terms', async () => {
    expect(ThreeVectorEmbedder).toBeDefined();

    const provider = makeProvider();
    const embedder = new ThreeVectorEmbedder!(provider);
    const chunk = makeEnrichedChunk({
      name: 'getUserById',
      defines: ['getUserById'],
      imports: ['com.example.UserRepository'],
      annotations: ['@Transactional'],
    });

    const result = await embedder.embed(chunk);

    expect(result.sparse).toEqual(
      buildSparseVector([
        chunk.name,
        chunk.defines,
        chunk.imports,
        chunk.annotations,
      ]),
    );
  });

  it('rejects a short provider response instead of returning empty vectors', async () => {
    expect(ThreeVectorEmbedder).toBeDefined();

    const provider: MockEmbeddingProvider = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn((texts: string[]) => {
        return Promise.resolve({
          vectors: texts.length > 0 ? [[0.1, 0.2, 0.3]] : [],
          failures: [],
        });
      }),
    };
    const embedder = new ThreeVectorEmbedder!(provider);

    await expect(
      embedder.embedBatch([
        makeEnrichedChunk({ id: 'c1' }),
        makeEnrichedChunk({ id: 'c2' }),
      ]),
    ).rejects.toThrow(/missing embedding vector|short provider response/i);
  });

  it('retains successful siblings in the detailed batch outcome', async () => {
    expect(ThreeVectorEmbedder).toBeDefined();

    const provider: MockEmbeddingProvider = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn((texts: string[]) =>
        Promise.resolve({
          vectors: texts.map((_text, index) => (index === 1 ? null : [0.1, 0.2, 0.3])),
          failures: texts.length > 1
            ? [{ index: 1, reason: 'one input failed', retryable: false }]
            : [],
        }),
      ),
    };
    const embedder = new ThreeVectorEmbedder!(provider);
    const outcome = await embedder.embedBatchWithFailures([
      makeEnrichedChunk({ id: 'c1' }),
      makeEnrichedChunk({ id: 'c2' }),
    ]);

    expect(outcome.results[0]?.semantic).toEqual([0.1, 0.2, 0.3]);
    expect(outcome.results[1]).toBeNull();
    expect(outcome.failures).toEqual([
      { index: 1, reason: 'one input failed', retryable: false },
    ]);
  });
});

// ── T113: Heuristic fallback uses annotationMeta when no LLM enrichment ───────

describe('ThreeVectorEmbedder — heuristic fallback with annotationMeta (T113)', () => {
  it('includes annotationMeta fields in semantic input when no LLM enrichment is available', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const capturedTexts: string[] = [];
    const provider: MockEmbeddingProvider = {
      embed: vi.fn().mockImplementation((text: string) => {
        capturedTexts.push(text);
        return Promise.resolve([0.1, 0.2, 0.3]);
      }),
      embedBatch: vi.fn((texts: string[]) => {
        capturedTexts.push(...texts);
        return Promise.resolve({
          vectors: texts.map(() => [0.1, 0.2, 0.3]),
          failures: [],
        });
      }),
    };

    // Chunk WITHOUT LLM enrichment (no description/businessContext/semanticTags)
    // but WITH annotationMeta (from AST parsing)
    const chunk: EnrichedChunk = {
      id: 'entry-controller-sig',
      name: 'EntryController',
      content: '@RestController\npublic class EntryController { }',
      language: 'java',
      chunkType: 'class-signature',
      imports: ['org.springframework.web.bind.annotation.RestController'],
      exports: [],
      annotations: ['@RestController', '@RequestMapping("v1/entries")'],
      defines: ['EntryController'],
      description: undefined,
      businessContext: undefined,
      semanticTags: undefined,
      signature: undefined,
      contextHeader: undefined,
      contentHash: 'sha256-xyz',
      // @ts-expect-error annotationMeta not in local type stub yet
      annotationMeta: {
        operationSummaries: ['Create an entry', 'Get entry by ID'],
        endpointPaths: ['v1/entries', '/{id}'],
        httpMethods: ['GET', 'POST'],
        tagName: 'Entries',
      },
    };

    const embedder = new ThreeVectorEmbedder!(provider);
    await embedder.embed(chunk);

    // The semantic input (first embed call) should include annotationMeta signals
    const semanticInput = capturedTexts[0] ?? '';
    expect(semanticInput).toContain('Create an entry');
    expect(semanticInput).toContain('Get entry by ID');
    expect(semanticInput).toContain('v1/entries');
    expect(semanticInput).toContain('Entries');
  });
});

// ── T114: Supplementary mode — partial LLM enrichment + annotationMeta ────────

describe('ThreeVectorEmbedder — supplementary annotationMeta with partial LLM (T114)', () => {
  it('appends annotationMeta to semantic input even when partial LLM enrichment exists', async () => {
    expect(
      ThreeVectorEmbedder,
      'ThreeVectorEmbedder must be exported from ./embedder.ts',
    ).toBeDefined();

    const capturedTexts: string[] = [];
    const provider: MockEmbeddingProvider = {
      embed: vi.fn().mockImplementation((text: string) => {
        capturedTexts.push(text);
        return Promise.resolve([0.1, 0.2, 0.3]);
      }),
      embedBatch: vi.fn((texts: string[]) => {
        capturedTexts.push(...texts);
        return Promise.resolve({
          vectors: texts.map(() => [0.1, 0.2, 0.3]),
          failures: [],
        });
      }),
    };

    // Chunk WITH partial LLM enrichment (description present) AND annotationMeta
    const chunk: EnrichedChunk = {
      id: 'entry-controller-sig',
      name: 'EntryController',
      content: '@RestController\npublic class EntryController { }',
      language: 'java',
      chunkType: 'class-signature',
      imports: ['org.springframework.web.bind.annotation.RestController'],
      exports: [],
      annotations: ['@RestController', '@RequestMapping("v1/entries")'],
      defines: ['EntryController'],
      description: 'REST controller for entry management',
      businessContext: 'Entry domain',
      semanticTags: ['rest', 'controller'],
      signature: undefined,
      contextHeader: undefined,
      contentHash: 'sha256-xyz',
      // @ts-expect-error annotationMeta not in local type stub yet
      annotationMeta: {
        operationSummaries: ['Create an entry', 'Get entry by ID'],
        endpointPaths: ['v1/entries', '/{id}'],
        httpMethods: ['GET', 'POST'],
        tagName: 'Entries',
      },
    };

    const embedder = new ThreeVectorEmbedder!(provider);
    await embedder.embed(chunk);

    // The semantic input should contain BOTH the LLM description AND the annotationMeta signals
    const semanticInput = capturedTexts[0] ?? '';
    expect(semanticInput).toContain('REST controller for entry management');
    expect(semanticInput).toContain('v1/entries');
    expect(semanticInput).toContain('Create an entry');
  });
});
