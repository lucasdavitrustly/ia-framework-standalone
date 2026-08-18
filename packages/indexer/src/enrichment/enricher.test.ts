import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';

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
const enricherModule = (await import(enricherSpecifier).catch(() => null)) as Record<
  string,
  unknown
> | null;

interface EnrichmentProgress {
  batchesCompleted: number;
  batchesTotal: number;
  currentFile?: string;
  warning?: string;
}

const LlmEnricher = enricherModule?.LlmEnricher as
  | (new (config: EnrichmentConfig) => {
      enrich(
        chunks: TestChunk[],
        onProgress?: (p: EnrichmentProgress) => void,
      ): Promise<TestChunk[]>;
    })
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
      json: () => Promise.resolve(({ response: JSON.stringify(ollamaPayload) })),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const result = await enricher.enrich([makeChunk('chunk-1', 'scheduleRetry')]);

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
      json: () => Promise.resolve(({ response: JSON.stringify(ollamaPayload) })),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const result = await enricher.enrich([makeChunk('chunk-1', 'processPayment')]);

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
      json: () => Promise.resolve(({ response: JSON.stringify(ollamaPayload) })),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const chunks = [makeChunk('chunk-1', 'method1'), makeChunk('chunk-2', 'method2')];
    const result = await enricher.enrich(chunks);

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
      json: () => Promise.resolve(({ response: JSON.stringify(ollamaPayload) })),
    } as Response);

    const enricher = new LlmEnricher!(baseConfig);
    const original = makeChunk('chunk-1', 'processPayment');
    const result = await enricher.enrich([original]);

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
   * the enricher should group chunks by parentName (class) and issue separate
   * Ollama calls per class group with dynamic batching.
   *
   * Setup: numCtx=7500 → threshold = 5250 tokens.
   * We create 4 chunks in 2 classes, each chunk content = 4000 chars (1333 tokens)
   * → total=5333 tokens > 5250 threshold.
   * Budget = 7500*0.45-500 = 2875 tokens → 2 chunks of 1333 tokens fit per batch.
   * Expected: 2 fetch calls (one per class).
   */
  it('issues one Ollama call per class group when total content exceeds 70% of numCtx', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const largeContent = 'x'.repeat(4000); // 4000 chars ≈ 1333 tokens each (charsPerToken=3)

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

    // Total content = 4 * 4000 = 16000 chars ≈ 5333 tokens > 70% of 7500 = 5250 tokens

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
        json: () => Promise.resolve(({ response: makePayload(ids) })),
      } as Response);
    });

    const enricher = new LlmEnricher!({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      numCtx: 7500, // budget=2875 tokens, fits 2 chunks of 1333 tokens per batch
      skipOnFailure: true,
      retryAttempts: 1,
    });

    const result = await enricher.enrich(chunks as unknown as TestChunk[]);

    // Two classes → two Ollama calls
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(4);
    expect(result.find((c) => c.id === 'c1')?.description).toBe('desc for c1');
    expect(result.find((c) => c.id === 'c3')?.description).toBe('desc for c3');
  });

  it('uses flat batching (one call) when total content is below the 70% threshold', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    // 2 chunks × 10 chars = 20 chars ≈ 5 tokens, well below 70% of 5000 = 3500 tokens
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
      json: () =>
        Promise.resolve({
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
      numCtx: 5000, // budget=2250 tokens, standard path for small content
      skipOnFailure: true,
      retryAttempts: 1,
    });

    await enricher.enrich(chunks as unknown as TestChunk[]);

    // Small file — single flat call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('groups class-signature chunks with their class name as the group key', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const largeContent = 'x'.repeat(4000); // 1333 tokens each (charsPerToken=3)

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

    // Add chunks from another class to trigger isLargeFile threshold
    const otherChunk1: TestChunk = {
      id: 'o1',
      filePath: '/repo/src/Foo.java',
      relativePath: 'src/Foo.java',
      language: 'java',
      chunkType: 'method',
      name: 'barMethod',
      parentName: 'BarService',
      content: largeContent,
      startLine: 30,
      endLine: 40,
      imports: [],
      exports: [],
    };

    const otherChunk2: TestChunk = {
      id: 'o2',
      filePath: '/repo/src/Foo.java',
      relativePath: 'src/Foo.java',
      language: 'java',
      chunkType: 'method',
      name: 'barMethod2',
      parentName: 'BarService',
      content: largeContent,
      startLine: 45,
      endLine: 55,
      imports: [],
      exports: [],
    };

    // total = 4 * 1333 = 5333 tokens > 70% of 7500 = 5250 tokens → class grouping
    // FooService group: [sig1, m1] → 1 batch (2667 tokens ≤ 2875 budget)
    // BarService group: [o1, o2] → 1 batch (2667 tokens ≤ 2875 budget)
    // Return exactly one enrichment object per chunk in the batch (bounded schema).
    global.fetch = vi.fn((_: unknown, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        format?: { minItems?: number };
      };
      const count = body.format?.minItems ?? 0;
      const chunks = Array.from({ length: count }, (_, i) => ({
        description: `desc ${i}`,
        businessContext: '',
        semanticTags: [],
        relationships: [],
      }));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: JSON.stringify(chunks) }),
      } as Response);
    });

    const enricher = new LlmEnricher!({
      provider: 'ollama',
      model: 'qwen3:8b',
      numCtx: 7500, // budget=2875 tokens
      skipOnFailure: true,
      retryAttempts: 1,
    });

    await enricher.enrich([
      classSignatureChunk,
      methodChunk,
      otherChunk1,
      otherChunk2,
    ] as unknown as TestChunk[]);

    // 2 class groups → 2 calls (FooService: sig1+m1, BarService: o1+o2)
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ── T017: graceful degradation ─────────────────────────────────────────────────
describe('LlmEnricher — graceful degradation (T017)', () => {
  let originalFetch: typeof global.fetch;
  let warnSpy: MockInstance<typeof console.warn> | undefined;

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
    const result = await enricher.enrich([makeChunk('chunk-1', 'processPayment')]);

    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBeUndefined();
    expect(result[0]!.businessContext).toBeUndefined();
    expect(result[0]!.semanticTags).toBeUndefined();
    expect(result[0]!.enrichedAt).toBeUndefined();
  });

  it('logs a warning mentioning Ollama when connection fails', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const enricher = new LlmEnricher!(baseConfig);
    const warnings: string[] = [];
    await enricher.enrich([makeChunk('chunk-1', 'processPayment')], (p) => {
      if (p.warning) warnings.push(p.warning);
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.toLowerCase()).toMatch(/ollama|enrichment|unavailable|failed|error/);
  });

  it('returns chunks unchanged when skipOnFailure=true and Ollama returns 500', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('{"error":"internal server error"}'),
      json: () => Promise.resolve(({ error: 'internal server error' })),
    } as Response);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const enricher = new LlmEnricher!({ ...baseConfig, skipOnFailure: true });
    const result = await enricher.enrich([makeChunk('chunk-1', 'processPayment')]);

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

