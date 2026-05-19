import { describe, it, expect } from 'vitest';
import { applyElbowTruncation } from './elbow-detection.js';

describe('applyElbowTruncation', () => {
  it('truncates when score drops more than 50% between consecutive results', () => {
    const scores = [0.9, 0.85, 0.8, 0.35, 0.3]; // drop from 0.80 → 0.35 = 56% drop
    const items = scores.map((score, i) => ({ id: `item-${i}`, score }));

    const result = applyElbowTruncation(items, { dropThreshold: 0.5 });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(['item-0', 'item-1', 'item-2']);
  });

  it('returns all results when no significant drop exists', () => {
    const scores = [0.9, 0.85, 0.8, 0.75, 0.7]; // gradual decline
    const items = scores.map((score, i) => ({ id: `item-${i}`, score }));

    const result = applyElbowTruncation(items, { dropThreshold: 0.5 });

    expect(result).toHaveLength(5);
  });

  it('returns empty array for empty input', () => {
    const result = applyElbowTruncation([], { dropThreshold: 0.5 });
    expect(result).toHaveLength(0);
  });

  it('returns single item without truncation', () => {
    const result = applyElbowTruncation([{ id: 'a', score: 0.9 }], { dropThreshold: 0.5 });
    expect(result).toHaveLength(1);
  });

  it('requires minimum results before truncation applies', () => {
    const scores = [0.9, 0.3]; // 67% drop but only 1 result before elbow
    const items = scores.map((score, i) => ({ id: `item-${i}`, score }));

    // With minResults=2, should keep at least 2 results
    const result = applyElbowTruncation(items, { dropThreshold: 0.5, minResults: 2 });
    expect(result).toHaveLength(2);
  });

  it('uses relative drop calculation (score[i]/score[i-1])', () => {
    // 0.40 → 0.18 = 55% drop relative to previous
    const scores = [0.4, 0.38, 0.18, 0.15];
    const items = scores.map((score, i) => ({ id: `item-${i}`, score }));

    const result = applyElbowTruncation(items, { dropThreshold: 0.5 });

    expect(result).toHaveLength(2);
  });

  it('defaults dropThreshold to 0.5 when not specified', () => {
    const scores = [0.9, 0.85, 0.35]; // 59% drop
    const items = scores.map((score, i) => ({ id: `item-${i}`, score }));

    const result = applyElbowTruncation(items);

    expect(result).toHaveLength(2);
  });
});
