/**
 * Side-by-side comparison of AST vs LLM chunk boundaries.
 * Per D-06: spike includes comparison for the same test files.
 */

import { parseFile } from '@ia-framework/ast-parser';
import type { LLMChunk } from './chunker.js';

export interface ComparisonResult {
  filePath: string;
  relativePath: string;
  astChunkCount: number;
  llmChunkCount: number;
  astBoundaries: Array<{
    startLine: number;
    endLine: number;
    name?: string | undefined;
    chunkType: string;
  }>;
  llmBoundaries: Array<{ startLine: number; endLine: number; summary: string }>;
  overlapScore: number; // 0-1, how much boundaries align
  coverageValid: boolean; // true if LLM chunks cover every line without gaps
}

/**
 * Compare LLM chunk boundaries with AST chunk boundaries for the same file.
 * Computes overlap score and validates coverage.
 */
export async function compareWithAST(params: {
  filePath: string;
  llmChunks: LLMChunk[];
  projectRoot: string;
}): Promise<ComparisonResult> {
  // Get AST chunks for this file
  const astChunks = await parseFile(params.filePath, { projectRoot: params.projectRoot });

  const relativePath = params.filePath.startsWith(params.projectRoot)
    ? params.filePath.slice(params.projectRoot.length + 1)
    : params.filePath;

  const astBoundaries = astChunks.map((chunk) => ({
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    name: chunk.name,
    chunkType: chunk.chunkType,
  }));

  const llmBoundaries = params.llmChunks.map((chunk) => ({
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    summary: chunk.summary,
  }));

  // Compute overlap score
  // For each AST chunk, find the best-matching LLM chunk (highest line overlap percentage)
  // Average across all AST chunks
  let totalOverlap = 0;

  if (astBoundaries.length > 0) {
    for (const ast of astBoundaries) {
      const astLen = ast.endLine - ast.startLine + 1;
      let bestOverlap = 0;

      for (const llm of llmBoundaries) {
        // Compute line overlap
        const overlapStart = Math.max(ast.startLine, llm.startLine);
        const overlapEnd = Math.min(ast.endLine, llm.endLine);
        const overlapLen = Math.max(0, overlapEnd - overlapStart + 1);

        // Overlap percentage relative to AST chunk
        const overlapPct = astLen > 0 ? overlapLen / astLen : 0;
        if (overlapPct > bestOverlap) bestOverlap = overlapPct;
      }

      totalOverlap += bestOverlap;
    }
  }

  const overlapScore = astBoundaries.length > 0 ? totalOverlap / astBoundaries.length : 0;

  // Validate LLM coverage: check that every line (1 to fileLineCount) is covered
  const fileLineCount =
    astBoundaries.length > 0
      ? Math.max(...astBoundaries.map((c) => c.endLine))
      : llmBoundaries.length > 0
        ? Math.max(...llmBoundaries.map((c) => c.endLine))
        : 0;

  const coverageValid = validateCoverage(params.llmChunks, fileLineCount);

  return {
    filePath: params.filePath,
    relativePath,
    astChunkCount: astChunks.length,
    llmChunkCount: params.llmChunks.length,
    astBoundaries,
    llmBoundaries,
    overlapScore,
    coverageValid,
  };
}

/**
 * Check that LLM chunks cover every line from 1 to lineCount without gaps.
 */
function validateCoverage(chunks: LLMChunk[], lineCount: number): boolean {
  if (lineCount === 0) return true;
  if (chunks.length === 0) return false;

  // Sort by startLine
  const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);

  // Check first chunk starts at line 1
  const first = sorted[0];
  if (!first || first.startLine !== 1) return false;

  // Check contiguous coverage (no gaps)
  let expectedNext = 1;
  for (const chunk of sorted) {
    if (chunk.startLine > expectedNext) {
      // Gap found
      return false;
    }
    expectedNext = chunk.endLine + 1;
  }

  // Check last chunk reaches fileLineCount (allow slightly more due to windowing)
  const last = sorted[sorted.length - 1];
  if (!last) return false;
  return last.endLine >= lineCount;
}