// ─────────────────────────────────────────────────────────────────────────────

describe('LlmEnricher — enrichment progress callback (T083)', () => {
  let warnSpy: MockInstance<typeof console.warn> | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  function makeOllamaResponse(chunks: TestChunk[]) {
    const enriched = chunks.map((c) => ({
      id: c.id,
      description: `Description of ${c.name}`,
      businessContext: 'payments',
      semanticTags: ['tag'],
      relationships: [],
    }));
    return {
      ok: true,
      json: () => Promise.resolve(({ response: JSON.stringify({ chunks: enriched }) })),
    } as Response;
  }

  /**
   * Batch-size-aware fetch mock: returns exactly `format.minItems` enrichment
   * objects, matching the bounded array schema the enricher now sends. This is
   * required because the enricher rejects (and retries) length mismatches.
   */
  function boundedFetch() {
    return vi.fn((_: unknown, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        format?: { minItems?: number };
      };
      const count = body.format?.minItems ?? 0;
      const arr = Array.from({ length: count }, (_, i) => ({
        description: `Description ${i}`,
        businessContext: 'payments',
        semanticTags: ['tag'],
        relationships: [],
      }));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: JSON.stringify(arr) }),
      } as Response);
    });
  }

  it('T083: onProgress is called once per batch during flat batching', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    // 25 chunks → 2 batches (20 + 5) with dynamic batching (MAX_BATCH_CHUNKS=20)
    const chunks = Array.from({ length: 25 }, (_, i) => makeChunk(`c${i}`, `fn${i}`));
    global.fetch = boundedFetch();

    const progressEvents: Array<{ batchesCompleted: number; batchesTotal: number }> = [];
    const enricher = new LlmEnricher!(baseConfig);
    await enricher.enrich(chunks, (p) => progressEvents.push({ ...p }));

    expect(progressEvents.length).toBe(2);
  });

  it('T083: batchesTotal matches the total number of Ollama calls made', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const chunks = Array.from({ length: 45 }, (_, i) => makeChunk(`c${i}`, `fn${i}`));
    global.fetch = boundedFetch();

    const events: Array<{ batchesCompleted: number; batchesTotal: number }> = [];
    const enricher = new LlmEnricher!(baseConfig);
    await enricher.enrich(chunks, (p) => events.push({ ...p }));

    // 45 chunks / 20 max per batch = 3 batches (20+20+5)
    expect(events[0]!.batchesTotal).toBe(3);
    expect(events[events.length - 1]!.batchesTotal).toBe(3);
  });

  it('T083: batchesCompleted increments from 1 to batchesTotal', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const chunks = Array.from({ length: 25 }, (_, i) => makeChunk(`c${i}`, `fn${i}`));
    global.fetch = boundedFetch();

    const completed: number[] = [];
    const enricher = new LlmEnricher!(baseConfig);
    await enricher.enrich(chunks, (p) => completed.push(p.batchesCompleted));

    // 25 chunks → 2 batches (20+5)
    expect(completed).toEqual([1, 2]);
  });

  it('T083: onProgress receives currentFile from the batch', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const chunks = [makeChunk('c0', 'fn0'), makeChunk('c1', 'fn1')];
    global.fetch = boundedFetch();

    const events: Array<{ batchesCompleted: number; batchesTotal: number; currentFile?: string }> =
      [];
    const enricher = new LlmEnricher!(baseConfig);
    await enricher.enrich(chunks, (p) => events.push({ ...p }));

    // currentFile should be the filePath of the first chunk in the batch
    expect(events[0]!.currentFile).toBe(chunks[0]!.filePath);
  });

  it('T083: onProgress is NOT called when chunks array is empty', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    const onProgress = vi.fn();
    const enricher = new LlmEnricher!(baseConfig);
    await enricher.enrich([], onProgress);

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('T083: onProgress is still called for successful batches when a batch fails (skipOnFailure=true)', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 25 chunks → 2 batches (20+5) with dynamic batching
    const chunks = Array.from({ length: 25 }, (_, i) => makeChunk(`c${i}`, `fn${i}`));

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve(makeOllamaResponse(chunks.slice(20, 25)));
    });

    const completed: number[] = [];
    const enricher = new LlmEnricher!({ ...baseConfig, skipOnFailure: true });
    await enricher.enrich(chunks, (p) => completed.push(p.batchesCompleted));

    // Both batches should emit progress (even the failed one)
    expect(completed.length).toBe(2);
    expect(completed).toEqual([1, 2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('LlmEnricher — concurrent batch processing (T124)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('T124: processes batches concurrently when concurrency > 1', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    // Create 45 chunks → 3 batches (20+20+5) with dynamic batching (MAX_BATCH_CHUNKS=20)
    const chunks = Array.from({ length: 45 }, (_, i) => makeChunk(`c${i}`, `fn${i}`));

    // Track concurrent in-flight requests
    let concurrent = 0;
    let maxConcurrent = 0;

    global.fetch = vi.fn().mockImplementation(async (_: unknown, init?: RequestInit) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      // Simulate Ollama latency so batches overlap
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        format?: { minItems?: number };
      };
      const count = body.format?.minItems ?? 0;
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            response: JSON.stringify(
              Array.from({ length: count }, (_, i) => ({
                description: `desc-${i}`,
                businessContext: 'ctx',
                semanticTags: ['tag'],
                relationships: [],
              })),
            ),
          }),
      } as Response;
    });

    const enricher = new LlmEnricher!({
      ...baseConfig,
      concurrency: 3, // process 3 batches in parallel
      retryAttempts: 0,
    });

    const result = await enricher.enrich(chunks);

    // Verify concurrency: with 3 batches and concurrency=3, all should overlap
    expect(maxConcurrent).toBeGreaterThan(1);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    // Verify all chunks still get enriched
    expect(result).toHaveLength(45);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('T124: respects concurrency=1 (sequential execution)', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    // 25 chunks → 2 batches (20+5) with dynamic batching
    const chunks = Array.from({ length: 25 }, (_, i) => makeChunk(`c${i}`, `fn${i}`));

    let concurrent = 0;
    let maxConcurrent = 0;

    global.fetch = vi.fn().mockImplementation(async (_: unknown, init?: RequestInit) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        format?: { minItems?: number };
      };
      const count = body.format?.minItems ?? 0;
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            response: JSON.stringify(
              Array.from({ length: count }, (_, i) => ({
                description: `desc-${i}`,
                businessContext: 'ctx',
                semanticTags: [],
                relationships: [],
              })),
            ),
          }),
      } as Response;
    });

    const enricher = new LlmEnricher!({
      ...baseConfig,
      concurrency: 1, // sequential
      retryAttempts: 0,
    });

    await enricher.enrich(chunks);

    // With concurrency=1, only one request should be in-flight at a time
    expect(maxConcurrent).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('T124: progress events report correct batchesCompleted regardless of execution order', async () => {
    expect(LlmEnricher, 'LlmEnricher must be exported from ./enricher.ts').toBeDefined();

    // 45 chunks → 3 batches (20+20+5) with dynamic batching
    const chunks = Array.from({ length: 45 }, (_, i) => makeChunk(`c${i}`, `fn${i}`));

    global.fetch = vi.fn().mockImplementation(async (_: unknown, init?: RequestInit) => {
      // Random delay to simulate varying Ollama response times
      await new Promise((r) => setTimeout(r, Math.random() * 30));
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        format?: { minItems?: number };
      };
      const count = body.format?.minItems ?? 0;
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            response: JSON.stringify(
              Array.from({ length: count }, (_, i) => ({
                description: `desc-${i}`,
                businessContext: 'ctx',
                semanticTags: [],
                relationships: [],
              })),
            ),
          }),
      } as Response;
    });

    const progressEvents: Array<{ batchesCompleted: number; batchesTotal: number }> = [];
    const enricher = new LlmEnricher!({
      ...baseConfig,
      concurrency: 3,
      retryAttempts: 0,
    });

    await enricher.enrich(chunks, (p) => progressEvents.push({ ...p }));

    // All 3 batches should emit progress
    expect(progressEvents).toHaveLength(3);
    // batchesTotal is consistent
    expect(progressEvents.every((p) => p.batchesTotal === 3)).toBe(true);
    // batchesCompleted reaches 3 by the last event
    const completedValues = progressEvents.map((p) => p.batchesCompleted).sort((a, b) => a - b);
    expect(completedValues).toEqual([1, 2, 3]);
  });
});

