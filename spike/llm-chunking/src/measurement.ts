/**
 * Measurement harnesses for the LLM chunking spike.
 * Tracks latency per file, runs determinism tests, and computes GO/NO-GO verdict.
 * Per D-08/D-09/D-10/D-11.
 */

import { chunkFile } from './chunker.js';
import type { LLMChunk } from './chunker.js';

export interface LatencyRecord {
  filePath: string;
  relativePath: string;
  lineCount: number;
  sizeCategory: 'small' | 'medium' | 'large';
  totalDurationMs: number;
  promptTokens: number;
  outputTokens: number;
  tokensPerSec: number;
  usedWindowing: boolean;
  windowCount: number;
}

export interface DeterminismResult {
  filePath: string;
  relativePath: string;
  runCount: number;
  isIdentical: boolean; // true if all runs produced identical boundaries
  boundaries: Array<{ startLine: number; endLine: number }>[][]; // per-run boundaries (outer=runs, inner=chunks)
  diffs: string[]; // human-readable diffs if not identical
}

export interface SpikeResults {
  model: string;
  modelInfo: { parameterSize: string; contextLength: number };
  timestamp: string;
  latencyRecords: LatencyRecord[];
  determinismResults: DeterminismResult[];
  jsonValidityRate: number; // 0-1, should be 1.0
  totalFilesProcessed: number;
  failedFiles: Array<{ filePath: string; error: string }>;
  verdict: 'GO' | 'NO-GO' | 'CONDITIONAL-GO';
  verdictReason: string;
  projectedIndexingTime: {
    files500: string; // e.g., "~25 minutes"
    files2000: string; // e.g., "~100 minutes"
  };
}

/**
 * Run determinism test: run the same file N times and compare chunk boundaries.
 * Per D-10: all runs must produce identical startLine/endLine pairs.
 */
export async function runDeterminismTest(params: {
  filePath: string;
  content: string;
  fileName: string;
  model: string;
  baseUrl?: string;
  numCtx?: number;
  runs?: number;
}): Promise<DeterminismResult> {
  const runCount = params.runs ?? 5; // Per D-10: 5 runs
  const allBoundaries: Array<{ startLine: number; endLine: number }>[] = [];

  const chunkParams: Parameters<typeof chunkFile>[0] = {
    filePath: params.filePath,
    content: params.content,
    fileName: params.fileName,
    model: params.model,
  };
  if (params.baseUrl !== undefined) chunkParams.baseUrl = params.baseUrl;
  if (params.numCtx !== undefined) chunkParams.numCtx = params.numCtx;

  // Run sequentially — parallel Ollama calls cause connection failures under load.
  for (let i = 0; i < runCount; i++) {
    const result = await chunkFile(chunkParams);
    allBoundaries.push(result.chunks.map((c) => ({ startLine: c.startLine, endLine: c.endLine })));
  }

  // Compare all runs to the first run
  const firstRun = allBoundaries[0];
  if (!firstRun) {
    return {
      filePath: params.filePath,
      relativePath: params.fileName,
      runCount,
      isIdentical: false,
      boundaries: allBoundaries.map((b) => [b]),
      diffs: ['No results returned from any run'],
    };
  }

  const diffs: string[] = [];
  let isIdentical = true;

  for (let i = 1; i < allBoundaries.length; i++) {
    const run = allBoundaries[i];
    if (!run) continue;
    const diff = compareBoundaries(firstRun, run, i + 1);
    if (diff) {
      isIdentical = false;
      diffs.push(diff);
    }
  }

  return {
    filePath: params.filePath,
    relativePath: params.fileName,
    runCount,
    isIdentical,
    // Store as array of per-run boundary arrays
    boundaries: allBoundaries.map((b) => [b]),
    diffs,
  };
}

/**
 * Compare two sets of boundaries and return a diff string if they differ.
 */
function compareBoundaries(
  expected: Array<{ startLine: number; endLine: number }>,
  actual: Array<{ startLine: number; endLine: number }>,
  runNumber: number,
): string | null {
  if (expected.length !== actual.length) {
    return `Run ${runNumber}: chunk count differs (expected ${expected.length}, got ${actual.length})`;
  }

  const differences: string[] = [];
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const act = actual[i];
    if (!exp || !act) continue;
    if (exp.startLine !== act.startLine || exp.endLine !== act.endLine) {
      differences.push(
        `  chunk[${i}]: expected [${exp.startLine}-${exp.endLine}], got [${act.startLine}-${act.endLine}]`,
      );
    }
  }

  if (differences.length > 0) {
    return `Run ${runNumber} differs:\n${differences.join('\n')}`;
  }

  return null;
}

/**
 * Compute GO/NO-GO verdict based on hard criteria.
 * Per D-11: 3 hard criteria must all pass.
 */
export function computeVerdict(results: SpikeResults): {
  verdict: 'GO' | 'NO-GO' | 'CONDITIONAL-GO';
  reason: string;
} {
  // Hard criterion 1: latency ≤ 60s per file (D-08)
  const maxLatencyMs = Math.max(...results.latencyRecords.map((r) => r.totalDurationMs), 0);
  const latencyPass = results.latencyRecords.every((r) => r.totalDurationMs < 60000);

  // Hard criterion 2: 100% valid JSON (D-09)
  const jsonPass = results.jsonValidityRate === 1.0;

  // Hard criterion 3: deterministic boundaries (D-10)
  const determinismPass = results.determinismResults.every((r) => r.isIdentical);
  const deterministicCount = results.determinismResults.filter((r) => r.isIdentical).length;
  const totalDeterminismTests = results.determinismResults.length;

  const reasons: string[] = [];
  reasons.push(
    `Latency: ${latencyPass ? 'PASS' : 'FAIL'} (max ${Math.round(maxLatencyMs)}ms, ceiling 60000ms)`,
  );
  reasons.push(
    `JSON validity: ${jsonPass ? 'PASS' : 'FAIL'} (${(results.jsonValidityRate * 100).toFixed(1)}%, required 100%)`,
  );
  reasons.push(
    `Determinism: ${determinismPass ? 'PASS' : 'FAIL'} (${deterministicCount}/${totalDeterminismTests} files identical across ${results.determinismResults[0]?.runCount ?? 5} runs)`,
  );

  const allPass = latencyPass && jsonPass && determinismPass;
  const verdict: 'GO' | 'NO-GO' = allPass ? 'GO' : 'NO-GO';
  const reason = reasons.join(' | ');

  return { verdict, reason };
}

/**
 * Extract LLM chunks from a chunking result for comparison.
 * Exported for use in ast-comparison.ts.
 */
export type { LLMChunk };
