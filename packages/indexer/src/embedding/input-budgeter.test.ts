import { describe, expect, it } from 'vitest';
import type { ModelCapabilities } from '@ia-framework/core';
import { packBatches, sizedInputFromChannels, type SizedInput } from './input-budgeter.js';

const OPENAI_CAPABILITIES: ModelCapabilities = {
  supportsDimensionParam: true,
  maxInputTokens: 8192,
  maxBatchItems: 2048,
  maxRequestTokens: 300000,
  disableServerTruncation: false,
};

// Single-channel input: maxChannelTokens == totalTokens == estimateTokens(text).
function makeInput(id: string, text: string): SizedInput {
  return sizedInputFromChannels(id, [text]);
}

describe('packBatches', () => {
  it('keeps every batch within the provider item limit', () => {
    const inputs = Array.from({ length: 3000 }, (_, index) => makeInput(String(index), 'small'));

    const result = packBatches(inputs, { ...OPENAI_CAPABILITIES, maxBatchItems: 2048 });

    expect(result.oversized).toEqual([]);
    expect(result.batches).toHaveLength(2);
    expect(result.batches.every((batch) => batch.length <= 2048)).toBe(true);
    expect(result.batches[0]).toHaveLength(2048);
    expect(result.batches[1]).toHaveLength(952);
  });

  it('repacks a batch whose total token size exceeds the request limit', () => {
    const inputs = Array.from({ length: 4 }, (_, index) => makeInput(String(index), 'x'.repeat(40)));
    const caps = { ...OPENAI_CAPABILITIES, maxRequestTokens: 10 };

    const result = packBatches(inputs, caps);

    expect(result.oversized).toEqual([]);
    expect(result.batches).toHaveLength(4);
    expect(result.batches.every((batch) => batch.length === 1)).toBe(true);
  });

  it('routes an input over the per-input limit to oversized', () => {
    const oversized = makeInput('too-large', 'x'.repeat(100));

    const result = packBatches([makeInput('small', 'ok'), oversized], {
      ...OPENAI_CAPABILITIES,
      maxInputTokens: 10,
    });

    expect(result.batches).toEqual([[makeInput('small', 'ok')]]);
    expect(result.oversized).toEqual([oversized]);
  });

  it('uses token estimation rather than source line count for long lines', () => {
    const longSingleLine = makeInput('long-line', 'x'.repeat(100));

    const result = packBatches([longSingleLine], {
      ...OPENAI_CAPABILITIES,
      maxInputTokens: 10,
    });

    expect(result.oversized).toEqual([longSingleLine]);
    expect(result.batches).toEqual([]);
  });

  it('produces identical boundaries for identical inputs', () => {
    const inputs = [
      makeInput('a', 'one'),
      makeInput('b', 'two'),
      makeInput('c', 'three'),
      makeInput('d', 'four'),
    ];
    const caps = { ...OPENAI_CAPABILITIES, maxRequestTokens: 2 };

    expect(packBatches(inputs, caps)).toEqual(packBatches(inputs, caps));
  });

  it('never creates an empty batch', () => {
    // An empty input set has no batches at all, so `.every()` over it is vacuously
    // true. Asserted instead against the case that actually stresses the guard: an
    // input that alone exceeds maxRequestTokens while still fitting maxInputTokens.
    // Without the non-empty guard the packer flushes before every such input and
    // emits an empty batch.
    const empty = packBatches([], OPENAI_CAPABILITIES);
    expect(empty.batches).toEqual([]);

    const inputs = [
      makeInput('big', 'x '.repeat(200)),
      makeInput('a', 'one'),
      makeInput('c', 'three'),
    ];
    const result = packBatches(inputs, {
      ...OPENAI_CAPABILITIES,
      maxInputTokens: 8192,
      maxRequestTokens: 10,
    });

    expect(result.batches.length).toBeGreaterThan(1);
    expect(result.batches.map((batch) => batch.length).filter((size) => size === 0)).toEqual([]);
    expect(result.batches.every((batch) => batch.length > 0)).toBe(true);
    // Nothing was lost while avoiding the empty batch.
    expect(result.batches.flat().map((input) => input.id)).toEqual(['big', 'a', 'c']);
  });

  it('conserves every input exactly once across batches and oversized', () => {
    const inputs = [
      makeInput('small-1', 'ok'),
      makeInput('large', 'x'.repeat(100)),
      makeInput('small-2', 'also ok'),
    ];
    const result = packBatches(inputs, { ...OPENAI_CAPABILITIES, maxInputTokens: 10 });
    const batched = result.batches.flat();

    const conservedIds = [...batched, ...result.oversized].map((input) => input.id);
    expect(new Set(conservedIds)).toEqual(new Set(inputs.map((input) => input.id)));
    expect(conservedIds).toHaveLength(inputs.length);
  });

  it('preserves input order while packing around a request limit', () => {
    const inputs = [makeInput('a', 'one'), makeInput('b', 'two'), makeInput('c', 'three')];
    const result = packBatches(inputs, { ...OPENAI_CAPABILITIES, maxRequestTokens: 2 });

    expect(result.batches.flat().map((input) => input.id)).toEqual(['a', 'b', 'c']);
  });

  it('uses the provider limit when a batch item limit is omitted', () => {
    const inputs = [makeInput('a', 'one'), makeInput('b', 'two'), makeInput('c', 'three')];

    const result = packBatches(inputs, {
      supportsDimensionParam: OPENAI_CAPABILITIES.supportsDimensionParam,
      maxInputTokens: OPENAI_CAPABILITIES.maxInputTokens,
      disableServerTruncation: OPENAI_CAPABILITIES.disableServerTruncation,
      ...(OPENAI_CAPABILITIES.maxRequestTokens !== undefined
        ? { maxRequestTokens: OPENAI_CAPABILITIES.maxRequestTokens }
        : {}),
    });

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]).toEqual(inputs);
  });

  it('keeps an individual input at the request limit in a batch', () => {
    const input = makeInput('at-limit', 'x'.repeat(4));
    const result = packBatches([input], { ...OPENAI_CAPABILITIES, maxRequestTokens: 1 });

    expect(result.oversized).toEqual([]);
    expect(result.batches).toEqual([[input]]);
  });

  // G4 regression: the per-item cap is the LARGEST channel, not the sum. A chunk
  // whose two channels each fit under maxInputTokens must not be rejected just
  // because their combined size exceeds it (they are sent as separate requests).
  it('measures per-channel, not concatenated, against maxInputTokens', () => {
    // Each channel ~7 tokens ('x'*28 → 28*0.25); combined ~14. Cap = 10.
    const input = sizedInputFromChannels('two-channel', ['x'.repeat(28), 'x'.repeat(28)]);
    expect(input.maxChannelTokens).toBe(7);
    expect(input.totalTokens).toBe(14);

    const result = packBatches([input], { ...OPENAI_CAPABILITIES, maxInputTokens: 10 });

    // Old concatenation logic (14 > 10) would have wrongly routed this oversized.
    expect(result.oversized).toEqual([]);
    expect(result.batches).toEqual([[input]]);
  });

  it('routes to oversized only when a single channel exceeds the cap', () => {
    const input = sizedInputFromChannels('big-channel', ['x'.repeat(80), 'x'.repeat(4)]);
    // Largest channel = 20 tokens > cap 10.
    const result = packBatches([input], { ...OPENAI_CAPABILITIES, maxInputTokens: 10 });

    expect(result.batches).toEqual([]);
    expect(result.oversized).toEqual([input]);
  });

  it('uses summed channel tokens for the request-token budget', () => {
    // Two items, each total ~14 tokens (7+7); request budget 20 → one per batch.
    const a = sizedInputFromChannels('a', ['x'.repeat(28), 'x'.repeat(28)]);
    const b = sizedInputFromChannels('b', ['x'.repeat(28), 'x'.repeat(28)]);
    const result = packBatches([a, b], {
      ...OPENAI_CAPABILITIES,
      maxInputTokens: 8192,
      maxRequestTokens: 20,
    });

    expect(result.batches).toEqual([[a], [b]]);
  });
});
