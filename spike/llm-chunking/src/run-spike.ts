/**
 * Main entry point for the LLM chunking spike.
 * Orchestrates the full spike flow: file selection, latency test, determinism test,
 * AST comparison, and GO/NO-GO report generation.
 *
 * Usage:
 *   npx tsx src/run-spike.ts             # Full spike (requires Ollama + qwen2.5-coder:14b)
 *   npx tsx src/run-spike.ts --dry-run   # Preview files + prompt without Ollama calls
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@ia-framework/core';
import { getModelInfo } from './ollama-client.js';
import { chunkFile } from './chunker.js';
import { selectTestFiles } from './file-selector.js';
import { buildPrompt } from './prompt.js';
import { runDeterminismTest, computeVerdict } from './measurement.js';
import type { SpikeResults, LatencyRecord } from './measurement.js';
import { compareWithAST } from './ast-comparison.js';
import type { ComparisonResult } from './ast-comparison.js';
import { writeReport } from './report.js';

const MODEL = 'qwen2.5-coder:14b'; // Per D-15, D-17, D-21
const NUM_CTX = 32768; // 32K context window
const DETERMINISM_FILES_PER_CATEGORY = 1; // 1 small, 1 medium, 1 large
const OUTPUT_DIR = 'spike-output';

const isDryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  console.log('=== LLM Chunking Spike ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Context window: ${NUM_CTX} tokens`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no Ollama calls)' : 'FULL SPIKE'}`);
  console.log('');

  // Step 1: Load config to get targetProjectPath and Ollama baseUrl
  // Walk up from __dirname to find .ia-framework/project.json at the repo root,
  // so the spike works regardless of which directory it is run from.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const possibleRoots = [
    process.cwd(),
    resolve(__dirname, '../../..'), // spike/llm-chunking/src -> repo root
    resolve(__dirname, '../..'),
    resolve(__dirname, '..'),
  ];
  const configRelPath = '.ia-framework/project.json';
  const configAbsPath =
    possibleRoots.map((r) => resolve(r, configRelPath)).find((p) => existsSync(p)) ??
    resolve(process.cwd(), configRelPath);

  let targetProjectPath: string;
  let baseUrl: string | undefined;

  try {
    const config = await loadConfig(configAbsPath);
    targetProjectPath = config.targetProjectPath;
    baseUrl = config.embedding.baseUrl;
    console.log(`[config] Target project: ${targetProjectPath}`);
    if (baseUrl) console.log(`[config] Ollama base URL: ${baseUrl}`);
  } catch (err) {
    // Config not found — fall back to current directory for dry-run or error for full run
    if (isDryRun) {
      console.warn(
        '[config] .ia-framework/project.json not found — using current directory as target',
      );
      targetProjectPath = process.cwd();
      baseUrl = undefined;
    } else {
      console.error(
        '[error] Could not load .ia-framework/project.json:',
        err instanceof Error ? err.message : String(err),
      );
      console.error(
        '[error] Create a config file with targetProjectPath before running the full spike.',
      );
      process.exit(1);
    }
  }

  const resolvedBaseUrl = baseUrl ?? 'http://localhost:11434';

  // Step 2: Get model info (skip in dry-run)
  let modelInfo = { parameterSize: 'unknown', contextLength: NUM_CTX };

  if (!isDryRun) {
    try {
      modelInfo = await getModelInfo(MODEL, resolvedBaseUrl);
      console.log(
        `[model] ${MODEL}: ${modelInfo.parameterSize}, context ${modelInfo.contextLength}`,
      );
    } catch (err) {
      console.error(
        `[error] Could not get model info for '${MODEL}':`,
        err instanceof Error ? err.message : String(err),
      );
      console.error(`[error] Ensure Ollama is running and the model is available:`);
      console.error(`  ollama serve`);
      console.error(`  ollama pull ${MODEL}`);
      process.exit(1);
    }
  }

  // Step 3: Select test files
  console.log(`\n[files] Scanning target project for representative files...`);
  const selectedFiles = await selectTestFiles(targetProjectPath);

  if (selectedFiles.length === 0) {
    console.error('[error] No source files found in target project. Check targetProjectPath.');
    process.exit(1);
  }

  console.log(`[files] Selected ${selectedFiles.length} files for spike:`);
  for (const f of selectedFiles) {
    console.log(`  [${f.sizeCategory}] ${f.relativePath} (${f.lineCount} lines)`);
  }

  // Step 4: Dry-run — show prompt sample and exit
  if (isDryRun) {
    console.log('\n=== DRY RUN: Prompt Preview ===\n');
    const firstFile = selectedFiles[0];
    if (firstFile) {
      const content = await readFile(firstFile.filePath, 'utf-8');
      const prompt = buildPrompt(content, firstFile.relativePath);
      const previewLines = prompt.split('\n').slice(0, 40).join('\n');
      console.log(`File: ${firstFile.relativePath} (${firstFile.lineCount} lines)`);
      console.log('--- Prompt preview (first 40 lines) ---');
      console.log(previewLines);
      console.log('--- End preview ---');
      const estimatedTokens = Math.ceil(content.length / 4);
      console.log(`\nEstimated tokens: ~${estimatedTokens}`);
    }
    console.log('\n[dry-run] Selected files:');
    for (const f of selectedFiles) {
      console.log(`  ${f.relativePath}: ${f.lineCount} lines (${f.sizeCategory})`);
    }
    console.log('\n[dry-run] Model info (would fetch from Ollama):');
    console.log(`  Model: ${MODEL}`);
    console.log(`  Base URL: ${resolvedBaseUrl}`);
    console.log(`  Context: ${NUM_CTX} tokens`);
    console.log('\n[dry-run] Complete. No Ollama calls made.');
    return;
  }

  // Step 5: Latency test — chunk each file and record metrics
  console.log('\n=== Latency Test ===\n');

  const latencyRecords: LatencyRecord[] = [];
  const comparisons: ComparisonResult[] = [];
  const failedFiles: Array<{ filePath: string; error: string }> = [];
  let successCount = 0;
  let totalAttempts = 0;

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    if (!file) continue;

    totalAttempts++;
    console.log(`[${i + 1}/${selectedFiles.length}] Processing ${file.relativePath}...`);

    let content: string;
    try {
      content = await readFile(file.filePath, 'utf-8');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  [error] Could not read file: ${errMsg}`);
      failedFiles.push({ filePath: file.filePath, error: `Read error: ${errMsg}` });
      continue;
    }

    try {
      const chunkParams: Parameters<typeof chunkFile>[0] = {
        filePath: file.filePath,
        content,
        fileName: file.relativePath,
        model: MODEL,
        numCtx: NUM_CTX,
      };
      if (baseUrl !== undefined) chunkParams.baseUrl = baseUrl;

      const result = await chunkFile(chunkParams);

      const usedWindowing = result.rawResponse.startsWith('[windowed:');
      const windowMatch = result.rawResponse.match(/\[windowed: (\d+) windows\]/);
      const windowCount = windowMatch ? parseInt(windowMatch[1] ?? '1', 10) : 1;

      latencyRecords.push({
        filePath: file.filePath,
        relativePath: file.relativePath,
        lineCount: file.lineCount,
        sizeCategory: file.sizeCategory,
        totalDurationMs: result.metrics.totalDurationMs,
        promptTokens: result.metrics.promptTokens,
        outputTokens: result.metrics.outputTokens,
        tokensPerSec: result.metrics.tokensPerSec,
        usedWindowing,
        windowCount,
      });

      successCount++;
      console.log(
        `  ✓ ${Math.round(result.metrics.totalDurationMs)}ms | ${result.chunks.length} chunks | ${result.metrics.tokensPerSec.toFixed(1)} tok/s`,
      );

      // AST comparison
      try {
        const compareParams: Parameters<typeof compareWithAST>[0] = {
          filePath: file.filePath,
          llmChunks: result.chunks,
          projectRoot: targetProjectPath,
        };
        const comparison = await compareWithAST(compareParams);
        comparisons.push(comparison);
        console.log(
          `  AST: ${comparison.astChunkCount} chunks | LLM: ${comparison.llmChunkCount} chunks | overlap: ${(comparison.overlapScore * 100).toFixed(1)}% | coverage: ${comparison.coverageValid ? '✓' : '✗'}`,
        );
      } catch (astErr) {
        console.warn(
          `  [warn] AST comparison failed: ${astErr instanceof Error ? astErr.message : String(astErr)}`,
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  [error] Chunking failed: ${errMsg}`);
      failedFiles.push({ filePath: file.filePath, error: errMsg });
    }
  }

  // Step 6: Determinism test — 3 representative files (1 per category)
  console.log('\n=== Determinism Test ===\n');
  console.log(`Running 5 iterations per file with temperature=0, seed=42...`);

  const determinismFiles: typeof selectedFiles = [];
  const seenCategories = new Set<string>();

  // Pick 1 file per size category for determinism testing
  for (const file of selectedFiles) {
    if (!seenCategories.has(file.sizeCategory) && determinismFiles.length < 3) {
      seenCategories.add(file.sizeCategory);
      determinismFiles.push(file);
    }
  }

  // Run determinism tests sequentially — parallel Ollama calls cause connection failures.
  const determinismResults = [];
  for (const file of determinismFiles) {
    console.log(`  Testing determinism: ${file.relativePath} (${file.sizeCategory})...`);
    let content: string;
    try {
      content = await readFile(file.filePath, 'utf-8');
    } catch {
      determinismResults.push({
        filePath: file.filePath,
        relativePath: file.relativePath,
        runCount: 5,
        isIdentical: false,
        boundaries: [] as Array<Array<Array<{ startLine: number; endLine: number }>>>,
        diffs: ['Could not read file'],
      });
      continue;
    }

    try {
      const detParams: Parameters<typeof runDeterminismTest>[0] = {
        filePath: file.filePath,
        content,
        fileName: file.relativePath,
        model: MODEL,
        numCtx: NUM_CTX,
        runs: 5,
      };
      if (baseUrl !== undefined) detParams.baseUrl = baseUrl;

      const det = await runDeterminismTest(detParams);
      console.log(`  ${file.relativePath}: ${det.isIdentical ? '✓ Identical' : '✗ Differs'}`);
      if (!det.isIdentical) {
        for (const diff of det.diffs) {
          console.log(`    ${diff}`);
        }
      }
      determinismResults.push(det);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  [error] Determinism test failed for ${file.relativePath}: ${errMsg}`);
      determinismResults.push({
        filePath: file.filePath,
        relativePath: file.relativePath,
        runCount: 5,
        isIdentical: false,
        boundaries: [] as Array<Array<Array<{ startLine: number; endLine: number }>>>,
        diffs: [`Error: ${errMsg}`],
      });
    }
  }

  // Step 7: Compute verdict
  const jsonValidityRate = totalAttempts > 0 ? successCount / totalAttempts : 0;
  const avgDurationMs =
    latencyRecords.length > 0
      ? latencyRecords.reduce((sum, r) => sum + r.totalDurationMs, 0) / latencyRecords.length
      : 0;

  // Projected indexing times (per D-14)
  const files500Minutes = (avgDurationMs * 500) / 1000 / 60;
  const files2000Minutes = (avgDurationMs * 2000) / 1000 / 60;

  const partialResults: Omit<SpikeResults, 'verdict' | 'verdictReason'> = {
    model: MODEL,
    modelInfo,
    timestamp: new Date().toISOString(),
    latencyRecords,
    determinismResults,
    jsonValidityRate,
    totalFilesProcessed: successCount,
    failedFiles,
    projectedIndexingTime: {
      files500: `~${Math.round(files500Minutes)} minutes`,
      files2000: `~${Math.round(files2000Minutes)} minutes`,
    },
  };

  const { verdict, reason } = computeVerdict({
    ...partialResults,
    verdict: 'GO', // placeholder for computeVerdict call
    verdictReason: '',
  });

  const results: SpikeResults = {
    ...partialResults,
    verdict,
    verdictReason: reason,
  };

  // Step 8: Generate and write report
  console.log('\n=== Generating Report ===\n');
  await writeReport(results, comparisons, OUTPUT_DIR);

  // Step 9: Print verdict to console
  const verdictColor =
    verdict === 'GO' ? '\x1b[32m' : verdict === 'NO-GO' ? '\x1b[31m' : '\x1b[33m';
  const reset = '\x1b[0m';

  console.log('');
  console.log(`${verdictColor}=== VERDICT: ${verdict} ===${reset}`);
  console.log(reason);
  console.log('');
  console.log(`Report: .planning/phases/12-llm-chunking-spike/12-SPIKE-REPORT.md`);
  console.log(`JSON:   ${OUTPUT_DIR}/spike-results.json`);

  // Exit with code 0 for GO, 1 for NO-GO
  process.exit(verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  console.error('[fatal]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