// ── D-011: bounded schema, keep_alive, timeout, retry-on-partial ───────────────
describe('LlmEnricher — bounded output schema & partial-response retry (D-011)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a bounded array schema (minItems == batch size), keep_alive and a timeout signal', async () => {
    let captured: { body: unknown; hasSignal: boolean } | undefined;
    global.fetch = vi.fn((_: unknown, init?: RequestInit) => {
      captured = {
        body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}'),
        hasSignal: Boolean(init?.signal),
      };
      const arr = [
        { description: 'd0', businessContext: 'c', semanticTags: ['x', 'y', 'z'], relationships: [] },
        { description: 'd1', businessContext: 'c', semanticTags: ['x', 'y', 'z'], relationships: [] },
      ];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: JSON.stringify(arr) }),
      } as Response);
    });

    const enricher = new LlmEnricher!({ ...baseConfig, numCtx: 100000 });
    await enricher.enrich([makeChunk('c0', 'fnA'), makeChunk('c1', 'fnB')]);

    const body = captured!.body as {
      format?: { type?: string; minItems?: number; maxItems?: number };
      keep_alive?: string;
    };
    expect(body.format?.type).toBe('array');
    expect(body.format?.minItems).toBe(2);
    expect(body.format?.maxItems).toBe(2);
    expect(body.keep_alive).toBeDefined();
    expect(captured!.hasSignal).toBe(true);
  });

  it('retries when the model returns fewer objects than the batch, then enriches all', async () => {
    let call = 0;
    global.fetch = vi.fn(() => {
      call++;
      // First response is partial (1 object for a 2-chunk batch) → must retry.
      const arr =
        call === 1
          ? [{ description: 'only-one', businessContext: 'c', semanticTags: ['a', 'b', 'c'], relationships: [] }]
          : [
              { description: 'd0', businessContext: 'c', semanticTags: ['a', 'b', 'c'], relationships: [] },
              { description: 'd1', businessContext: 'c', semanticTags: ['a', 'b', 'c'], relationships: [] },
            ];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: JSON.stringify(arr) }),
      } as Response);
    });

    const enricher = new LlmEnricher!({
      ...baseConfig,
      numCtx: 100000,
      retryAttempts: 2,
      skipOnFailure: true,
    });
    const result = await enricher.enrich([makeChunk('c0', 'fnA'), makeChunk('c1', 'fnB')]);

    expect(call).toBeGreaterThanOrEqual(2); // retried after the partial response
    expect(result[0]!.description).toBe('d0');
    expect(result[1]!.description).toBe('d1');
  });
});

