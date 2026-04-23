import { describe, it, expect } from 'vitest';
import { buildPrompt, PROMPT_CONTENT_HASH } from './prompt.js';

const SAMPLE_SOURCE = `public class OrderService {
  public Order createOrder(Cart cart) {
    return new Order(cart);
  }
}`;

describe('buildPrompt - class grouping rules', () => {
  it('contains class and method grouping rule', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java');
    expect(prompt).toMatch(/class.*methods.*MUST.*single chunk/i);
  });

  it('contains 100-line split rule with class name prefix', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java');
    expect(prompt).toContain('100 lines');
    expect(prompt).toContain('prefix each sub-chunk summary with the class name');
  });

  it('contains minimum chunk size rule', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java');
    expect(prompt).toMatch(/minimum.*5 lines/i);
  });

  it('contains domain terminology guidance', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java');
    expect(prompt).toContain('domain terminology');
  });

  it('contains syntax anti-pattern guidance', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java');
    expect(prompt).toContain('Do NOT describe syntax');
  });
});

describe('buildPrompt - few-shot examples injection', () => {
  it('includes GOOD boundary section when examples provided', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java', {
      examples: { good: 'GOOD example content here', bad: 'BAD example content here' },
    });
    expect(prompt).toContain('GOOD boundary detection');
    expect(prompt).toContain('GOOD example content here');
  });

  it('includes BAD boundary section when examples provided', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java', {
      examples: { good: 'GOOD example content here', bad: 'BAD example content here' },
    });
    expect(prompt).toContain('BAD boundary detection');
    expect(prompt).toContain('BAD example content here');
  });

  it('does NOT include example sections when no examples provided', () => {
    const prompt = buildPrompt(SAMPLE_SOURCE, 'OrderService.java');
    expect(prompt).not.toContain('GOOD boundary detection');
    expect(prompt).not.toContain('BAD boundary detection');
  });

  it('is backward compatible — works without third argument', () => {
    expect(() => buildPrompt(SAMPLE_SOURCE, 'OrderService.java')).not.toThrow();
  });
});

describe('PROMPT_CONTENT_HASH', () => {
  it('is a non-empty string', () => {
    expect(typeof PROMPT_CONTENT_HASH).toBe('string');
    expect(PROMPT_CONTENT_HASH.length).toBeGreaterThan(0);
  });
});
