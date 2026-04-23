/**
 * Chunk overlap/gap detection for LLM-produced chunks.
 * Validates that chunks cover every source line and reports violations.
 *
 * Per D-12, D-13, D-14, D-15 from Phase 19.
 */

export interface ChunkEntry {
  startLine: number;
  endLine: number;
  summary: string;
}

export type ViolationType = 'gap' | 'overlap' | 'out-of-bounds' | 'empty-summary';

export interface Violation {
  type: ViolationType;
  startLine: number;
  endLine: number;
  message: string;
}

export interface FileValidation {
  filePath: string;
  totalLines: number;
  chunkCount: number;
  violations: Violation[];
}

export interface ChunkValidationReport {
  filesChecked: number;
  filesWithGaps: number;
  filesWithOverlaps: number;
  filesWithOutOfBounds: number;
  filesWithEmptySummaries: number;
  fileValidations: FileValidation[];
}

/**
 * Validate chunks for a single file.
 * Checks: gaps, overlaps, out-of-bounds, empty summaries.
 * Chunks are sorted by startLine before validation.
 */
export function validateChunks(
  filePath: string,
  chunks: ChunkEntry[],
  totalLines: number,
): FileValidation {
  const violations: Violation[] = [];
  const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);

  for (const chunk of sorted) {
    // Out-of-bounds checks
    if (chunk.startLine < 1) {
      violations.push({
        type: 'out-of-bounds',
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        message: `startLine ${chunk.startLine} is below 1 (lines are 1-indexed)`,
      });
    }
    if (chunk.endLine > totalLines) {
      violations.push({
        type: 'out-of-bounds',
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        message: `endLine ${chunk.endLine} exceeds file length ${totalLines}`,
      });
    }
    // Empty summary
    if (!chunk.summary || chunk.summary.trim() === '') {
      violations.push({
        type: 'empty-summary',
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        message: `Chunk at lines ${chunk.startLine}-${chunk.endLine} has empty summary`,
      });
    }
  }

  // Gap and overlap detection between consecutive chunks
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const expectedStart = prev.endLine + 1;

    if (curr.startLine > expectedStart) {
      // Gap: lines between prev.endLine+1 and curr.startLine-1 are uncovered
      violations.push({
        type: 'gap',
        startLine: expectedStart,
        endLine: curr.startLine - 1,
        message: `Gap: lines ${expectedStart}-${curr.startLine - 1} not covered`,
      });
    } else if (curr.startLine < expectedStart) {
      // Overlap: lines curr.startLine to prev.endLine are duplicated
      violations.push({
        type: 'overlap',
        startLine: curr.startLine,
        endLine: prev.endLine,
        message: `Overlap: lines ${curr.startLine}-${prev.endLine} covered by multiple chunks`,
      });
    }
  }

  // Check first chunk starts at line 1
  if (sorted.length > 0 && sorted[0]!.startLine > 1) {
    violations.push({
      type: 'gap',
      startLine: 1,
      endLine: sorted[0]!.startLine - 1,
      message: `Gap: lines 1-${sorted[0]!.startLine - 1} not covered (before first chunk)`,
    });
  }

  // Check last chunk ends at totalLines
  if (sorted.length > 0 && sorted[sorted.length - 1]!.endLine < totalLines) {
    const lastEnd = sorted[sorted.length - 1]!.endLine;
    violations.push({
      type: 'gap',
      startLine: lastEnd + 1,
      endLine: totalLines,
      message: `Gap: lines ${lastEnd + 1}-${totalLines} not covered (after last chunk)`,
    });
  }

  return {
    filePath,
    totalLines,
    chunkCount: chunks.length,
    violations,
  };
}

/**
 * Generate a summary report from multiple file validations.
 */
export function generateReport(validations: FileValidation[]): ChunkValidationReport {
  return {
    filesChecked: validations.length,
    filesWithGaps: validations.filter((v) => v.violations.some((x) => x.type === 'gap')).length,
    filesWithOverlaps: validations.filter((v) => v.violations.some((x) => x.type === 'overlap'))
      .length,
    filesWithOutOfBounds: validations.filter((v) =>
      v.violations.some((x) => x.type === 'out-of-bounds'),
    ).length,
    filesWithEmptySummaries: validations.filter((v) =>
      v.violations.some((x) => x.type === 'empty-summary'),
    ).length,
    fileValidations: validations,
  };
}

/**
 * Print validation report to console.
 */
export function printReport(report: ChunkValidationReport): void {
  console.log(`\nChunk Validation Report`);
  console.log(`  Files checked:              ${report.filesChecked}`);
  console.log(`  Files with gaps:            ${report.filesWithGaps}`);
  console.log(`  Files with overlaps:        ${report.filesWithOverlaps}`);
  console.log(`  Files with out-of-bounds:   ${report.filesWithOutOfBounds}`);
  console.log(`  Files with empty summaries: ${report.filesWithEmptySummaries}`);

  // Print worst offenders (files with most violations)
  const withViolations = report.fileValidations
    .filter((v) => v.violations.length > 0)
    .sort((a, b) => b.violations.length - a.violations.length);

  if (withViolations.length > 0) {
    console.log(`\n  Worst offenders:`);
    for (const fv of withViolations.slice(0, 10)) {
      console.log(`    ${fv.filePath}: ${fv.violations.length} violations`);
      for (const v of fv.violations.slice(0, 3)) {
        console.log(`      - [${v.type}] ${v.message}`);
      }
      if (fv.violations.length > 3) {
        console.log(`      ... and ${fv.violations.length - 3} more`);
      }
    }
  }
}
