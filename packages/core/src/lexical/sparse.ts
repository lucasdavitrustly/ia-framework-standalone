import { tokenize } from './tokenizer.js';

/** Versioned sparse-index contract shared by indexing and retrieval. */
export const SPARSE_HASH_VERSION = 1;

const SPARSE_BUCKET_COUNT = 65_536;

export type TokenSource = string | string[] | undefined;

export interface SparseVector {
  indices: number[];
  values: number[];
}

/** Hash one normalized lexical term into the collection's sparse bucket space. */
export function sparseHash(term: string): number {
  let hash = 5381;
  for (const character of term) {
    hash = ((hash * 33 + character.charCodeAt(0)) >>> 0);
  }
  return hash % SPARSE_BUCKET_COUNT;
}

/**
 * Build raw term-frequency weights for Qdrant's `modifier: 'idf'` sparse vector.
 */
export function buildSparseVector(sources: TokenSource[]): SparseVector {
  const termFrequency = new Map<number, number>();

  for (const source of sources) {
    const values = Array.isArray(source) ? source : source === undefined ? [] : [source];
    for (const value of values) {
      for (const token of tokenize(value)) {
        const index = sparseHash(token);
        termFrequency.set(index, (termFrequency.get(index) ?? 0) + 1);
      }
    }
  }

  const entries = [...termFrequency.entries()].sort(([left], [right]) => left - right);
  return {
    indices: entries.map(([index]) => index),
    values: entries.map(([, frequency]) => frequency),
  };
}
