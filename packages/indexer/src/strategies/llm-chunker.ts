/**
 * Core chunking module.
 * Handles both single-request and windowed (large file) chunking flows.
 *
 * Ported from spike/llm-chunking/src/chunker.ts — validated in Phase 12 spike.
 */

import { generateChunks, type ChunkingResult, type LLMChunk } from './ollama-client.js';
import { buildPrompt } from './prompt.js';

export type { ChunkingResult, LLMChunk };

/**
 * Chunk a file using Ollama LLM.
 * Automatically switches to windowed processing for large files that exceed context.
 */
/** Round up to the next power of 2, clamped to [min, max]. */
function clampedPow2(value: number, min: number, max: number): number {
  let p = min;
  while (p < value && p < max) p *= 2;
  return Math.min(p, max);
}

export async function chunkFile(params: {
  filePath: string;
  content: string;
  fileName: string;
  model: string;
  baseUrl?: string;
  numCtx?: number;
  signal?: AbortSignal | undefined;
  examples?: { good: string; bad: string };
}): Promise<ChunkingResult> {
  const maxCtx = params.numCtx ?? 32768;
  const estimatedTokens = Math.ceil(params.content.length / 4);
  const maxSourceTokens = Math.floor(maxCtx * 0.9);

  if (estimatedTokens < maxSourceTokens) {
    // Single request — file fits within context window.
    // Auto-size numCtx to avoid allocating a huge KV cache for small files.
    // Use prompt tokens * 2 (headroom for output), rounded up to a power of 2.
    const promptEstimate = Math.ceil(params.content.length / 4) + 400; // +400 for prompt template
    const numCtx = clampedPow2(promptEstimate * 2, 2048, maxCtx);

    const prompt = buildPrompt(
      params.content,
      params.fileName,
      params.examples ? { examples: params.examples } : undefined,
    );
    const generateParams: Parameters<typeof generateChunks>[0] = {
      prompt,
      model: params.model,
      numCtx,
      signal: params.signal,
    };
    if (params.baseUrl !== undefined) generateParams.baseUrl = params.baseUrl;
    return generateChunks(generateParams);
  } else {
    // Large file — use windowed processing
    const windowingParams: Parameters<typeof chunkFileWithWindowing>[0] = {
      filePath: params.filePath,
      content: params.content,
      fileName: params.fileName,
      model: params.model,
      numCtx: maxCtx,
      signal: params.signal,
    };
    if (params.baseUrl !== undefined) windowingParams.baseUrl = params.baseUrl;
    if (params.examples !== undefined) windowingParams.examples = params.examples;
    return chunkFileWithWindowing(windowingParams);
  }
}

/**
 * Chunk a large file by splitting it into overlapping windows.
 * Results are stitched together after processing each window.
 * Per D-22/D-23/D-24/D-25.
 */
