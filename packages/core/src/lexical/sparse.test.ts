import { describe, expect, it } from 'vitest';
import {
  SPARSE_HASH_VERSION,
  buildSparseVector,
  sparseHash,
} from './sparse.js';

describe('buildSparseVector', () => {
  it('builds aligned indices and values from string and array sources', () => {
    const result = buildSparseVector(['getUserById', ['getUserById', 'PaymentService']]);

    expect(result.indices.length).toBe(result.values.length);
    expect(result.indices).toEqual([...result.indices].sort((a, b) => a - b));
    expect(new Set(result.indices).size).toBe(result.indices.length);
    expect(result.values.every((value) => value > 0)).toBe(true);
  });

  it('keeps indices strictly ascending and unique', () => {
    const result = buildSparseVector(['service service service']);

    expect(result.indices).toHaveLength(1);
    expect(result.indices[0]).toBe(sparseHash('service'));
    expect(result.values).toEqual([3]);
  });

  it('sums weights for distinct terms that collide', () => {
    expect(sparseHash('term1602')).toBe(2406);
    expect(sparseHash('term3060')).toBe(2406);

    const result = buildSparseVector(['term1602 term3060 term1602']);

    expect(result).toEqual({ indices: [2406], values: [3] });
  });

  it('returns an empty vector when no tokens survive', () => {
    expect(buildSparseVector(['', '   ', undefined, []])).toEqual({ indices: [], values: [] });
  });

  it('uses raw term frequency weights for the idf collection modifier', () => {
    const result = buildSparseVector(['getUserById getUserById']);
    const frequencies = new Map(result.indices.map((index, position) => [index, result.values[position]]));

    expect(frequencies.get(sparseHash('get'))).toBe(2);
    expect(frequencies.get(sparseHash('user'))).toBe(2);
    expect(frequencies.get(sparseHash('by'))).toBe(2);
    expect(frequencies.get(sparseHash('id'))).toBe(2);
  });

  it('matches the golden vector for a fixed input', () => {
    expect(buildSparseVector(['PaymentService.refund PaymentService'])).toEqual({
      indices: [
        22934,
        44387,
        46665,
      ],
      values: [2, 2, 1],
    });
  });

  it('is deterministic for repeated input', () => {
    const first = buildSparseVector(['src/services/payment.ts', ['PaymentService', 'refund']]);
    const second = buildSparseVector(['src/services/payment.ts', ['PaymentService', 'refund']]);

    expect(second).toEqual(first);
  });

  it('exports a numeric sparse hash version', () => {
    expect(typeof SPARSE_HASH_VERSION).toBe('number');
  });

  it('hashes the same token consistently', () => {
    expect(sparseHash('payment')).toBe(sparseHash('payment'));
  });

  it('is exported from the core barrel', async () => {
    const core = await import('../index.js');

    expect(core.buildSparseVector(['payment'])).toEqual(buildSparseVector(['payment']));
    expect(core.sparseHash('payment')).toBe(sparseHash('payment'));
    expect(core.SPARSE_HASH_VERSION).toBe(SPARSE_HASH_VERSION);
  });
});
