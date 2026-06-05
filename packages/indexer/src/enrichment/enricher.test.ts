import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * T015: LLM enricher — given chunks + mock Ollama response, returns enriched metadata.
 * T017: Graceful degradation — when Ollama unavailable, returns chunks unchanged + logs warning.
 *
 * Tests MUST fail until enricher.ts is implemented.
 */

// ── Local type stubs (avoid stale compiled package types) ────────────────────

interface TestChunk {
  id: string;
  filePath: string;
  relativePath: string;
  language: string;
  chunkType: string;
  name?: string;
  parentName?: string;
  content: string;
  startLine: number;
  endLine: number;
  imports: string[];
  exports: string[];
  annotations?: string[];
  contentHash?: string;
  // Enrichment fields (added by enricher)
  description?: string;
  businessContext?: string;
  semanticTags?: string[];
  relationships?: Array<{ target: string; type: string; label?: string }>;
  enrichedAt?: string;
  enrichmentModel?: string;
}

interface EnrichmentConfig {
  provider: 'ollama';
  model: string;
  baseUrl?: string;
  numCtx?: number;
  concurrency?: number;
  retryAttempts?: number;
  skipOnFailure?: boolean;
}

// ── Import under test (WILL FAIL — module does not exist yet) ─────────────────
// Dynamic import; fails at runtime when module is missing (that is the TDD fail state).
// Using indirect specifier to prevent static TS errors from blocking test execution.
const enricherSpecifier = './enricher.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const enricherModule = (await import(enricherSpecifier).catch(() => null)) as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const LlmEnricher = enricherModule?.LlmEnricher as
  | (new (config: EnrichmentConfig) => { enrich(chunks: TestChunk[]): Promise<TestChunk[]> })
  | undefined;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeChunk(id: string, name: string): TestChunk {
  return {
    id,
    filePath: `/repo/src/${name}.java`,
    relativePath: `src/${name}.java`,
    language: 'java',
    chunkType: 'method',
    name,
    content: `public void ${name}() { /* body */ }`,
    startLine: 10,
    endLine: 20,
    imports: ['com.example.PaymentRepository'],
    exports: [],
    annotations: ['@Transactional'],
    contentHash: `sha256-of-${id}`,
  };
}

const baseConfig: EnrichmentConfig = {
  provider: 'ollama',
  model: 'qwen3:8b',
  baseUrl: 'http://localhost:11434',
  skipOnFailure: true,
  retryAttempts: 1,
};

// ── T015: enriched metadata ────────────────────────────────────────────────────
describe('LlmEnricher — enriched metadata (T015)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns description, businessContext, semanticTags, relationships from Ollama', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const ollamaPayload = {
      chunks: [
        {
          id: 'chunk-1',
          description: 'Schedules payment retry with exponential backoff',
          businessContext: 'Part of payment resilience flow',
          semanticTags: ['retry', 'resilience', 'payment'],
          relationships: [{ target: 'PaymentRepository.java', type: 'uses' }],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify(ollamaPayload) }),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const result = (await enricher.enrich([makeChunk('chunk-1', 'scheduleRetry')])) as TestChunk[];

    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe('Schedules payment retry with exponential backoff');
    expect(result[0]!.businessContext).toBe('Part of payment resilience flow');
    expect(result[0]!.semanticTags).toEqual(['retry', 'resilience', 'payment']);
    expect(result[0]!.relationships).toHaveLength(1);
    expect(result[0]!.relationships![0]!.target).toBe('PaymentRepository.java');
    expect(result[0]!.relationships![0]!.type).toBe('uses');
  });

  it('sets enrichedAt timestamp and enrichmentModel on each chunk', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const ollamaPayload = {
      chunks: [
        {
          id: 'chunk-1',
          description: 'A payment service method',
          businessContext: 'Payments domain',
          semanticTags: ['payment'],
          relationships: [],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify(ollamaPayload) }),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const result = (await enricher.enrich([makeChunk('chunk-1', 'processPayment')])) as TestChunk[];

    expect(result[0]!.enrichedAt).toBeDefined();
    expect(result[0]!.enrichmentModel).toBe('qwen3:8b');
  });

  it('handles batch of multiple chunks in a single Ollama call', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const ollamaPayload = {
      chunks: [
        {
          id: 'chunk-1',
          description: 'Desc for chunk 1',
          businessContext: 'Context 1',
          semanticTags: ['tag1'],
          relationships: [],
        },
        {
          id: 'chunk-2',
          description: 'Desc for chunk 2',
          businessContext: 'Context 2',
          semanticTags: ['tag2'],
          relationships: [],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify(ollamaPayload) }),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const chunks = [makeChunk('chunk-1', 'method1'), makeChunk('chunk-2', 'method2')];
    const result = (await enricher.enrich(chunks)) as TestChunk[];

    expect(result).toHaveLength(2);
    expect(result[0]!.description).toBe('Desc for chunk 1');
    expect(result[1]!.description).toBe('Desc for chunk 2');
    // Both chunks batched in a single call
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('preserves all original chunk fields after enrichment', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const ollamaPayload = {
      chunks: [
        {
          id: 'chunk-1',
          description: 'desc',
          businessContext: 'ctx',
          semanticTags: [],
          relationships: [],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify(ollamaPayload) }),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const original = makeChunk('chunk-1', 'processPayment');
    const result = (await enricher.enrich([original])) as TestChunk[];

    expect(result[0]!.id).toBe('chunk-1');
    expect(result[0]!.language).toBe('java');
    expect(result[0]!.chunkType).toBe('method');
    expect(result[0]!.annotations).toEqual(['@Transactional']);
    expect(result[0]!.contentHash).toBe('sha256-of-chunk-1');
  });
});

