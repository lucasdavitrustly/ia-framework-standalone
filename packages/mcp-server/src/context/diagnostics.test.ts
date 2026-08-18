import { beforeEach, describe, expect, it } from 'vitest';
import { DIAGNOSTIC_KEYS, buildDiagnostics, diagnosticsAnomalyLines, cacheFingerprint } from './diagnostics.js';
import { estimateTokens } from '@ia-framework/core';
import {
  searchCodebaseHandler,
  resetSearchSessionCache,
  resetContractVerdictCache,
  registerContractGate,
} from '../tools/search-codebase.js';
import type { RetrievalResult } from '@ia-framework/retrieval';
import { QueryPlanner } from '@ia-framework/retrieval';
import type { VectorBranch } from '@ia-framework/core';

function result(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'diagnostic-chunk',
    filePath: '/repo/src/service.ts',
    relativePath: 'src/service.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'loadPayment',
    content: 'function loadPayment() {}',
    startLine: 1,
    endLine: 3,
    imports: [],
    exports: [],
    score: 0.9,
    matchedVector: 'semantic',
    ...overrides,
  };
}

function engine(results: RetrievalResult[] = [result()]) {
  return {
    search: vi.fn().mockResolvedValue(results),
    searchWithExpansion: vi.fn().mockResolvedValue(results),
  };
}

import { vi } from 'vitest';

