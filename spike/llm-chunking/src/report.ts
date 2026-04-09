/**
 * Report generator for the LLM chunking spike.
 * Produces both JSON results and a human-readable markdown GO/NO-GO report.
 * Per D-05, D-13, D-14.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the monorepo root (2 levels up from spike/llm-chunking/src/)
const SPIKE_SRC_DIR = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(SPIKE_SRC_DIR, '..', '..', '..');
import type { SpikeResults } from './measurement.js';
import type { ComparisonResult } from './ast-comparison.js';

/**
 * Generate JSON and markdown report content from spike results.
 */
export async function generateReport(
  results: SpikeResults,
  comparisons: ComparisonResult[],
): Promise<{ json: string; markdown: string }> {
  const json = JSON.stringify(results, null, 2);
  const markdown = buildMarkdown(results, comparisons);
  return { json, markdown };
}

/**
 * Write spike report files to disk.
 * - JSON to outputDir/spike-results.json
 * - Markdown to .planning/phases/12-llm-chunking-spike/12-SPIKE-REPORT.md
 */
export async function writeReport(
  results: SpikeResults,
  comparisons: ComparisonResult[],
  outputDir: string,
): Promise<void> {
  const { json, markdown } = await generateReport(results, comparisons);

  // Write JSON results
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'spike-results.json');
  await writeFile(jsonPath, json, 'utf-8');
  console.log(`[report] JSON results written to: ${jsonPath}`);

  // Write markdown report to the monorepo root's planning directory
  const reportPath = join(
    MONOREPO_ROOT,
    '.planning/phases/12-llm-chunking-spike/12-SPIKE-REPORT.md',
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, 'utf-8');
  console.log(`[report] GO/NO-GO report written to: ${reportPath}`);
}