// ── T032: large-file class-group strategy ────────────────────────────────────
describe('LlmEnricher — large-file class grouping (T032)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * When total content length exceeds 70% of numCtx (in tokens, ~chars/4),
   * the enricher should group chunks by parentName (class) and issue one
   * Ollama call per class group instead of one flat batch of up to 10.
   *
   * Setup: numCtx=100 tokens → threshold = 70 tokens ≈ 280 chars.
   * We create 4 chunks in 2 classes, each chunk content = 100 chars → total=400 > 280.
   * Expected: 2 fetch calls (one per class), not 1 flat call.
   */
  it('issues one Ollama call per class group when total content exceeds 70% of numCtx', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const largeContent = 'x'.repeat(100); // 100 chars each

    const makeClassChunk = (id: string, name: string, parentName: string): TestChunk => ({
      id,
      filePath: '/repo/src/LargeService.java',
      relativePath: 'src/LargeService.java',
      language: 'java',
      chunkType: 'method',
      name,
      parentName,
      content: largeContent,
      startLine: 1,
      endLine: 10,
      imports: [],
      exports: [],
    });

    const chunks = [
      makeClassChunk('c1', 'methodA', 'ClassA'),
      makeClassChunk('c2', 'methodB', 'ClassA'),
      makeClassChunk('c3', 'methodC', 'ClassB'),
      makeClassChunk('c4', 'methodD', 'ClassB'),
    ];

    // Total content = 4 * 100 = 400 chars ≈ 100 tokens > 70% of numCtx (100) = 70 tokens

    const makePayload = (ids: string[]) =>
      JSON.stringify({
        chunks: ids.map((id) => ({
          id,
          description: `desc for ${id}`,
          businessContext: 'ctx',
          semanticTags: ['tag'],
          relationships: [],
        })),
      });

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const ids = callCount === 1 ? ['c1', 'c2'] : ['c3', 'c4'];
      return Promise.resolve({
        ok: true,
        json: async () => ({ response: makePayload(ids) }),
      } as Response);
    });

    const enricher = new LlmEnricher!({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      numCtx: 100, // tiny context window to force threshold
      skipOnFailure: true,
      retryAttempts: 1,
    });

    const result = (await enricher.enrich(chunks as unknown as TestChunk[])) as TestChunk[];

    // Two classes → two Ollama calls
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(4);
    expect(result.find((c) => c.id === 'c1')?.description).toBe('desc for c1');
    expect(result.find((c) => c.id === 'c3')?.description).toBe('desc for c3');
  });

  it('uses flat batching (one call) when total content is below the 70% threshold', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    // 2 chunks × 10 chars = 20 chars ≈ 5 tokens, well below 70% of 100 = 70 tokens
    const makeSmallChunk = (id: string): TestChunk => ({
      id,
      filePath: '/repo/src/Tiny.java',
      relativePath: 'src/Tiny.java',
      language: 'java',
      chunkType: 'method',
      name: id,
      parentName: 'SomeClass',
      content: 'x'.repeat(10),
      startLine: 1,
      endLine: 3,
      imports: [],
      exports: [],
    });

    const chunks = [makeSmallChunk('s1'), makeSmallChunk('s2')];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          chunks: [
            {
              id: 's1',
              description: 'd1',
              businessContext: '',
              semanticTags: [],
              relationships: [],
            },
            {
              id: 's2',
              description: 'd2',
              businessContext: '',
              semanticTags: [],
              relationships: [],
            },
          ],
        }),
      }),
    } as Response);

    const enricher = new LlmEnricher!({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      numCtx: 100,
      skipOnFailure: true,
      retryAttempts: 1,
    });

    await enricher.enrich(chunks as unknown as TestChunk[]);

    // Small file — single flat call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('groups class-signature chunks with their class name as the group key', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const largeContent = 'x'.repeat(200);

    const classSignatureChunk: TestChunk = {
      id: 'sig1',
      filePath: '/repo/src/Foo.java',
      relativePath: 'src/Foo.java',
      language: 'java',
      chunkType: 'class-signature',
      name: 'FooService',
      content: largeContent,
      startLine: 1,
      endLine: 5,
      imports: [],
      exports: [],
    };

    const methodChunk: TestChunk = {
      id: 'm1',
      filePath: '/repo/src/Foo.java',
      relativePath: 'src/Foo.java',
      language: 'java',
      chunkType: 'method',
      name: 'doFoo',
      parentName: 'FooService',
      content: largeContent,
      startLine: 10,
      endLine: 20,
      imports: [],
      exports: [],
    };

    // total = 2 * 200 = 400 chars ≈ 100 tokens > 70% of 100 = 70 tokens → class grouping
    // Both chunks share class 'FooService' → should be ONE Ollama call
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          chunks: [
            {
              id: 'sig1',
              description: 'class sig',
              businessContext: '',
              semanticTags: [],
              relationships: [],
            },
            {
              id: 'm1',
              description: 'method',
              businessContext: '',
              semanticTags: [],
              relationships: [],
            },
          ],
        }),
      }),
    } as Response);

    const enricher = new LlmEnricher!({
      provider: 'ollama',
      model: 'qwen3:8b',
      numCtx: 100,
      skipOnFailure: true,
      retryAttempts: 1,
    });

    await enricher.enrich([classSignatureChunk, methodChunk] as unknown as TestChunk[]);

    // class-signature + its methods → one group → one call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ── T017: graceful degradation ─────────────────────────────────────────────────
