import { describe, it, expect } from 'vitest';
import { validateChunks, generateReport, type ChunkEntry } from '../strategies/chunk-validator.js';

describe('validateChunks', () => {
  it('returns empty violations for perfect coverage', () => {
    const chunks: ChunkEntry[] = [
      { startLine: 1, endLine: 5, summary: 'First block' },
      { startLine: 6, endLine: 10, summary: 'Second block' },
    ];
    const result = validateChunks('file.ts', chunks, 10);
    expect(result.violations).toHaveLength(0);
    expect(result.filePath).toBe('file.ts');
    expect(result.totalLines).toBe(10);
    expect(result.chunkCount).toBe(2);
  });

  it('detects gap between chunks', () => {
    const chunks: ChunkEntry[] = [
      { startLine: 1, endLine: 10, summary: 'First block' },
      { startLine: 12, endLine: 20, summary: 'Second block' },
    ];
    const result = validateChunks('file.ts', chunks, 20);
    const gaps = result.violations.filter((v) => v.type === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.startLine).toBe(11);
    expect(gaps[0]!.endLine).toBe(11);
  });

  it('detects overlap between chunks', () => {
    const chunks: ChunkEntry[] = [
      { startLine: 1, endLine: 10, summary: 'First block' },
      { startLine: 8, endLine: 20, summary: 'Second block' },
    ];
    const result = validateChunks('file.ts', chunks, 20);
    const overlaps = result.violations.filter((v) => v.type === 'overlap');
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.startLine).toBe(8);
    expect(overlaps[0]!.endLine).toBe(10);
  });

  it('detects out-of-bounds when endLine exceeds totalLines', () => {
    const chunks: ChunkEntry[] = [{ startLine: 1, endLine: 15, summary: 'Block' }];
    const result = validateChunks('file.ts', chunks, 10);
    const oob = result.violations.filter((v) => v.type === 'out-of-bounds');
    expect(oob).toHaveLength(1);
    expect(oob[0]!.message).toContain('exceeds file length');
  });

  it('detects out-of-bounds when startLine is 0 (below 1-indexed)', () => {
    const chunks: ChunkEntry[] = [{ startLine: 0, endLine: 5, summary: 'Block' }];
    const result = validateChunks('file.ts', chunks, 10);
    const oob = result.violations.filter((v) => v.type === 'out-of-bounds');
    expect(oob).toHaveLength(1);
    expect(oob[0]!.message).toContain('below 1');
  });

  it('detects empty summary', () => {
    const chunks: ChunkEntry[] = [
      { startLine: 1, endLine: 5, summary: '' },
      { startLine: 6, endLine: 10, summary: '   ' },
    ];
    const result = validateChunks('file.ts', chunks, 10);
    const empty = result.violations.filter((v) => v.type === 'empty-summary');
    expect(empty).toHaveLength(2);
  });

  it('collects per-file violations for multiple files', () => {
    const chunks1: ChunkEntry[] = [{ startLine: 1, endLine: 5, summary: 'Block' }];
    const chunks2: ChunkEntry[] = [{ startLine: 1, endLine: 5, summary: '' }];
    const r1 = validateChunks('file1.ts', chunks1, 5);
    const r2 = validateChunks('file2.ts', chunks2, 5);
    expect(r1.violations).toHaveLength(0);
    expect(r2.violations.some((v) => v.type === 'empty-summary')).toBe(true);
  });
});

describe('generateReport', () => {
  it('produces summary with filesChecked, filesWithGaps, filesWithOverlaps', () => {
    const v1 = validateChunks(
      'file1.ts',
      [
        { startLine: 1, endLine: 10, summary: 'A' },
        { startLine: 12, endLine: 20, summary: 'B' }, // gap at 11
      ],
      20,
    );
    const v2 = validateChunks('file2.ts', [{ startLine: 1, endLine: 10, summary: 'A' }], 10);
    const report = generateReport([v1, v2]);
    expect(report.filesChecked).toBe(2);
    expect(report.filesWithGaps).toBe(1);
    expect(report.filesWithOverlaps).toBe(0);
  });
});