describe('diagnostics', () => {
  beforeEach(() => {
    // The contract-gate verdict cache is module-level: without this a refusal
    // registered by one test leaks into every later handler call.
    resetContractVerdictCache();
    resetSearchSessionCache();
  });

  it('defines exactly the 13 required fields', () => {
    expect(DIAGNOSTIC_KEYS).toEqual([
      'route',
      'executed_branches',
      'fallback_mode',
      'candidate_count',
      'selected_count',
      'deduplicated_count',
      'omitted_count',
      'expansion_count',
      'stale_count',
      'estimated_tokens',
      'configured_budget',
      'compaction_count',
      'exact_node_overflow',
    ]);
  });

  it('builds a uniform diagnostics object for an ordinary response', () => {
    const diagnostics = buildDiagnostics({
      route: 'semantic',
      executedBranches: ['semantic'],
      fallbackMode: null,
      candidateCount: 3,
      selectedCount: 2,
      deduplicatedCount: 1,
      omittedCount: 1,
      expansionCount: 1,
      staleCount: 0,
      estimatedTokens: 100,
      configuredBudget: 8_000,
      compactionCount: 0,
      exactNodeOverflow: false,
    });
    expect(Object.keys(diagnostics).sort()).toEqual([...DIAGNOSTIC_KEYS].sort());
  });

  it('uses only actually executed branches', () => {
    const diagnostics = buildDiagnostics({
      route: 'keyword',
      executedBranches: ['signature'],
      fallbackMode: 'none',
      candidateCount: 1,
      selectedCount: 1,
      deduplicatedCount: 0,
      omittedCount: 0,
      expansionCount: 0,
      staleCount: 0,
      estimatedTokens: 5,
      configuredBudget: 8_000,
      compactionCount: 0,
      exactNodeOverflow: false,
    });
    expect(diagnostics.executed_branches).toEqual(['signature']);
  });

  it('emits no anomaly lines for a clean response', () => {
    expect(diagnosticsAnomalyLines({ status: 'ok', exactNodeOverflow: false })).toEqual([]);
  });

  it('emits degradation and overflow lines only when those states occur', () => {
    expect(
      diagnosticsAnomalyLines({ status: 'unavailable', exactNodeOverflow: true }),
    ).toEqual(['Degraded: retrieval is unavailable.', 'Exact node exceeded the configured budget.']);
  });

  it('changes the cache fingerprint when any request state changes', () => {
    const base = { query: 'payment', planFingerprint: 'a', expansion: 0, budget: 8_000, indexGeneration: '1' };
    expect(cacheFingerprint(base)).not.toBe(cacheFingerprint({ ...base, expansion: 1 }));
    expect(cacheFingerprint(base)).not.toBe(cacheFingerprint({ ...base, budget: 20_000 }));
    expect(cacheFingerprint(base)).not.toBe(cacheFingerprint({ ...base, indexGeneration: '2' }));
  });

  it('returns the same fingerprint for equivalent canonical input', () => {
    const input = { query: 'payment', planFingerprint: 'a', expansion: 0, budget: 8_000, indexGeneration: '1' };
    expect(cacheFingerprint(input)).toBe(cacheFingerprint({ ...input }));
  });

  it('emits the complete diagnostic set on the semantic route', async () => {
    const output = await searchCodebaseHandler(engine(), { query: 'how does payment work', expand_hops: 0 });
    expect(Object.keys(output.structuredContent as object).filter((key) => DIAGNOSTIC_KEYS.includes(key as never)).sort()).toEqual([...DIAGNOSTIC_KEYS].sort());
  });

  it('emits the complete diagnostic set on the keyword route', async () => {
    const output = await searchCodebaseHandler(engine(), { query: 'PaymentService', expand_hops: 0 });
    expect(Object.keys(output.structuredContent as object).filter((key) => DIAGNOSTIC_KEYS.includes(key as never)).sort()).toEqual([...DIAGNOSTIC_KEYS].sort());
  });

  it('emits the complete diagnostic set on the existence route', async () => {
    // L-010: asserted against a NON-EMPTY engine — engine([]) made this vacuous.
    const output = await searchCodebaseHandler(engine(), { query: 'is there a retry mechanism' });
    expect(Object.keys(output.structuredContent as object).filter((key) => DIAGNOSTIC_KEYS.includes(key as never)).sort()).toEqual([...DIAGNOSTIC_KEYS].sort());
    // BUD-16: source-free — the fixture genuinely has content, so its absence is real.
    expect(result().content).toBe('function loadPayment() {}');
    expect((output.content[0] as { text: string }).text).not.toContain('function loadPayment() {}');
    expect((output.content[0] as { text: string }).text).not.toContain('```');
    // ...and fully accounted against the budget.
    expect((output.structuredContent as Record<string, unknown>).estimated_tokens as number).toBeGreaterThan(0);
  });

  it('emits the complete diagnostic set on the aggregation route', async () => {
    // L-010: asserted against a NON-EMPTY engine — engine([]) made this vacuous.
    const output = await searchCodebaseHandler(engine(), { query: 'find all services' });
    expect(Object.keys(output.structuredContent as object).filter((key) => DIAGNOSTIC_KEYS.includes(key as never)).sort()).toEqual([...DIAGNOSTIC_KEYS].sort());
    expect(result().content).toBe('function loadPayment() {}');
    expect((output.content[0] as { text: string }).text).not.toContain('function loadPayment() {}');
    expect((output.content[0] as { text: string }).text).not.toContain('```');
    expect((output.structuredContent as Record<string, unknown>).estimated_tokens as number).toBeGreaterThan(0);
  });

  it('keeps diagnostics out of the prose evidence body', async () => {
    const output = await searchCodebaseHandler(engine(), { query: 'how does payment work', expand_hops: 0 });
    const text = (output.content[0] as { text: string }).text;
    expect(text).not.toContain('candidate_count');
    expect(text).not.toContain('estimated_tokens');
    expect(text).not.toContain('configured_budget');
  });

  it('reports only executed branches when sparse capability is unavailable', async () => {
    const target = engine();
    const output = await searchCodebaseHandler(
      { ...target, capabilities: () => ({ sparse: false, filterOnly: true, payloadIndexes: [] }) },
      { query: 'PaymentService', expand_hops: 0 },
    );
    expect((output.structuredContent as Record<string, unknown>).executed_branches).not.toContain('sparse');
  });

  // ── F4.1: executed vs planned branch provenance (SPR-04, SPR-06) ────────────

  /** An engine that reports the branches it actually issued, as SearchEngine does. */
  function reportingEngine(executed: VectorBranch[], results: RetrievalResult[] = [result()]) {
    const report = (query: { onBranchExecuted?: (branch: VectorBranch) => void }) => {
      for (const branch of executed) query.onBranchExecuted?.(branch);
      return results;
    };
    return {
      search: vi.fn().mockImplementation(report),
      searchWithExpansion: vi.fn().mockImplementation(report),
      capabilities: () => ({ sparse: true, filterOnly: true, payloadIndexes: [] }),
    };
  }

  it('excludes a planned-but-skipped sparse branch from executed_branches', async () => {
    // The plan genuinely selects sparse for this query, so its absence from
    // executed_branches is a real distinction, not a fixture artefact.
    const plan = new QueryPlanner().plan(
      { query: 'PaymentService.refund' },
      { sparse: true, filterOnly: true, payloadIndexes: [] },
    );
    expect(plan.branches).toContain('sparse');

    // The engine skipped sparse (e.g. empty sparse vector) and reports only signature.
    const output = await searchCodebaseHandler(reportingEngine(['signature']), {
      query: 'PaymentService.refund',
      expand_hops: 0,
    });

    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.executed_branches).toEqual(['signature']);
    expect(structured.executed_branches).not.toContain('sparse');
  });

  it('reports a branch that executed and returned zero results', async () => {
    // Distinguishable from the skipped case above on the serialized response:
    // the branch appears in executed_branches while selected_count stays 0.
    const output = await searchCodebaseHandler(reportingEngine(['signature', 'sparse'], []), {
      query: 'PaymentService.refund',
      expand_hops: 0,
      fallback: false,
    });

    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.executed_branches).toEqual(['signature', 'sparse']);
    expect(structured.selected_count).toBe(0);
  });

  it('never reports a sparse branch for an adapter without sparse capability', async () => {
    // SPR-06: the plan cannot select sparse, so nothing can execute it.
    const target = reportingEngine(['signature']);
    const output = await searchCodebaseHandler(
      { ...target, capabilities: () => ({ sparse: false, filterOnly: true, payloadIndexes: [] }) },
      { query: 'PaymentService.refund', expand_hops: 0 },
    );

    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.executed_branches).toEqual(['signature']);
  });

  it('does not reuse a cache entry when expansion changes', async () => {
    resetSearchSessionCache();
    const target = engine();
    const options = { sessionCache: { enabled: true } as const };
    await searchCodebaseHandler(target, { query: 'payment', expand_hops: 0 }, options);
    await searchCodebaseHandler(target, { query: 'payment', expand_hops: 1 }, options);
    expect(target.searchWithExpansion).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a cache entry when budget changes', async () => {
    resetSearchSessionCache();
    const target = engine();
    await searchCodebaseHandler(target, { query: 'payment' }, { sessionCache: { enabled: true }, maxTokensPerCall: 8_000 });
    await searchCodebaseHandler(target, { query: 'payment' }, { sessionCache: { enabled: true }, maxTokensPerCall: 20_000 });
    expect(target.searchWithExpansion).toHaveBeenCalledTimes(2);
  });

  it('invalidates a cache entry when index generation changes', async () => {
    resetSearchSessionCache();
    const target = engine();
    await searchCodebaseHandler(target, { query: 'payment' }, { sessionCache: { enabled: true }, indexGeneration: '1' });
    await searchCodebaseHandler(target, { query: 'payment' }, { sessionCache: { enabled: true }, indexGeneration: '2' });
    expect(target.searchWithExpansion).toHaveBeenCalledTimes(2);
  });

  it('returns the full response on a cache hit', async () => {
    resetSearchSessionCache();
    const target = engine();
    const options = { sessionCache: { enabled: true } as const };
    const first = await searchCodebaseHandler(target, { query: 'payment' }, options);
    const second = await searchCodebaseHandler(target, { query: 'payment' }, options);
    expect((second.content[0] as { text: string }).text).toBe((first.content[0] as { text: string }).text);
    expect(second.structuredContent).toEqual(first.structuredContent);
  });

  it('does not duplicate source snippets inside diagnostics', async () => {
    const output = await searchCodebaseHandler(engine([result({ content: 'UNIQUE_SOURCE_SNIPPET' })]), { query: 'payment' });
    expect(JSON.stringify(output.structuredContent)).not.toContain('UNIQUE_SOURCE_SNIPPET');
  });

  it('reports candidate and selected counts for a non-empty response', async () => {
    const output = await searchCodebaseHandler(engine(), { query: 'payment' });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.candidate_count).toBeGreaterThan(0);
    expect(structured.selected_count).toBeGreaterThan(0);
  });

  it('reports expansion count separately from candidate count', async () => {
    const output = await searchCodebaseHandler(engine([result({ expansionSource: 'hierarchy' })]), { query: 'payment' });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.expansion_count).toBe(1);
    expect(structured.candidate_count).toBeGreaterThanOrEqual(structured.expansion_count as number);
  });

  // ── F4.2: real deduplicated_count (BUD-15, CTX-13) ──────────────────────────

  it('reports the exact number of results collapsed by deduplication', async () => {
    // CTX-13 class: identical chunk identifiers — 3 duplicates collapse to 1.
    const duplicates = [result(), result(), result()];
    const output = await searchCodebaseHandler(engine(duplicates), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.deduplicated_count).toBe(2);
    expect(structured.selected_count).toBe(1);
  });

  it('reports zero deduplicated when no results collapse', async () => {
    const distinct = [
      result({ chunkId: 'a', relativePath: 'src/a.ts', startLine: 1, endLine: 3 }),
      result({ chunkId: 'b', relativePath: 'src/b.ts', startLine: 10, endLine: 12 }),
    ];
    const output = await searchCodebaseHandler(engine(distinct), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.deduplicated_count).toBe(0);
    expect(structured.selected_count).toBe(2);
  });

  it('counts the same source region arriving from different collections once', async () => {
    // CTX-13 class: duplicate results for the same region from different collections.
    const sameRegion = [
      result({ chunkId: 'ast-1', source: 'ast' }),
      result({ chunkId: 'llm-1', source: 'llm' }),
    ];
    const output = await searchCodebaseHandler(engine(sameRegion), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.deduplicated_count).toBe(1);
    expect(structured.selected_count).toBe(1);
  });

  it('counts overlapping line ranges from one file as deduplicated', async () => {
    // CTX-13 class: overlapping line ranges merge rather than both surviving.
    const overlapping = [
      result({ chunkId: 'range-1', startLine: 10, endLine: 20 }),
      result({ chunkId: 'range-2', startLine: 15, endLine: 25 }),
    ];
    const output = await searchCodebaseHandler(engine(overlapping), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.deduplicated_count).toBe(1);
    expect(structured.selected_count).toBe(1);
  });

  // ── F4.3: full diagnostics on failure responses (BUD-15, context.md #4) ──────

  function diagnosticKeysOf(output: { structuredContent?: unknown }): string[] {
    return Object.keys(output.structuredContent as object)
      .filter((key) => DIAGNOSTIC_KEYS.includes(key as never))
      .sort();
  }

  /** An engine whose retrieval is entirely unavailable — the FAIL-06 'unavailable' state. */
  function brokenEngine(message: string) {
    const fail = vi.fn().mockRejectedValue(new Error(message));
    return { search: fail, searchWithExpansion: fail };
  }

  it('emits the complete diagnostic set on an unavailable response', async () => {
    const output = await searchCodebaseHandler(brokenEngine('Qdrant connection refused'), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.status).toBe('unavailable');
    expect(diagnosticKeysOf(output)).toEqual([...DIAGNOSTIC_KEYS].sort());
  });

  it('emits the complete diagnostic set on a refused response', async () => {
    // The gate mechanism is production code; F2.3 proves the real ContractStore
    // produces exactly this error. Here the concern is the response shape.
    resetContractVerdictCache();
    registerContractGate('ast-collection', () =>
      Promise.reject(
        new Error(
          'collection ast-collection has an unknown embedding contract; run ia index --force',
        ),
      ),
    );

    const output = await searchCodebaseHandler(engine(), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.status).toBe('refused');
    expect(diagnosticKeysOf(output)).toEqual([...DIAGNOSTIC_KEYS].sort());
  });

  it('emits the complete diagnostic set on a plan failure', async () => {
    // An empty query cannot be planned — QueryPlanner throws before any route runs.
    const output = await searchCodebaseHandler(engine(), { query: '   ' });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.status).toBe('refused');
    expect(structured.plan_error).toBe(true);
    expect(diagnosticKeysOf(output)).toEqual([...DIAGNOSTIC_KEYS].sort());
  });

  it('reports honest zero counts and no executed branches on a failure response', async () => {
    const output = await searchCodebaseHandler(brokenEngine('Qdrant connection refused'), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.executed_branches).toEqual([]);
    expect(structured.candidate_count).toBe(0);
    expect(structured.selected_count).toBe(0);
    expect(structured.deduplicated_count).toBe(0);
    expect(structured.expansion_count).toBe(0);
    expect(structured.exact_node_overflow).toBe(false);
  });

  it('keeps cause and remediation in a failure body and endorses no shell fallback', async () => {
    const output = await searchCodebaseHandler(brokenEngine('Qdrant connection refused'), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const text = (output.content[0] as { text: string }).text;
    // CTX-09 / FAIL-02: cause + remediation, and never a grep/find suggestion.
    expect(text).toContain('Qdrant connection refused');
    expect(text).toContain('verify Qdrant availability');
    expect(text).not.toContain('grep');
    expect(text).not.toContain('find ');
  });

  it('reports the configured budget on a failure response that has a plan', async () => {
    // The plan survived; only retrieval failed — so the budget it resolved is real.
    const output = await searchCodebaseHandler(brokenEngine('Qdrant connection refused'), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.configured_budget).toBeGreaterThan(0);
    expect(structured.route).toBe('semantic');
  });

  // ── F5.2: failure responses account their own cost (FAIL-07) ─────────────────

  /** A conservative measurement of what the caller actually receives. */
  function measuredCost(output: { content: unknown; structuredContent?: unknown }): number {
    return estimateTokens(
      JSON.stringify({
        ...output,
        structuredContent: {
          ...(output.structuredContent as Record<string, unknown>),
          estimated_tokens: 999_999_999,
        },
      }),
    );
  }

  it('reports a non-zero measured estimated_tokens on an unavailable response', async () => {
    const output = await searchCodebaseHandler(brokenEngine('Qdrant connection refused'), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.status).toBe('unavailable');
    expect(structured.estimated_tokens as number).toBeGreaterThan(0);
    // BUD-13: conservative — never under-reports the real serialized cost.
    expect(structured.estimated_tokens as number).toBeGreaterThanOrEqual(measuredCost(output));
  });

  it('reports a non-zero measured estimated_tokens on a refused response', async () => {
    registerContractGate('ast-collection', () =>
      Promise.reject(
        new Error(
          'collection ast-collection has an unknown embedding contract; run ia index --force',
        ),
      ),
    );

    const output = await searchCodebaseHandler(engine(), {
      query: 'how does payment work',
      expand_hops: 0,
    });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.status).toBe('refused');
    expect(structured.estimated_tokens as number).toBeGreaterThan(0);
    expect(structured.estimated_tokens as number).toBeGreaterThanOrEqual(measuredCost(output));
  });

  it('reports a non-zero measured estimated_tokens on a plan failure', async () => {
    const output = await searchCodebaseHandler(engine(), { query: '   ' });
    const structured = output.structuredContent as Record<string, unknown>;
    expect(structured.plan_error).toBe(true);
    expect(structured.estimated_tokens as number).toBeGreaterThan(0);
    expect(structured.estimated_tokens as number).toBeGreaterThanOrEqual(measuredCost(output));
  });

  it('keeps every failure body under the compactness ceiling (FAIL-07)', async () => {
    // FAIL-07: failure information must not consume the context budget
    // unnecessarily. 256 tokens is the DIAGNOSTICS_RESERVATION-sized ceiling: a
    // failure response must fit inside what diagnostics alone are allowed.
    const outputs = [
      await searchCodebaseHandler(brokenEngine('Qdrant connection refused'), {
        query: 'how does payment work',
        expand_hops: 0,
      }),
      await searchCodebaseHandler(engine(), { query: '   ' }),
    ];

    for (const output of outputs) {
      const structured = output.structuredContent as Record<string, unknown>;
      expect(structured.estimated_tokens as number).toBeLessThanOrEqual(256);
    }
  });
});
