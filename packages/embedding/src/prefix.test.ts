import { describe, expect, it } from 'vitest';
import { applyPrefix } from './prefix.js';

describe('applyPrefix', () => {
  const prefixes = { document: 'doc: ', query: 'query: ' };

  it('returns text unchanged when prefixes are absent', () => {
    expect(applyPrefix('hello', 'document')).toBe('hello');
  });

  it('selects the document prefix for document tasks', () => {
    expect(applyPrefix('hello', 'document', prefixes)).toBe('doc: hello');
  });

  it('selects the query prefix for query tasks', () => {
    expect(applyPrefix('hello', 'query', prefixes)).toBe('query: hello');
  });

  it('returns text unchanged when the task type is absent', () => {
    expect(applyPrefix('hello', undefined, prefixes)).toBe('hello');
  });

  it('does not detect an existing prefix and documents the current single-application behavior', () => {
    expect(applyPrefix('doc: hello', 'document', prefixes)).toBe('doc: doc: hello');
  });
});