function buildMarkdown(results: SpikeResults, comparisons: ComparisonResult[]): string {
  const lines: string[] = [];

  lines.push(`# LLM Chunking Spike Report`);
  lines.push(``);
  lines.push(`**Date:** ${results.timestamp}`);
  lines.push(`**Model:** ${results.model} (${results.modelInfo.parameterSize})`);
  lines.push(`**Context Window:** ${results.modelInfo.contextLength} tokens`);
  lines.push(`**Files Processed:** ${results.totalFilesProcessed}`);
  lines.push(``);

  // Verdict
  lines.push(`## Verdict`);
  lines.push(``);
  lines.push(`**${results.verdict}** — ${results.verdictReason}`);
  lines.push(``);

  // Hard Criteria
  lines.push(`## Hard Criteria Results`);
  lines.push(``);
  lines.push(`| Criterion | Result | Evidence |`);
  lines.push(`|-----------|--------|----------|`);

  const maxLatencyMs =
    results.latencyRecords.length > 0
      ? Math.max(...results.latencyRecords.map((r) => r.totalDurationMs))
      : 0;
  const latencyPass = results.latencyRecords.every((r) => r.totalDurationMs < 60000);
  const jsonPass = results.jsonValidityRate === 1.0;
  const deterministicCount = results.determinismResults.filter((r) => r.isIdentical).length;
  const totalDeterminismTests = results.determinismResults.length;
  const determinismPass = results.determinismResults.every((r) => r.isIdentical);
  const runCount = results.determinismResults[0]?.runCount ?? 5;

  lines.push(
    `| Latency ≤ 60s/file | ${latencyPass ? 'PASS ✓' : 'FAIL ✗'} | Max: ${Math.round(maxLatencyMs)}ms |`,
  );
  lines.push(
    `| 100% Valid JSON | ${jsonPass ? 'PASS ✓' : 'FAIL ✗'} | ${(results.jsonValidityRate * 100).toFixed(1)}% |`,
  );
  lines.push(
    `| Deterministic Boundaries | ${determinismPass ? 'PASS ✓' : 'FAIL ✗'} | ${deterministicCount}/${totalDeterminismTests} files identical across ${runCount} runs |`,
  );
  lines.push(``);

  // Latency by file size
  lines.push(`## Latency by File Size`);
  lines.push(``);
  lines.push(`| File | Lines | Category | Duration (ms) | Tokens/sec | Windowed |`);
  lines.push(`|------|-------|----------|---------------|------------|----------|`);
  for (const rec of results.latencyRecords) {
    lines.push(
      `| ${rec.relativePath} | ${rec.lineCount} | ${rec.sizeCategory} | ${Math.round(rec.totalDurationMs)} | ${rec.tokensPerSec.toFixed(1)} | ${rec.usedWindowing ? 'Yes' : 'No'} |`,
    );
  }
  lines.push(``);

  // Determinism results
  lines.push(`## Determinism Results`);
  lines.push(``);
  for (const det of results.determinismResults) {
    lines.push(`### ${det.relativePath}`);
    lines.push(``);
    lines.push(`- Runs: ${det.runCount}`);
    lines.push(`- Identical: ${det.isIdentical ? '✓ Yes' : '✗ No'}`);
    if (!det.isIdentical && det.diffs.length > 0) {
      lines.push(``);
      lines.push(`**Diffs:**`);
      lines.push(``);
      lines.push('```');
      for (const diff of det.diffs) {
        lines.push(diff);
      }
      lines.push('```');
    }
    lines.push(``);
  }

  // AST vs LLM comparison
  lines.push(`## AST vs LLM Comparison`);
  lines.push(``);
  for (const comp of comparisons) {
    lines.push(`### ${comp.relativePath}`);
    lines.push(``);
    lines.push(`- AST chunks: ${comp.astChunkCount} | LLM chunks: ${comp.llmChunkCount}`);
    lines.push(`- Overlap score: ${(comp.overlapScore * 100).toFixed(1)}%`);
    lines.push(`- Coverage valid: ${comp.coverageValid ? '✓' : '✗'}`);
    lines.push(``);

    if (comp.astBoundaries.length > 0) {
      lines.push(`**AST Boundaries:**`);
      lines.push(``);
      lines.push(`| Start | End | Type | Name |`);
      lines.push(`|-------|-----|------|------|`);
      for (const b of comp.astBoundaries) {
        lines.push(`| ${b.startLine} | ${b.endLine} | ${b.chunkType} | ${b.name ?? '-'} |`);
      }
      lines.push(``);
    }

    if (comp.llmBoundaries.length > 0) {
      lines.push(`**LLM Boundaries:**`);
      lines.push(``);
      lines.push(`| Start | End | Summary |`);
      lines.push(`|-------|-----|---------|`);
      for (const b of comp.llmBoundaries) {
        // Escape pipe chars in summary
        const summary = b.summary.replace(/\|/g, '\\|');
        lines.push(`| ${b.startLine} | ${b.endLine} | ${summary} |`);
      }
      lines.push(``);
    }
  }

  // Projected indexing time
  lines.push(`## Projected Indexing Time`);
  lines.push(``);
  const avgDurationMs =
    results.latencyRecords.length > 0
      ? results.latencyRecords.reduce((sum, r) => sum + r.totalDurationMs, 0) /
        results.latencyRecords.length
      : 0;

  lines.push(`| Codebase Size | Estimated Time |`);
  lines.push(`|---------------|----------------|`);
  lines.push(`| 500 files | ${results.projectedIndexingTime.files500} |`);
  lines.push(`| 2,000 files | ${results.projectedIndexingTime.files2000} |`);
  lines.push(``);
  lines.push(`Based on average ${Math.round(avgDurationMs)}ms per file.`);
  lines.push(``);

  // Failed files
  lines.push(`## Failed Files`);
  lines.push(``);
  if (results.failedFiles.length > 0) {
    lines.push(`| File | Error |`);
    lines.push(`|------|-------|`);
    for (const f of results.failedFiles) {
      lines.push(`| ${f.filePath} | ${f.error.replace(/\|/g, '\\|')} |`);
    }
  } else {
    lines.push(`None — all files processed successfully.`);
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(`*Generated by spike/llm-chunking on ${results.timestamp}*`);

  return lines.join('\n');
}
