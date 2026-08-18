import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from '../search-codebase.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

function makeResult(score: number, id = 'chunk-1'): RetrievalResult {
  return {
    chunkId: id,
    filePath: `/project/src/${id}.ts`,
    relativePath: `src/${id}.ts`,
    language: 'typescript',
    chunkType: 'function',
    name: id,
    content: `function ${id}() {}`,
    startLine: 1,
    endLine: 1,
    imports: [],
    exports: [],
    score,
    matchedVector: 'text',
  };
}

// ---------------------------------------------------------------------------
// Existing tests: engine call still receives undefined scoreThreshold
// ---------------------------------------------------------------------------

describe('searchCodebaseHandler — engine call (no server-side threshold)', () => {
  it('passes undefined scoreThreshold to engine when user provides no score_threshold', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([makeResult(0.8)]);
    const engine = { search: vi.fn(), searchWithExpansion };

    await searchCodebaseHandler(engine, {
      query: 'explain how authentication works in the system',
    });

    expect(searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({ scoreThreshold: undefined }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('passes explicit score_threshold through when user provides one', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([makeResult(0.8)]);
    const engine = { search: vi.fn(), searchWithExpansion };

    await searchCodebaseHandler(engine, {
      query: 'explain how authentication works in detail',
      score_threshold: 0.5,
    });

    expect(searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({ scoreThreshold: 0.5 }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// New tests: client-side score filtering with default 0.5
// ---------------------------------------------------------------------------

describe('searchCodebaseHandler — client-side score filtering (default 0.5)', () => {
  it('filters out results below 0.5 by default (scores 0.3, 0.4 removed; 0.6, 0.8 kept)', async () => {
    const results = [
      makeResult(0.3, 'a'),
      makeResult(0.4, 'b'),
      makeResult(0.6, 'c'),
      makeResult(0.8, 'd'),
    ];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(engine, {
      query: 'explain how the system processes data internally',
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/c.ts');
    expect(text).toContain('src/d.ts');
    expect(text).not.toContain('src/a.ts');
    expect(text).not.toContain('src/b.ts');
    expect(output.structuredContent).toMatchObject({ answered: true });
  });

  it('returns all results when score_threshold=0 (filtering disabled)', async () => {
    const results = [makeResult(0.1, 'low1'), makeResult(0.2, 'low2'), makeResult(0.9, 'high')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(engine, {
      query: 'explain how the system processes data internally',
      score_threshold: 0,
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/low1.ts');
    expect(text).toContain('src/low2.ts');
    expect(text).toContain('src/high.ts');
  });

  it('applies user-supplied score_threshold=0.7 (only >= 0.7 returned)', async () => {
    const results = [makeResult(0.5, 'mid'), makeResult(0.7, 'target'), makeResult(0.9, 'high')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(engine, {
      query: 'explain how the system processes data internally',
      score_threshold: 0.7,
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/target.ts');
    expect(text).toContain('src/high.ts');
    expect(text).not.toContain('src/mid.ts');
  });

  it('uses config defaultScoreThreshold when no input override (config=0.6, scores 0.5 filtered)', async () => {
    const results = [makeResult(0.5, 'low'), makeResult(0.6, 'ok'), makeResult(0.8, 'high')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'explain how the system processes data internally' },
      {
        defaultScoreThreshold: 0.6,
      },
    );
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/ok.ts');
    expect(text).toContain('src/high.ts');
    expect(text).not.toContain('src/low.ts');
  });

  it('score filtering happens BEFORE token cap (token cap receives the filtered list)', async () => {
    // Provide many results; low-score ones below 0.5 should be removed before token cap runs
    const results = [
      makeResult(0.9, 'keep1'),
      makeResult(0.8, 'keep2'),
      makeResult(0.2, 'drop1'),
      makeResult(0.1, 'drop2'),
    ];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    // Very tight token budget — only 1 result fits (~4 tokens per char, content ~20 chars → ~5 tokens)
    // If filtering happens BEFORE cap, cap receives [keep1, keep2] (2 results)
    // If filtering happened AFTER cap, cap might include low-score results
    const output = await searchCodebaseHandler(
      engine,
      { query: 'explain how the system processes data internally' },
      {
        maxTokensPerCall: 10, // tight budget
      },
    );
    const text = (output.content[0] as { type: string; text: string }).text;

    // With tight budget, at most 1 result returned — it must be a high-score one
    expect(text).not.toContain('src/drop1.ts');
    expect(text).not.toContain('src/drop2.ts');
  });
});

// ---------------------------------------------------------------------------
// Anti-hallucination instructional message (Task 2)
// ---------------------------------------------------------------------------

describe('searchCodebaseHandler — anti-hallucination message when threshold filters all results', () => {
  it('shows instructional anti-hallucination message when threshold removes all results and no fallback', async () => {
    const results = [makeResult(0.2, 'low1'), makeResult(0.3, 'low2')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    // Default 0.5 threshold removes all; no searchWithFallback on engine
    const output = await searchCodebaseHandler(engine, {
      query: 'explain how authentication works in the system',
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('Do not guess or hallucinate');
    expect(output.structuredContent).toMatchObject({ answered: false, threshold_filtered: true });
  });

  it('still attempts fallback when threshold filters all results (D-05 preserved)', async () => {
    const lowResults = [makeResult(0.2, 'low1')];
    const searchWithExpansion = vi.fn().mockResolvedValue(lowResults);
    const fallbackSuggestions = [
      { file: 'src/auth.ts', name: 'authenticate', snippet: 'function authenticate(token) {' },
    ];
    const fallbackResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: fallbackSuggestions,
    };
    const searchWithFallback = vi.fn().mockResolvedValue(fallbackResult);
    const engine = { search: vi.fn(), searchWithExpansion, searchWithFallback };

    const output = await searchCodebaseHandler(engine, {
      query: 'explain how authentication works in the system',
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    // Fallback suggestions returned — no anti-hallucination message needed
    expect(text).toContain('Closest related code');
    expect(text).not.toContain('Do not guess or hallucinate');
    expect(output.structuredContent).toMatchObject({ answered: false });
  });

  it('returns normal response when some results pass threshold (no instructional message)', async () => {
    const results = [makeResult(0.3, 'low'), makeResult(0.7, 'high')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(engine, {
      query: 'explain how request handling works internally',
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).not.toContain('Do not guess or hallucinate');
    expect(output.structuredContent).toMatchObject({ answered: true });
  });
});
