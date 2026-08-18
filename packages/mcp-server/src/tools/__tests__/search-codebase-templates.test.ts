import { afterEach, describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from '../search-codebase.js';
import type { SearchCodebaseInput } from '../search-codebase.js';
import { QueryPlanner, type PlannedQuery, type RetrievalResult } from '@ia-framework/retrieval';

const mockResult: RetrievalResult = {
  chunkId: 'chunk-1',
  filePath: '/project/src/user.ts',
  relativePath: 'src/user.ts',
  language: 'typescript',
  chunkType: 'class',
  name: 'User',
  content: 'class User {}',
  startLine: 1,
  endLine: 1,
  imports: [],
  exports: [],
  score: 0.85,
  matchedVector: 'text',
};

function makeEngine(results: RetrievalResult[] = [mockResult]) {
  return {
    search: vi.fn().mockResolvedValue(results),
    searchWithExpansion: vi.fn().mockResolvedValue(results),
  };
}

function getText(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content[0];
  return item?.type === 'text' ? (item.text ?? '') : '';
}

describe('search-codebase template injection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prepends impact-analysis template before code results for impact query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
    };
    const result = await searchCodebaseHandler(engine, input);

    const text = getText(result);
    expect(text).toContain('List affected files in dependency order');
    expect(text).toContain('## Code results');
    // Template should appear BEFORE code results
    const templateIdx = text.indexOf('List affected files');
    const codeIdx = text.indexOf('## Code results');
    expect(templateIdx).toBeLessThan(codeIdx);
  });

  it('includes intent_detected in structuredContent for impact query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
    };
    const result = await searchCodebaseHandler(engine, input);

    expect(result.structuredContent).toBeDefined();
    expect((result.structuredContent as Record<string, unknown>).intent_detected).toBe(
      'impact-analysis',
    );
  });

  it('does not inject template for non-matching query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = { query: 'how does authentication work' };
    const result = await searchCodebaseHandler(engine, input);

    const text = getText(result);
    expect(text).not.toContain('List affected files');
    expect(text).not.toContain('dependency chain');
    expect((result.structuredContent as Record<string, unknown>)?.intent_detected).toBeUndefined();
  });

  it('suppresses template when use_template is false', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
      use_template: false,
    };
    const result = await searchCodebaseHandler(engine, input);

    const text = getText(result);
    expect(text).not.toContain('List affected files');
    expect((result.structuredContent as Record<string, unknown>)?.intent_detected).toBeUndefined();
  });

  it('does not inject template when zero results', async () => {
    const engine = makeEngine([]);
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
    };
    const result = await searchCodebaseHandler(engine, input);

    const text = getText(result);
    expect(text).not.toContain('List affected files');
  });

  it('prepends dependency-trace template for dependency query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = { query: 'what uses this function' };
    const result = await searchCodebaseHandler(engine, input);

    const text = getText(result);
    expect(text).toContain('tracing dependencies');
    expect((result.structuredContent as Record<string, unknown>).intent_detected).toBe(
      'dependency-trace',
    );
  });

  it('builds exactly one plan and passes that instance to expansion search', async () => {
    const engine = makeEngine();
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    await searchCodebaseHandler(engine, { query: 'how are payments retried?' });

    expect(planSpy).toHaveBeenCalledTimes(1);
    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(engine.searchWithExpansion.mock.calls[0]?.[3]).toBe(plan);
  });

  it('reports the same route and branches that the engine receives in the plan', async () => {
    const engine = makeEngine();
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    const result = await searchCodebaseHandler(engine, { query: 'PaymentService.refund' });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.route).toBe(plan.route);
    expect(structured.branches).toEqual(plan.branches);
    expect(engine.search).toHaveBeenCalled();
  });

  it('routes exact-symbol queries from plan.route without MCP classification', async () => {
    const searchWithFallback = vi.fn().mockResolvedValue({
      results: [mockResult],
      suggestions: [],
      fallback_used: false,
      fallback_mode: 'none',
    });
    const searchWithExpansion = vi.fn().mockResolvedValue([]);
    const engine = { search: vi.fn(), searchWithExpansion, searchWithFallback };
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    const result = await searchCodebaseHandler(engine, { query: 'UserService' });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(plan.route).toBe('keyword');
    expect(searchWithFallback).toHaveBeenCalled();
    expect(searchWithFallback.mock.calls[0]?.[2]).toBe(plan);
    expect((result.structuredContent as Record<string, unknown>).route).toBe('keyword');
  });

  it('passes the plan to the search fallback after expansion fails', async () => {
    const searchWithExpansion = vi.fn().mockRejectedValue(new Error('expansion unavailable'));
    const search = vi.fn().mockResolvedValue([mockResult]);
    const engine = { search, searchWithExpansion };
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    await searchCodebaseHandler(engine, {
      query: 'payment retry logic',
      repo: 'payments',
      stereotype: 'service',
      archLayer: 'domain',
      module: 'billing',
      language: 'typescript',
      expand_hops: 2,
    });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(search.mock.calls[0]?.[1]).toBe(plan);
    expect(plan.filter.repoId).toBe('payments');
    expect(plan.filter.userFilters.must).toEqual(
      expect.arrayContaining([
        { key: 'stereotype', match: { value: 'service' } },
        { key: 'archLayer', match: { value: 'domain' } },
        { key: 'moduleInfo.module', match: { value: 'billing' } },
        { key: 'language', match: { value: 'typescript' } },
      ]),
    );
    expect(plan.expansion).toEqual({ hops: 2 });
  });

  it('preserves every explicit constraint when forced fallback search is called', async () => {
    const searchWithExpansion = vi.fn().mockRejectedValue(new Error('graph unavailable'));
    const search = vi.fn().mockResolvedValue([mockResult]);
    const engine = { search, searchWithExpansion };

    await searchCodebaseHandler(engine, {
      query: 'how does payment flow work?',
      repo: 'payments',
      stereotype: 'service',
      archLayer: 'service',
      module: 'payments-core',
      language: 'typescript',
      expand_hops: 1,
    });

    const fallbackQuery = search.mock.calls[0]?.[0] as { filter?: { must?: unknown[] } };
    expect(fallbackQuery.filter?.must).toEqual(
      expect.arrayContaining([
        { key: 'repoId', match: { value: 'payments' } },
        { key: 'stereotype', match: { value: 'service' } },
        { key: 'archLayer', match: { value: 'service' } },
        { key: 'moduleInfo.module', match: { value: 'payments-core' } },
        { key: 'language', match: { value: 'typescript' } },
      ]),
    );
  });

  it('derives the template id for planning while keeping template text out of representations', async () => {
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    const result = await searchCodebaseHandler(makeEngine(), {
      query: 'what files need updating if I change the User model',
    });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(plan.templateId).toBe('impact-analysis');
    expect(JSON.stringify(plan.representations)).not.toContain('List affected files');
    expect(JSON.stringify(plan.representations)).not.toContain('impact-analysis');
    expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
      'List affected files',
    );
  });

  it('never sends response template text as the engine query representation', async () => {
    const engine = makeEngine();
    const queryTexts: string[] = [];
    engine.searchWithExpansion.mockImplementation((query: { text: string }) => {
      queryTexts.push(query.text);
      return Promise.resolve([mockResult]);
    });

    await searchCodebaseHandler(engine, {
      query: 'what files need updating if I change the User model',
    });

    expect(queryTexts).toEqual(['what files need updating if I change the User model']);
    expect(queryTexts.join('\n')).not.toContain('List affected files');
  });

  it('uses plan.templateId to select the dependency-trace response template', async () => {
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    const result = await searchCodebaseHandler(makeEngine(), { query: 'what uses this function' });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(plan.templateId).toBe('dependency-trace');
    expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
      'tracing dependencies',
    );
  });

  it('uses the shared plan for existence routing', async () => {
    const searchWithFallback = vi.fn().mockResolvedValue({
      results: [mockResult],
      suggestions: [],
      fallback_used: false,
      fallback_mode: 'none',
    });
    const engine = { search: vi.fn(), searchWithFallback, searchWithExpansion: vi.fn() };
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    const result = await searchCodebaseHandler(engine, {
      query: 'is there a retry mechanism',
    });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(plan.route).toBe('existence');
    expect(searchWithFallback.mock.calls[0]?.[2]).toBe(plan);
    expect((result.structuredContent as Record<string, unknown>).route).toBe('existence');
  });

  it('uses the shared plan for aggregation routing', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([mockResult]);
    const engine = { search: vi.fn(), searchWithExpansion };
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    const result = await searchCodebaseHandler(engine, { query: 'find all services' });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(plan.route).toBe('aggregation');
    expect(searchWithExpansion.mock.calls[0]?.[3]).toBe(plan);
    expect((result.structuredContent as Record<string, unknown>).route).toBe('aggregation');
  });

  it('preserves the original query verbatim in the shared plan', async () => {
    const query = '  PaymentService.refund  ';
    const planSpy = vi.spyOn(QueryPlanner.prototype, 'plan');

    await searchCodebaseHandler(makeEngine(), { query });

    const plan = planSpy.mock.results[0]?.value as PlannedQuery;
    expect(plan.originalQuery).toBe(query);
  });

  it('returns an actionable refusal when planning fails', async () => {
    const engine = makeEngine();

    const result = await searchCodebaseHandler(engine, { query: '   ' });

    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Query plan could not be produced');
    expect(text).toContain('Suggestion:');
    expect(result.structuredContent).toMatchObject({
      status: 'refused',
      plan_error: true,
      answered: false,
    });
    expect(engine.searchWithExpansion).not.toHaveBeenCalled();
  });

  it('does not silently clamp invalid expansion settings during planning', async () => {
    const engine = makeEngine();

    const result = await searchCodebaseHandler(engine, {
      query: 'payment retry logic',
      expand_hops: 3,
    });

    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('expansion hops must be 0, 1, or 2');
    expect(text).toContain('Suggestion:');
    expect(engine.searchWithExpansion).not.toHaveBeenCalled();
  });
});
