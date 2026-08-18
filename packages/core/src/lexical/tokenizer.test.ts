import { describe, expect, it } from 'vitest';
import { TOKENIZER_VERSION as EXPORTED_TOKENIZER_VERSION, tokenize as exportedTokenize } from '../index.js';
import { TOKENIZER_VERSION, tokenize } from './tokenizer.js';

describe('tokenize', () => {
  it('splits camelCase before lowercasing', () => {
    expect(tokenize('getUserById')).toEqual(['get', 'user', 'by', 'id']);
  });

  it('splits PascalCase', () => {
    expect(tokenize('PaymentService')).toEqual(['payment', 'service']);
  });

  it('splits acronym boundaries', () => {
    expect(tokenize('HTTPServer')).toEqual(['http', 'server']);
  });

  it('splits snake_case', () => {
    expect(tokenize('payment_status')).toEqual(['payment', 'status']);
  });

  it('splits dot notation', () => {
    expect(tokenize('PaymentService.refund')).toEqual(['payment', 'service', 'refund']);
  });

  it('splits source paths', () => {
    expect(tokenize('src/services/payment.ts')).toEqual(['src', 'services', 'payment', 'ts']);
  });

  it('splits package names', () => {
    expect(tokenize('com.acme.billing')).toEqual(['com', 'acme', 'billing']);
  });

  it('tokenizes an annotation name', () => {
    expect(tokenize('@Transactional')).toEqual(['transactional']);
  });

  it('preserves quoted phrases as one term', () => {
    expect(tokenize('find "exact phrase here" now')).toEqual([
      'find',
      'exact phrase here',
      'now',
    ]);
  });

  it('keeps single-character terms', () => {
    expect(tokenize('x')).toEqual(['x']);
  });

  it('keeps two-character terms', () => {
    expect(tokenize('id')).toEqual(['id']);
  });

  it('normalizes terms without dropping punctuation-separated signals', () => {
    expect(tokenize('A.B/C-D')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns a numeric tokenizer version', () => {
    expect(typeof TOKENIZER_VERSION).toBe('number');
  });

  it('is deterministic for repeated input', () => {
    const first = tokenize('PaymentService.refund("exact phrase")');
    const second = tokenize('PaymentService.refund("exact phrase")');
    expect(second).toEqual(first);
  });

  it('is exported from the core barrel', () => {
    expect(exportedTokenize('getUserById')).toEqual(['get', 'user', 'by', 'id']);
    expect(EXPORTED_TOKENIZER_VERSION).toBe(TOKENIZER_VERSION);
  });
});
