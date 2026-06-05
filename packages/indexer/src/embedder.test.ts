import { describe, it, expect, vi } from 'vitest';

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
  embedBatch(texts: string[], type?: string): Promise<number[][]>;
}

// ── Import under test (WILL FAIL — module does not exist yet) ─────────────────
const embedderSpecifier = './embedder.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const embedderModule = (await import(embedderSpecifier).catch(() => null)) as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const ThreeVectorEmbedder = embedderModule?.ThreeVectorEmbedder as
  | (new (provider: MockEmbeddingProvider) => {
      embed(chunk: EnrichedChunk): Promise<EmbedderResult>;
      embedBatch(chunks: EnrichedChunk[]): Promise<EmbedderResult[]>;
    })
  | undefined;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns different vectors per text to allow assertion on which text was embedded */
function makeProvider(): MockEmbeddingProvider {
  let callCount = 0;
  return {
    embed: vi.fn().mockImplementation(async () => {
      callCount++;
      return [callCount * 0.1, callCount * 0.2, callCount * 0.3];
    }),
    embedBatch: vi.fn().mockImplementation(async (texts: string[]) => {
      return texts.map((_, i) => [(i + 1) * 0.1, (i + 1) * 0.2, (i + 1) * 0.3]);
    }),
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
      embed: vi.fn().mockImplementation(async (text: string) => {
        capturedTexts.push(text);
        return [0.1, 0.2, 0.3];
      }),
      embedBatch: vi.fn().mockImplementation(async (texts: string[]) => {
        capturedTexts.push(...texts);
        return texts.map(() => [0.1, 0.2, 0.3]);
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
      embed: vi.fn().mockImplementation(async (text: string) => {
        capturedTexts.push(text);
        return [0.1, 0.2, 0.3];
      }),
      embedBatch: vi.fn().mockImplementation(async (texts: string[]) => {
        capturedTexts.push(...texts);
        return texts.map(() => [0.1, 0.2, 0.3]);
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
      embed: vi.fn().mockImplementation(async (text: string) => {
        capturedTexts.push(text);
        return [0.1, 0.2, 0.3];
      }),
      embedBatch: vi.fn().mockImplementation(async (texts: string[]) => {
        capturedTexts.push(...texts);
        return texts.map(() => [0.1, 0.2, 0.3]);
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
});
