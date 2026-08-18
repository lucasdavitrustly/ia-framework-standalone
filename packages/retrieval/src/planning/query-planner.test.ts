import { buildSparseVector, QueryPlanError } from '@ia-framework/core';
import type { StoreCapabilities } from '@ia-framework/vector-store';
import { describe, expect, it, vi } from 'vitest';
import { QueryPlanner, type PlanInput } from './query-planner.js';

const planner = new QueryPlanner();
const sparseCapabilities: StoreCapabilities = {
  sparse: true,
  filterOnly: true,
  payloadIndexes: [],
};
const denseOnlyCapabilities: StoreCapabilities = {
  ...sparseCapabilities,
  sparse: false,
};

function plan(query: string, input: Omit<PlanInput, 'query'> = {}, caps = sparseCapabilities) {
  return planner.plan({ query, ...input }, caps);
}

describe('QueryPlanner', () => {
  it('returns one complete plan for each call', () => {
    const result = plan('getUserById');

    expect(result.originalQuery).toBe('getUserById');
    expect(result.intent).toBeTypeOf('string');
    expect(result.route).toBe('keyword');
    expect(result.branches.length).toBeGreaterThan(0);
    expect(result.representations.semantic).toBeTypeOf('string');
    expect(result.representations.signature).toBeTypeOf('string');
    expect(result.representations.sparse.indices.length).toBeGreaterThan(0);
    expect(result.filter).toBeDefined();
    expect(result.expansion).toBeDefined();
    expect(result.budget).toBeDefined();
    expect(result.candidateLimits).toBeDefined();
    expect(result.fingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it('preserves the original query byte-for-byte', () => {
    const query = '  What is "PaymentService.refund"?  ';

    expect(plan(query).originalQuery).toBe(query);
  });

  it('maps an exact identifier to exact_symbol', () => {
    expect(plan('getUserById').intent).toBe('exact_symbol');
  });

  it('maps a class question to class_overview', () => {
    expect(plan('what is an Entry?').intent).toBe('class_overview');
  });

  it('maps a natural-language question to conceptual', () => {
    expect(plan('how are payments retried?').intent).toBe('conceptual');
  });

  it('maps an import question to dependency_trace', () => {
    expect(plan('what imports X?').intent).toBe('dependency_trace');
  });

  it('maps an existence question to existence', () => {
    expect(plan('is there a retry mechanism?').intent).toBe('existence');
  });

  it('maps a count question to aggregation', () => {
    expect(plan('how many services?').intent).toBe('aggregation');
  });

  it('derives the route separately from intent', () => {
    const result = plan('what is an Entry?');

    expect(result.intent).toBe('class_overview');
    expect(result.route).toBe('semantic');
  });

  it('uses the configured query prefix only for the semantic representation', () => {
    const result = plan('PaymentService.refund', { queryPrefix: 'query: ' });

    expect(result.representations.semantic).toBe('query: PaymentService.refund');
    expect(result.representations.signature).not.toContain('query: ');
    expect(result.representations.sparse).toEqual(
      buildSparseVector(['PaymentService.refund']),
    );
  });

  it('renders exact symbols and structural evidence in the signature representation', () => {
    const result = plan('PaymentService.refund in com.example.payments');

    expect(result.representations.signature).toContain('PaymentService.refund');
    expect(result.representations.signature).toContain('com.example.payments');
    expect(result.representations.signature).toContain('classes:PaymentService');
    expect(result.representations.signature).toContain('methods:refund');
    expect(result.representations.signature).toContain('packages:com.example.payments');
  });

  it('builds the sparse representation from exact lexical evidence', () => {
    const result = plan(
      'PaymentService.refund "retry policy" com.example.payments src/payments/PaymentService.ts',
    );

    expect(result.representations.sparse).toEqual(
      buildSparseVector([
        'PaymentService.refund',
        'retry policy',
        'com.example.payments',
        'src/payments/PaymentService.ts',
      ].filter(Boolean)),
    );
  });

  it('keeps semantic, signature, and sparse representations mutually distinct', () => {
    const result = plan('PaymentService.refund');

    // Both string channels: compared as strings. The original compared a string
    // to a SparseVector object, which can never be equal and so always passed.
    expect(result.representations.semantic).not.toEqual(result.representations.signature);
    // The sparse channel is compared to a sparse vector — like types. It is built
    // from the query's lexical evidence, not from the rendered signature text, so
    // hashing the signature must not reproduce it.
    expect(result.representations.sparse).not.toEqual(
      buildSparseVector([result.representations.signature]),
    );
  });

  it('builds the sparse channel from lexical evidence rather than from either string channel', () => {
    const result = plan('how are payments retried for "retry policy"?');

    // A conceptual query: the sparse channel carries the quoted phrase and curated
    // synonyms, so it matches neither string channel's hash.
    expect(result.representations.sparse.indices.length).toBeGreaterThan(0);
    expect(result.representations.sparse).not.toEqual(
      buildSparseVector([result.representations.semantic]),
    );
    expect(result.representations.sparse).not.toEqual(
      buildSparseVector([result.representations.signature]),
    );
  });

  it('selects signature and sparse branches for dotted symbols', () => {
    expect(plan('PaymentService.refund').branches).toEqual(['signature', 'sparse']);
  });

  it('adds a sparse branch to a conceptual quoted query independently of intent', () => {
    const result = plan('how are payments retried for "retry policy"?');

    expect(result.intent).toBe('conceptual');
    expect(result.branches).toContain('semantic');
    expect(result.branches).toContain('sparse');
  });

  it('omits sparse when the store does not support it', () => {
    const result = plan('PaymentService.refund', {}, denseOnlyCapabilities);

    expect(result.branches).toEqual(['signature']);
  });

  it('keeps curated synonyms additive and only in the sparse channel', () => {
    const result = plan('websocket retry');

    expect(result.representations.semantic).not.toContain('message');
    expect(result.representations.signature).not.toContain('message');
    expect(result.representations.sparse).toEqual(
      buildSparseVector(['websocket retry', 'message', 'queue', 'event', 'broker', 'listener', 'publish']),
    );
  });

  it('extracts exact-symbol evidence, including quoted symbols', () => {
    const result = plan('getUserById "PaymentService.refund"');

    expect(result.lexical.exactSymbols).toEqual(
      expect.arrayContaining(['getUserById', 'PaymentService.refund']),
    );
  });

  it('extracts package terms', () => {
    const result = plan('find com.example.payments in src/payments/PaymentService.ts');

    expect(result.lexical.packageTerms).toContain('com.example.payments');
    // Quoted and path evidence still reaches the sparse channel, which is the only
    // consumer that ever used them (the emitted plan fields were unreferenced).
    expect(result.representations.sparse).toEqual(
      buildSparseVector([
        'com.example.payments',
        'src/payments/PaymentService.ts',
      ]),
    );
  });

  it('produces a deeply equal plan and fingerprint for identical input', () => {
    const first = plan('PaymentService.refund', {
      queryPrefix: 'query: ',
      repo: 'payments',
      expansionHops: 2,
      maxTokens: 12000,
    });
    const second = plan('PaymentService.refund', {
      queryPrefix: 'query: ',
      repo: 'payments',
      expansionHops: 2,
      maxTokens: 12000,
    });

    expect(second).toEqual(first);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('does not perform network work while planning', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    plan('how are payments retried?');

    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keeps template ids out of every embedding representation', () => {
    const result = plan('what is an Entry?', { templateId: 'class-overview-v1' });

    expect(result.templateId).toBe('class-overview-v1');
    expect(result.representations.semantic).not.toContain('class-overview-v1');
    expect(result.representations.signature).not.toContain('class-overview-v1');
    expect(result.representations.sparse).toEqual(buildSparseVector(['Entry']));
  });

  it('preserves the repository filter', () => {
    expect(plan('service', { repo: 'payments' }).filter.repoId).toBe('payments');
  });

  it('preserves the stereotype filter', () => {
    const result = plan('service', { stereotype: 'service' });

    expect(result.filter.userFilters.must).toContainEqual({
      key: 'stereotype',
      match: { value: 'service' },
    });
  });

  it('preserves the architecture-layer filter', () => {
    const result = plan('controller', { archLayer: 'presentation' });

    expect(result.filter.userFilters.must).toContainEqual({
      key: 'archLayer',
      match: { value: 'presentation' },
    });
  });

  it('preserves the module filter', () => {
    const result = plan('payments', { module: 'payments-core' });

    expect(result.filter.userFilters.must).toContainEqual({
      key: 'moduleInfo.module',
      match: { value: 'payments-core' },
    });
  });

  it('preserves the language filter', () => {
    const result = plan('service', { language: 'typescript' });

    expect(result.filter.userFilters.must).toContainEqual({
      key: 'language',
      match: { value: 'typescript' },
    });
  });

  it('disables test exclusion for explicit test queries', () => {
    expect(plan('tests for EntryService').filter.excludeTests).toBe(false);
  });

  it('disables test exclusion for an explicit test stereotype filter', () => {
    const result = plan('services', { stereotype: 'test' });

    expect(result.filter.excludeTests).toBe(false);
    expect(result.filter.reservedExclusion).toBe(true);
  });

  it('always excludes reserved contract points', () => {
    expect(plan('services').filter.reservedExclusion).toBe(true);
  });

  it('preserves explicit expansion settings', () => {
    expect(plan('how does the payment flow work?', { expansionHops: 2 }).expansion).toEqual({
      hops: 2,
    });
  });

  it('gives an explicit budget precedence over adaptive classification', () => {
    const budget = plan('how does the payment flow work?', { maxTokens: 12345 }).budget;

    expect(budget.limit).toBe(12345);
    expect(budget.source).toBe('explicit');
  });

  it('uses the adaptive budget when no explicit budget is supplied', () => {
    const budget = plan('how does the payment flow work?').budget;

    expect(budget.limit).toBe(20_000);
    expect(budget.source).toBe('adaptive');
  });

  it('treats an explicit zero budget as unlimited', () => {
    expect(plan('PaymentService.refund', { maxTokens: 0 }).budget.limit).toBe(0);
  });

  it('derives candidate limits independently from the final token budget', () => {
    const result = plan('PaymentService.refund', { limit: 7, maxTokens: 1 });

    expect(result.candidateLimits).toEqual({ retrieval: 7 });
    expect(result.budget.limit).toBe(1);
  });

  it('throws QueryPlanError for an empty query', () => {
    expect(() => plan('   ')).toThrowError(
      'Query plan could not be produced for "   ": query must not be empty.',
    );
  });

  it('throws QueryPlanError for a negative budget', () => {
    expect(() => plan('retry', { maxTokens: -1 })).toThrowError(
      'Query plan could not be produced for "retry": budget must be a non-negative finite number.',
    );
  });

  it('throws QueryPlanError for a non-numeric budget', () => {
    expect(() => plan('retry', { maxTokens: 'unlimited' as unknown as number })).toThrow(
      QueryPlanError,
    );
  });

  it('rejects malformed filter arrays instead of dropping constraints', () => {
    expect(() => plan('retry', { filter: { must: 'not-an-array' } })).toThrow(QueryPlanError);
  });

  it('rejects conflicting filter sources instead of choosing one silently', () => {
    expect(() =>
      plan('retry', {
        filter: { mode: 'strict' },
        userFilters: { mode: 'broad' },
      }),
    ).toThrow(QueryPlanError);
  });

  describe('classifier migration coverage', () => {
    it.each([
      'payment retry logic',
      'how does authentication work',
      'order processing workflow steps',
    ])('maps natural-language query %j to a conceptual semantic route', (query) => {
      const result = plan(query);

      expect(result.intent).toBe('conceptual');
      expect(result.route).toBe('semantic');
      expect(result.branches).toContain('semantic');
    });

    it('maps a breadth query to the aggregation route', () => {
      const result = plan('find all database connection handling');

      expect(result.intent).toBe('aggregation');
      expect(result.route).toBe('aggregation');
      expect(result.branches).toEqual(['semantic']);
    });

    it.each([
      'PaymentService.processPayment',
      'com.example.PaymentService',
      'UserRepository::findById',
      'OrderController.createOrder',
    ])('maps qualified symbol query %j to exact-symbol branches', (query) => {
      const result = plan(query);

      expect(result.intent).toBe('exact_symbol');
      expect(result.route).toBe('keyword');
      expect(result.branches).toEqual(['signature', 'sparse']);
    });

    it.each(['FiGatewayClient', 'PaymentService', 'PAYMENT_RETRY_MAX'])
      ('maps identifier query %j to exact-symbol branches', (query) => {
        const result = plan(query);

        expect(result.intent).toBe('exact_symbol');
        expect(result.branches).toEqual(['signature', 'sparse']);
      });

    it.each(['how does PaymentService handle retries', 'error handling in OrderController'])
      ('keeps structural evidence on conceptual query %j', (query) => {
        const result = plan(query);

        expect(result.intent).toBe('conceptual');
        expect(result.route).toBe('semantic');
        expect(result.branches).toEqual(['semantic', 'signature', 'sparse']);
      });

    it('keeps a single lowercase word on the semantic branch', () => {
      const result = plan('payment');

      expect(result.intent).toBe('conceptual');
      expect(result.route).toBe('semantic');
      expect(result.branches).toEqual(['semantic']);
    });

    it.each([
      'tests for EntryService',
      'unit test for payment processing',
      'how is EntryService tested',
      'test cases for retry logic',
    ])('includes test-oriented results for %j', (query) => {
      expect(plan(query).filter.excludeTests).toBe(false);
    });

    it.each(['spec for PaymentController', 'test coverage for module', 'find test helpers for entry', 'mock implementation of gateway'])
      ('includes test-oriented results for %j', (query) => {
        expect(plan(query).filter.excludeTests).toBe(false);
      });

    it.each([
      'how is Entry created',
      'payment retry logic',
      'EntryService.createEntry',
      'where is the latest version',
      'attestation service',
      'contest results handler',
    ])
      ('excludes test results for non-test query %j', (query) => {
        expect(plan(query).filter.excludeTests).toBe(true);
      });
  });
});
