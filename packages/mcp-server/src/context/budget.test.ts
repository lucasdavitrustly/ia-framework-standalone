import { describe, expect, it, vi } from 'vitest';
import { TOKEN_ESTIMATE_UNDERREPORT_MARGIN, estimateTokens } from '@ia-framework/core';
import type { ContextItem } from '@ia-framework/core';
import {
  DIAGNOSTICS_RESERVATION,
  SIGNATURE_HEAD_MAX,
  BudgetGovernor,
  estimateItem,
  type BudgetEnforcement,
  type AdaptiveBudget,
} from './budget.js';

function makeItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    priority: 3,
    anchor: {
      relativePath: 'src/service.ts',
      symbol: 'loadPayment',
      startLine: 10,
      endLine: 20,
    },
    form: 'signature',
    text: 'loadPayment(): Payment',
    provenance: { branch: 'signature' },
    ...overrides,
  };
}

describe('BudgetGovernor', () => {
  const governor = new BudgetGovernor();

  it('lets an explicit budget win when it is larger than the adaptive tier', () => {
    expect(governor.resolve({ budget: 100_000 }, 8_000)).toEqual({
      limit: 100_000,
      source: 'explicit',
    });
  });

  it('uses the adaptive budget only when no explicit budget is supplied', () => {
    const adaptive: AdaptiveBudget = { simple: 8_000, moderate: 20_000, complex: 40_000 };
    expect(governor.resolve({}, adaptive.simple).limit).toBe(8_000);
    expect(governor.resolve({}, adaptive.moderate).limit).toBe(20_000);
    expect(governor.resolve({}, adaptive.complex).limit).toBe(40_000);
  });

  it('records whether the resolved budget is explicit or adaptive', () => {
    expect(governor.resolve({}, 8_000).source).toBe('adaptive');
    expect(governor.resolve({ budget: 12_000 }, 8_000).source).toBe('explicit');
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '100'])(
    'rejects invalid explicit budget %p', (budget) => {
      expect(() => governor.resolve({ budget }, 8_000)).toThrow(/budget/i);
    },
  );

  it('exposes the fixed diagnostics reservation', () => {
    expect(DIAGNOSTICS_RESERVATION).toBe(256);
  });

  it('reduces diagnostics reservation deterministically when budget is smaller', () => {
    expect(governor.diagnosticsAllowance(100)).toBe(100);
    expect(governor.diagnosticsAllowance(256)).toBe(256);
    expect(governor.diagnosticsAllowance(1_000)).toBe(256);
  });

  it('returns the remaining evidence budget after reserving diagnostics', () => {
    expect(governor.evidenceBudget(100)).toBe(0);
    expect(governor.evidenceBudget(1_000)).toBe(744);
    expect(governor.evidenceBudget(0)).toBe(0);
  });

  it('does not coerce an explicit numeric string into a budget', () => {
    expect(() => governor.resolve({ budget: '8000' }, 20_000)).toThrow(/number/i);
  });

  it('uses explicit zero instead of adaptive budget', () => {
    expect(governor.resolve({ budget: 0 }, 8_000).source).toBe('explicit');
    expect(governor.resolve({ budget: 0 }, 8_000).limit).toBe(0);
  });

  it('orders enforcement by the seven-level priority ladder, not input order', () => {
    const items = [
      makeItem({ priority: 6, text: 'adjacent' }),
      makeItem({ priority: 4, text: 'summary' }),
      makeItem({ priority: 1, text: 'exact node' }),
      makeItem({ priority: 2, text: 'direct evidence' }),
      makeItem({ priority: 5, text: 'dependency' }),
      makeItem({ priority: 3, text: 'identifier' }),
      makeItem({ priority: 7, text: 'diagnostics' }),
    ];

    const result = governor.enforce(items, governor.resolve({ budget: 0 }, 8_000));

    expect(result.included.map((item) => item.text)).toEqual([
      'exact node',
      'direct evidence',
      'identifier',
      'summary',
      'dependency',
      'adjacent',
      'diagnostics',
    ]);
  });

  it('returns accurate candidate, selected, omitted, and compacted counts', () => {
    const items = [makeItem({ priority: 1, text: 'a' }), makeItem({ priority: 4, text: 'b' })];

    const result = governor.enforce(items, governor.resolve({ budget: 1 }, 8_000));

    expect(result.candidateCount).toBe(2);
    expect(result.selectedCount).toBeGreaterThanOrEqual(1);
    expect(result.omitted).toBeGreaterThanOrEqual(0);
    expect(result.compacted).toBeGreaterThanOrEqual(0);
  });

  it('includes every item and reports its estimate when the budget is unlimited', () => {
    const items = [makeItem({ text: 'first' }), makeItem({ text: 'second' })];

    const result = governor.enforce(items, governor.resolve({ budget: 0 }, 8_000));

    expect(result.included).toHaveLength(2);
    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(result.overflow).toBeUndefined();
  });

  it('grants one overflow exception to an oversized exact node', () => {
    const exactText = 'x'.repeat(2_000);
    const exact = makeItem({ priority: 1, text: exactText });
    const lower = makeItem({ priority: 2, text: 'lower priority evidence' });

    const result = governor.enforce([lower, exact], governor.resolve({ budget: 100 }, 8_000));

    expect(result.included[0]).toBe(exact);
    expect(result.included[0]?.text).toBe(exactText);
    expect(result.overflow?.exact_node_overflow).toBe(true);
    expect(result.overflow?.configured).toBe(100);
    expect(result.overflow?.estimated).toBeGreaterThan(100);
    expect(result.overflow?.amount).toBe(result.overflow!.estimated - result.overflow!.evidenceBudget);
  });

  it('reports the evidence budget used for the overflow calculation', () => {
    const exact = makeItem({ priority: 1, text: 'x'.repeat(2_000) });
    const result = governor.enforce([exact], governor.resolve({ budget: 100 }, 8_000));

    expect(result.overflow?.evidenceBudget).toBe(0);
    expect(result.estimatedTokens).toBe(result.overflow?.estimated);
  });

  it('does not grant overflow to a second oversized node', () => {
    const first = makeItem({ priority: 1, text: 'x'.repeat(2_000), anchor: { relativePath: 'a.ts', startLine: 1, endLine: 2 } });
    const second = makeItem({ priority: 1, text: 'y'.repeat(2_000), anchor: { relativePath: 'b.ts', startLine: 1, endLine: 2 } });

    const result = governor.enforce([second, first], governor.resolve({ budget: 100 }, 8_000));

    expect(result.included).toHaveLength(1);
    expect(result.included[0]).toBe(second);
    expect(result.omitted).toBe(1);
    expect(result.overflow?.exact_node_overflow).toBe(true);
  });

  it('never truncates the exact node granted overflow', () => {
    const exactText = 'complete exact node source'.repeat(100);
    const result = governor.enforce(
      [makeItem({ priority: 1, text: exactText })],
      governor.resolve({ budget: 10 }, 8_000),
    );

    expect(result.included[0]?.text?.length).toBe(exactText.length);
  });

  it('omits lower-priority evidence that cannot fit without exceeding the budget', () => {
    const exact = makeItem({ priority: 1, text: 'exact' });
    const lower = makeItem({
      priority: 6,
      text: 'x'.repeat(2_000),
      anchor: { relativePath: 'lower.ts', startLine: 1, endLine: 2 },
    });
    const result = governor.enforce([lower, exact], governor.resolve({ budget: 300 }, 8_000));

    expect(result.included).toContain(exact);
    expect(result.included).not.toContain(lower);
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.evidenceBudget);
  });

  it('can compact a lower-priority item to its anchor when the anchor fits', () => {
    const exact = makeItem({
      priority: 1,
      text: 'exact',
      anchor: { relativePath: 'src/exact.ts', symbol: 'exactNode', startLine: 1, endLine: 2 },
    });
    const lowerBody = `function loadPayment(id: string) {\n${'  const x = 1;\n'.repeat(200)}}`;
    const lower = makeItem({
      priority: 6,
      text: lowerBody,
      anchor: { relativePath: 'src/lower.ts', symbol: 'loadPayment', startLine: 10, endLine: 20 },
    });
    const result = governor.enforce([exact, lower], governor.resolve({ budget: 300 }, 8_000));

    const compacted = result.included.find(
      (item) => item.anchor.relativePath === lower.anchor.relativePath,
    );
    // BUD-10: the lower-priority item is compacted, not omitted, so the count is exactly 1.
    expect(result.compacted).toBe(1);
    expect(result.omitted).toBe(0);
    expect(compacted?.form).toBe('anchor-only');
    expect(compacted?.degraded).toBe('compacted');
    // The compacted text is the rendered anchor plus the signature head — never the body.
    expect(compacted?.text).toBe('src/lower.ts:10-20 (loadPayment)\nfunction loadPayment(id: string)');
    expect(compacted?.text).not.toContain('const x = 1;');
    // Rendering the compacted form must genuinely reduce its token cost.
    expect(estimateItem(compacted!)).toBeLessThan(estimateItem(lower));
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.evidenceBudget);
  });

  it('omits rather than compacts when the compacted form does not reduce cost', () => {
    // A body already shorter than its own rendered anchor cannot be compacted profitably.
    const exact = makeItem({
      priority: 1,
      text: 'x'.repeat(400),
      anchor: { relativePath: 'src/exact.ts', symbol: 'exactNode', startLine: 1, endLine: 2 },
    });
    const tiny = makeItem({
      priority: 6,
      text: 'y',
      anchor: {
        repoId: 'repo-with-a-long-identifier',
        relativePath: 'src/deeply/nested/path/to/tiny.ts',
        symbol: 'tinySymbolWithALongName',
        startLine: 4_000,
        endLine: 4_001,
      },
    });
    const result = governor.enforce([exact, tiny], governor.resolve({ budget: 300 }, 8_000));

    expect(estimateItem({ ...tiny, text: 'src/deeply/nested/path/to/tiny.ts:4000-4001 (tinySymbolWithALongName)\ny' }))
      .toBeGreaterThan(estimateItem(tiny));
    expect(result.compacted).toBe(0);
    expect(result.omitted).toBe(1);
    expect(result.included.map((item) => item.anchor.relativePath)).toEqual(['src/exact.ts']);
  });

  it('bounds the compacted signature head so a single-line body still reduces cost', () => {
    const exact = makeItem({
      priority: 1,
      text: 'exact',
      anchor: { relativePath: 'src/exact.ts', symbol: 'exactNode', startLine: 1, endLine: 2 },
    });
    // A brace-free single-line body: the whole body is the declaration head, so only
    // the ceiling can bound it.
    const minified = makeItem({
      priority: 6,
      text: `const total = ${Array.from({ length: 200 }, (_, i) => `value${i}`).join(' + ')};`,
      anchor: { relativePath: 'src/min.js', symbol: 'total', startLine: 1, endLine: 1 },
    });
    const result = governor.enforce([exact, minified], governor.resolve({ budget: 600 }, 8_000));

    const compacted = result.included.find((item) => item.anchor.relativePath === 'src/min.js');
    expect(result.compacted).toBe(1);
    expect(compacted?.text?.endsWith('…')).toBe(true);
    expect(compacted?.text?.split('\n')[1]?.length).toBe(SIGNATURE_HEAD_MAX + 1);
    expect(estimateItem(compacted!)).toBeLessThan(estimateItem(minified));
  });

  it('keeps included estimates within the evidence budget for non-overflow items', () => {
    const result = governor.enforce(
      [makeItem({ text: 'one' }), makeItem({ priority: 5, text: 'two' })],
      governor.resolve({ budget: 1_000 }, 8_000),
    );

    expect(result.estimatedTokens).toBeLessThanOrEqual(result.evidenceBudget);
  });

  it('reports candidates when all evidence is compacted or omitted', () => {
    const items = [makeItem({ priority: 6, text: 'x'.repeat(2_000) })];
    const result = governor.enforce(items, governor.resolve({ budget: 1 }, 8_000));

    expect(result.candidateCount).toBe(1);
    expect(result.selectedCount).toBe(0);
    expect(result.omitted + result.compacted).toBe(1);
  });

  it('does not invoke overflow for an exact node that already failed reading', () => {
    const failed = makeItem({ priority: 1, text: 'x'.repeat(2_000), degraded: 'read-failed' });
    const result = governor.enforce([failed], governor.resolve({ budget: 100 }, 8_000));

    expect(result.included).toHaveLength(0);
    expect(result.overflow).toBeUndefined();
    expect(result.failure).toContain('read-failed');
  });

  it('preserves provenance while enforcing the ladder', () => {
    const item = makeItem({ priority: 2, provenance: { branch: 'semantic', collection: 'ast' } });
    const result = governor.enforce([item], governor.resolve({ budget: 1_000 }, 8_000));

    expect(result.included[0]?.provenance).toEqual(item.provenance);
  });

  it('preserves stable ordering for items with the same priority', () => {
    const first = makeItem({ priority: 3, text: 'first', anchor: { relativePath: 'first.ts', startLine: 1, endLine: 1 } });
    const second = makeItem({ priority: 3, text: 'second', anchor: { relativePath: 'second.ts', startLine: 1, endLine: 1 } });
    const result = governor.enforce([second, first], governor.resolve({ budget: 0 }, 8_000));

    expect(result.included.map((item) => item.text)).toEqual(['second', 'first']);
  });

  it('returns a zero selected count for no candidates', () => {
    const result: BudgetEnforcement = governor.enforce([], governor.resolve({ budget: 100 }, 8_000));

    expect(result.candidateCount).toBe(0);
    expect(result.selectedCount).toBe(0);
    expect(result.omitted).toBe(0);
  });
});

