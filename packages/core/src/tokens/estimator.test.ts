import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TOKEN_ESTIMATE_UNDERREPORT_MARGIN,
  estimateProviderInputTokens,
  estimateTokens,
} from './estimator.js';

describe('estimateTokens', () => {
  it('returns zero for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('is deterministic for whitespace-only input', () => {
    expect(estimateTokens('   \n\t')).toBe(estimateTokens('   \n\t'));
  });

  it('returns an integer estimate for ordinary text', () => {
    const estimate = estimateTokens('hello world');

    expect(Number.isInteger(estimate)).toBe(true);
    expect(estimate).toBeGreaterThan(0);
  });

  it('does not under-report dense symbol-heavy code', () => {
    const source = 'const f=(x)=>({a:x?.b??0,[x]:`${x}!`});';
    const baseline = Math.ceil(source.length / 4);

    expect(estimateTokens(source)).toBeGreaterThanOrEqual(baseline);
  });

  it('does not under-report non-ASCII and CJK text', () => {
    const source = '日本語の埋め込み検索とémoji 🚀';
    const codePointCount = Array.from(source).length;

    expect(estimateTokens(source)).toBeGreaterThanOrEqual(codePointCount);
  });

  it('keeps the calibrated margin within the documented bound for real source chunks', () => {
    const sourceFiles = [
      '../index.ts',
      '../config/schema.ts',
      '../config/loader.ts',
      '../config/registry.ts',
      '../config/detector.ts',
      '../retrieval/query-intelligence.ts',
      '../graph/cross-repo-edges.ts',
      '../graph/import-resolver.ts',
      '../maven/maven-module-parser.ts',
      '../sqlite/adapter.ts',
      '../logger/index.ts',
      '../types/index.ts',
    ];

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(new URL(sourceFile, import.meta.url), 'utf8');
      const baseline = Math.ceil(source.length / 4);
      const estimate = estimateTokens(source);
      const underReport = Math.max(0, baseline - estimate) / baseline;

      expect(estimate).toBeGreaterThanOrEqual(baseline);
      expect(underReport).toBeLessThanOrEqual(TOKEN_ESTIMATE_UNDERREPORT_MARGIN);
    }
  });

  it('exports a numeric calibration margin', () => {
    expect(typeof TOKEN_ESTIMATE_UNDERREPORT_MARGIN).toBe('number');
    expect(TOKEN_ESTIMATE_UNDERREPORT_MARGIN).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic across repeated calls', () => {
    const source = 'PaymentService.refund({ amount: 10 });';

    expect(estimateTokens(source)).toBe(estimateTokens(source));
  });

  it('is exported from the core barrel', async () => {
    const core = await import('../index.js');

    expect(core.estimateTokens('hello')).toBe(estimateTokens('hello'));
    expect(core.TOKEN_ESTIMATE_UNDERREPORT_MARGIN).toBe(TOKEN_ESTIMATE_UNDERREPORT_MARGIN);
  });
});

// estimateProviderInputTokens sizes text against a provider's hard context
// limit. It shares estimateTokens' per-character weighting but omits the
// whole-string non-ASCII floor, which over-reports source code containing a few
// Unicode characters badly enough to drop fitting chunks from the index.
describe('estimateProviderInputTokens', () => {
  it('returns zero for an empty string', () => {
    expect(estimateProviderInputTokens('')).toBe(0);
  });

  it('matches estimateTokens for pure ASCII text', () => {
    const source = 'function processPayment(order) { return retry(order); }';
    expect(estimateProviderInputTokens(source)).toBe(estimateTokens(source));
  });

  it('does not inflate a mostly-ASCII string containing a few smart quotes', () => {
    // Three curly apostrophes in otherwise ASCII prose. estimateTokens floors
    // this at the character count; the provider-input estimate must not, or a
    // chunk that comfortably fits is rejected as oversized.
    const ascii = "It's the user's manager's decision to make here and now today.";
    const smart = ascii.replace(/'/g, '\u2019');

    const asciiEstimate = estimateProviderInputTokens(ascii);
    const smartEstimate = estimateProviderInputTokens(smart);

    // Swapping an ASCII symbol (0.5) for a non-ASCII character (1.0) adds 0.5
    // each: a per-character penalty, not a whole-string multiplier.
    expect(smartEstimate).toBeGreaterThanOrEqual(asciiEstimate);
    expect(smartEstimate - asciiEstimate).toBeLessThanOrEqual(2);
    // The regression this exists to pin: estimateTokens inflates to the full
    // character count, the provider-input estimate stays proportional.
    expect(smartEstimate).toBeLessThan(estimateTokens(smart));
    expect(smartEstimate).toBeLessThan(Array.from(smart).length / 2);
  });

  it('still never under-reports the length/4 baseline', () => {
    for (const source of ['plain ascii code();', '日本語の埋め込み検索', 'a\u2019b\u2019c']) {
      expect(estimateProviderInputTokens(source)).toBeGreaterThanOrEqual(
        Math.ceil(source.length / 4) - TOKEN_ESTIMATE_UNDERREPORT_MARGIN,
      );
    }
  });

  it('a fully non-ASCII string still estimates at least its character count', () => {
    const source = '日本語の埋め込み検索';
    expect(estimateProviderInputTokens(source)).toBeGreaterThanOrEqual(
      Array.from(source).length,
    );
  });
});