// ── D-011: split-on-truncation recovery ───────────────────────────────────────
describe('LlmEnricher — split-on-truncation (D-011)', () => {
  let originalFetch: typeof global.fetch;
  let warnSpy: MockInstance<typeof console.warn> | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy?.mockRestore();
  });

  /** Returns exactly `format.minItems` enrichment objects. */
  function full(count: number) {
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          response: JSON.stringify(
            Array.from({ length: count }, (_, i) => ({
              description: `d${i}`,
              businessContext: 'c',
              semanticTags: ['a', 'b', 'c'],
              relationships: [],
            })),
          ),
          done_reason: 'stop',
        }),
    } as Response;
  }
  function truncated() {
    return {
      ok: true,
      // Truncated JSON + done_reason:'length' → EnrichmentTruncationError.
      json: () => Promise.resolve({ response: '[{"description":"cut', done_reason: 'length' }),
    } as Response;
  }
  function batchSize(init?: RequestInit): number {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
      format?: { minItems?: number };
    };
    return body.format?.minItems ?? 0;
  }

  it('splits a truncated batch and recovers every chunk', async () => {
    const calls: number[] = [];
    global.fetch = vi.fn((_: unknown, init?: RequestInit) => {
      const n = batchSize(init);
      calls.push(n);
      // The full 4-chunk batch truncates; halves of 2 succeed.
      return Promise.resolve(n >= 4 ? truncated() : full(n));
    });

    const chunks = [
      makeChunk('c0', 'fnA'),
      makeChunk('c1', 'fnB'),
      makeChunk('c2', 'fnC'),
      makeChunk('c3', 'fnD'),
    ];
    const enricher = new LlmEnricher!({
      ...baseConfig,
      numCtx: 100000,
      retryAttempts: 2, // must NOT be consumed on truncation
      skipOnFailure: true,
    });
    const result = await enricher.enrich(chunks);

    // 1 truncated call of 4, then 2 successful calls of 2 (no wasted retries).
    expect(calls).toEqual([4, 2, 2]);
    expect(result.map((c) => c.description)).toEqual(['d0', 'd1', 'd0', 'd1']);
  });

  it('skips a single chunk that still truncates at size 1 (bounded loss)', async () => {
    global.fetch = vi.fn((_: unknown, init?: RequestInit) => {
      const n = batchSize(init);
      // Everything truncates, down to size 1.
      return Promise.resolve(n >= 2 ? truncated() : truncated());
    });

    const chunks = [makeChunk('c0', 'fnA'), makeChunk('c1', 'fnB')];
    const enricher = new LlmEnricher!({
      ...baseConfig,
      numCtx: 100000,
      retryAttempts: 2,
      skipOnFailure: true,
    });
    const result = await enricher.enrich(chunks);

    // No throw; both chunks pass through unenriched rather than aborting.
    expect(result).toHaveLength(2);
    expect(result[0]!.description).toBeUndefined();
    expect(result[1]!.description).toBeUndefined();
  });
});