describe('LlmEnricher — graceful degradation (T017)', () => {
  let originalFetch: typeof global.fetch;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy?.mockRestore();
  });

  it('returns chunks without LLM fields when Ollama is unreachable', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const enricher = new LlmEnricher!(baseConfig);
    const result = (await enricher.enrich([makeChunk('chunk-1', 'processPayment')])) as TestChunk[];

    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBeUndefined();
    expect(result[0]!.businessContext).toBeUndefined();
    expect(result[0]!.semanticTags).toBeUndefined();
    expect(result[0]!.enrichedAt).toBeUndefined();
  });

  it('logs a warning mentioning Ollama when connection fails', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const enricher = new LlmEnricher!(baseConfig);
    await enricher.enrich([makeChunk('chunk-1', 'processPayment')]);

    expect(warnSpy).toHaveBeenCalled();
    const warnMessage = warnSpy.mock.calls[0]?.join(' ') ?? '';
    expect(warnMessage.toLowerCase()).toMatch(/ollama|enrichment|unavailable|failed|error/);
  });

  it('returns chunks unchanged when skipOnFailure=true and Ollama returns 500', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal server error' }),
    } as Response);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const enricher = new LlmEnricher!({ ...baseConfig, skipOnFailure: true });
    const result = (await enricher.enrich([makeChunk('chunk-1', 'processPayment')])) as TestChunk[];

    expect(result[0]!.description).toBeUndefined();
    expect(result[0]!.id).toBe('chunk-1');
  });

  it('does not throw when skipOnFailure=true and Ollama is unavailable', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const enricher = new LlmEnricher!({ ...baseConfig, skipOnFailure: true });
    await expect(enricher.enrich([makeChunk('chunk-1', 'fn')])).resolves.not.toThrow();
  });
});
