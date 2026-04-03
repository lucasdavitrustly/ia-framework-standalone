import { describe, it, expect } from 'vitest';
import { TokenCounter } from './token-counter.js';

describe('TokenCounter', () => {
  describe('count()', () => {
    it('returns 0 for empty string', () => {
      const counter = new TokenCounter();
      expect(counter.count('')).toBe(0);
    });

    it('rounds up partial tokens', () => {
      const counter = new TokenCounter();
      // 'hello' = 5 chars, 5/4 = 1.25, ceil = 2
      expect(counter.count('hello')).toBe(2);
    });

    it('counts exact multiples correctly', () => {
      const counter = new TokenCounter();
      // 'abcd' = 4 chars, 4/4 = 1
      expect(counter.count('abcd')).toBe(1);
    });

    it('handles large strings', () => {
      const counter = new TokenCounter();
      // 100 chars / 4 = 25
      expect(counter.count('a'.repeat(100))).toBe(25);
    });

    it('uses custom charsPerToken', () => {
      const counter = new TokenCounter(2);
      // 'hello' = 5 chars, 5/2 = 2.5, ceil = 3
      expect(counter.count('hello')).toBe(3);
    });
  });

  describe('countRagEvent()', () => {
    it('counts query + all chunk contents combined', () => {
      const counter = new TokenCounter(4);
      // 'query' (5) + 'chunk1' (6) + 'chunk2' (6) = 17 chars, ceil(17/4) = 5
      expect(counter.countRagEvent('query', ['chunk1', 'chunk2'])).toBe(5);
    });

    it('handles empty chunks array', () => {
      const counter = new TokenCounter(4);
      // Just the query: 'query' = 5 chars, ceil(5/4) = 2
      expect(counter.countRagEvent('query', [])).toBe(2);
    });

    it('handles empty query with chunks', () => {
      const counter = new TokenCounter(4);
      // '' + 'abcd' = 4 chars, ceil(4/4) = 1
      expect(counter.countRagEvent('', ['abcd'])).toBe(1);
    });

    it('handles all empty', () => {
      const counter = new TokenCounter();
      expect(counter.countRagEvent('', [])).toBe(0);
    });
  });
});