export async function chunkFileWithWindowing(params: {
  filePath: string;
  content: string;
  fileName: string;
  model: string;
  baseUrl?: string;
  numCtx?: number;
  overlapLines?: number;
  signal?: AbortSignal | undefined;
  examples?: { good: string; bad: string };
}): Promise<ChunkingResult> {
  const maxCtx = params.numCtx ?? 32768;
  const overlapLines = params.overlapLines ?? 20; // per D-24 default
  // Use a conservative window size to avoid large KV cache allocation.
  // Each window targets ~150 lines (≈3000 tokens of source), auto-sized via clampedPow2.
  const WINDOW_TARGET_TOKENS = 3000; // tokens of source per window
  const windowNumCtx = clampedPow2(WINDOW_TARGET_TOKENS * 2 + 800, 2048, maxCtx);
  const maxSourceTokens = Math.floor(windowNumCtx * 0.9);
  const maxCharsPerWindow = maxSourceTokens * 4; // reverse of token estimation

  const lines = params.content.split('\n');
  const totalLines = lines.length;

  // Build windows (split by line boundaries, with overlap)
  const windows: Array<{ startLine: number; lines: string[] }> = [];
  let currentStart = 0;

  while (currentStart < totalLines) {
    const windowLines: string[] = [];
    let charCount = 0;
    let i = currentStart;

    while (i < totalLines) {
      const line = lines[i] ?? '';
      const lineWithNewline = line + '\n';
      if (charCount + lineWithNewline.length > maxCharsPerWindow && windowLines.length > 0) {
        break;
      }
      windowLines.push(line);
      charCount += lineWithNewline.length;
      i++;
    }

    windows.push({ startLine: currentStart + 1, lines: windowLines }); // 1-indexed

    if (i >= totalLines) break;

    // Next window starts with overlap — go back overlapLines from where we stopped
    currentStart = Math.max(currentStart + 1, i - overlapLines);
  }

  // Process each window
  const allChunks: LLMChunk[] = [];
  let totalDurationMs = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let totalEvalDurationNs = 0;
  let totalLoadDurationMs = 0;

  for (let winIdx = 0; winIdx < windows.length; winIdx++) {
    const win = windows[winIdx];
    if (!win) continue;

    // Check for cancellation between windows
    if (params.signal?.aborted) {
      throw new Error('Indexing cancelled');
    }

    const windowContent = win.lines.join('\n');
    const windowOffset = win.startLine - 1; // 0-indexed offset for line number adjustment

    const prompt = buildPrompt(
      windowContent,
      params.fileName,
      params.examples ? { examples: params.examples } : undefined,
    );
    const genParams: Parameters<typeof generateChunks>[0] = {
      prompt,
      model: params.model,
      numCtx: windowNumCtx,
      signal: params.signal,
    };
    if (params.baseUrl !== undefined) genParams.baseUrl = params.baseUrl;
    const result = await generateChunks(genParams);

    // Adjust line numbers to be relative to the full file
    const adjustedChunks: LLMChunk[] = result.chunks.map((chunk) => ({
      startLine: chunk.startLine + windowOffset,
      endLine: chunk.endLine + windowOffset,
      summary: chunk.summary,
    }));

    allChunks.push(...adjustedChunks);

    // Accumulate metrics
    totalDurationMs += result.metrics.totalDurationMs;
    totalPromptTokens += result.metrics.promptTokens;
    totalOutputTokens += result.metrics.outputTokens;
    totalLoadDurationMs += result.metrics.loadDurationMs;
    // For tokensPerSec, we'll recompute from eval durations
    totalEvalDurationNs += result.metrics.evalDurationMs * 1e6; // convert ms back to ns for accumulation
  }

  // Stitch results: sort by startLine, merge overlapping chunks
  const stitched = stitchChunks(allChunks);

  // Recompute tokensPerSec from total eval time
  const totalEvalDurationSec = totalEvalDurationNs / 1e9;
  const tokensPerSec = totalEvalDurationSec > 0 ? totalOutputTokens / totalEvalDurationSec : 0;

  return {
    chunks: stitched,
    metrics: {
      totalDurationMs,
      promptTokens: totalPromptTokens,
      outputTokens: totalOutputTokens,
      tokensPerSec,
      loadDurationMs: totalLoadDurationMs,
      promptEvalDurationMs: 0, // aggregated, not meaningful
      evalDurationMs: totalEvalDurationNs / 1e6,
    },
    rawResponse: `[windowed: ${windows.length} windows]`,
  };
}

/**
 * Stitch chunks from multiple windows by sorting and merging overlapping ranges.
 * Per D-25: if chunk A's endLine >= chunk B's startLine, merge them.
 */
function stitchChunks(chunks: LLMChunk[]): LLMChunk[] {
  if (chunks.length === 0) return [];

  // Sort by startLine
  const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);

  // Deduplicate exact duplicates
  const deduped: LLMChunk[] = [];
  for (const chunk of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.startLine === chunk.startLine && last.endLine === chunk.endLine) {
      // Exact duplicate — skip
      continue;
    }
    deduped.push(chunk);
  }

  // Merge overlapping chunks
  const merged: LLMChunk[] = [];
  for (const chunk of deduped) {
    const last = merged[merged.length - 1];
    if (last && last.endLine >= chunk.startLine) {
      // Overlap — merge ranges
      // Use the summary from the chunk that is more fully contained (higher endLine = more context)
      merged[merged.length - 1] = {
        startLine: Math.min(last.startLine, chunk.startLine),
        endLine: Math.max(last.endLine, chunk.endLine),
        // Use the summary from whichever chunk has the larger range (more context)
        summary:
          chunk.endLine - chunk.startLine > last.endLine - last.startLine
            ? chunk.summary
            : last.summary,
      };
    } else {
      merged.push({ ...chunk });
    }
  }

  return merged;
}