describe('BudgetGovernor.enforceSerialized (BUD-03, BUD-05, BUD-12, BUD-13)', () => {
  const governor = new BudgetGovernor();

  /**
   * Stand-in for the real response envelope: a fixed overhead (guardrail lead,
   * template, headers, code fences, diagnostics) plus each item's text. The
   * overhead is what an item-level sum structurally cannot see.
   */
  const OVERHEAD = 'GUARDRAIL LEAD. '.repeat(120);
  function serialize(items: ContextItem[]): unknown {
    return {
      content: [
        {
          type: 'text',
          text: `${OVERHEAD}${items.map((item) => `### ${item.anchor.relativePath}\n\`\`\`\n${item.text ?? ''}\n\`\`\``).join('\n\n')}`,
        },
      ],
      structuredContent: { results: items.map((item) => item.anchor.relativePath) },
    };
  }

  function bodyOf(response: unknown): string {
    return (response as { content: Array<{ text: string }> }).content[0]!.text;
  }

  it('measures the serialized string, not the sum of item estimates', () => {
    const items = [makeItem({ priority: 2, text: 'short body' })];
    const result = governor.enforceSerialized(items, governor.resolve({ budget: 100_000 }, 8_000), serialize);

    const itemSum = items.reduce((total, item) => total + estimateItem(item), 0);
    expect(result.estimatedTokens).toBe(estimateTokens(JSON.stringify(serialize(items))));
    // The response overhead is real cost that an item-level sum cannot account for.
    expect(result.estimatedTokens).toBeGreaterThan(itemSum + estimateTokens(OVERHEAD) - 1);
    expect(result.passes).toBe(1);
  });

  it('re-trims from the bottom of the ladder and re-serializes exactly once when over budget', () => {
    const exact = makeItem({
      priority: 1,
      text: 'EXACT_NODE_SOURCE',
      anchor: { relativePath: 'src/exact.ts', symbol: 'exactNode', startLine: 1, endLine: 2 },
    });
    // Sized so the item-level sum fits the evidence budget — pass 1 admits it whole —
    // while the serialized response (overhead included) does not. This is the exact
    // defect BUD-05 describes.
    const adjacent = makeItem({
      priority: 6,
      text: `function adjacent() {\n${'  filler line;\n'.repeat(50)}}`,
      anchor: { relativePath: 'src/adjacent.ts', symbol: 'adjacent', startLine: 5, endLine: 9 },
    });
    const budget = governor.resolve({ budget: 700 }, 8_000);

    const result = governor.enforceSerialized([exact, adjacent], budget, serialize);

    expect(result.passes).toBe(2);
    expect(result.estimatedTokens).toBeLessThanOrEqual(700);
    expect(result.estimatedTokens).toBe(estimateTokens(JSON.stringify(result.response)));
    // The ladder bottom lost content; the priority-1 exact node kept it.
    expect(bodyOf(result.response)).toContain('EXACT_NODE_SOURCE');
    expect(bodyOf(result.response)).not.toContain('filler line;');
    expect(result.omitted + result.compacted).toBe(1);
  });

  it('never serializes more than the two passes D-1 permits', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      makeItem({
        priority: 6,
        text: 'z'.repeat(4_000),
        anchor: { relativePath: `src/big${index}.ts`, symbol: `big${index}`, startLine: 1, endLine: 2 },
      }),
    );
    const spy = vi.fn(serialize);

    const result = governor.enforceSerialized(items, governor.resolve({ budget: 500 }, 8_000), spy);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.passes).toBe(2);
  });

  it('returns a deeply equal result for identical input', () => {
    const items = [
      makeItem({ priority: 1, text: 'exact', anchor: { relativePath: 'a.ts', startLine: 1, endLine: 2 } }),
      makeItem({ priority: 6, text: 'y'.repeat(3_000), anchor: { relativePath: 'b.ts', startLine: 3, endLine: 4 } }),
    ];
    const budget = governor.resolve({ budget: 800 }, 8_000);

    expect(governor.enforceSerialized(items, budget, serialize)).toEqual(
      governor.enforceSerialized(items, budget, serialize),
    );
  });

  it('does not under-report the measured serialized response beyond the documented margin', () => {
    const items = [makeItem({ priority: 2, text: 'const total = amount + fee; // BUD-13' })];
    const result = governor.enforceSerialized(items, governor.resolve({ budget: 100_000 }, 8_000), serialize);

    const serializedString = JSON.stringify(result.response);
    // BUD-13: the pinned margin is zero — the estimate never falls below length/4.
    expect(TOKEN_ESTIMATE_UNDERREPORT_MARGIN).toBe(0);
    expect(result.estimatedTokens).toBeGreaterThanOrEqual(
      Math.ceil(serializedString.length / 4) - TOKEN_ESTIMATE_UNDERREPORT_MARGIN,
    );
  });

  it('includes everything and still reports the measured estimate when the budget is unlimited', () => {
    const items = [
      makeItem({ priority: 1, text: 'x'.repeat(5_000), anchor: { relativePath: 'a.ts', startLine: 1, endLine: 2 } }),
      makeItem({ priority: 6, text: 'y'.repeat(5_000), anchor: { relativePath: 'b.ts', startLine: 3, endLine: 4 } }),
    ];
    const result = governor.enforceSerialized(items, governor.resolve({ budget: 0 }, 8_000), serialize);

    expect(result.included).toHaveLength(2);
    expect(result.omitted).toBe(0);
    expect(result.compacted).toBe(0);
    expect(result.estimatedTokens).toBe(estimateTokens(JSON.stringify(result.response)));
    expect(result.passes).toBe(1);
  });
});
