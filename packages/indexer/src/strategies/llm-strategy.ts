/**
 * LLM-based chunking strategy using Ollama.
 * Implements ChunkingStrategy to produce CodeChunks with prose summaries
 * via local LLM inference. Includes content-hash caching to skip
 * re-processing unchanged files.
 *
 * Per D-05: LlmChunkingStrategy is a pluggable alternative to AstChunkingStrategy.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative, extname } from 'node:path';
import type { CodeChunk } from '@ia-framework/ast-parser';
import type { ChunkingStrategy, ChunkingConfig } from './types.js';
import { chunkFile, type LLMChunk } from './llm-chunker.js';
import { LlmChunkCache } from './llm-cache.js';
import { PROMPT_CONTENT_HASH } from './prompt.js';
import { loadPromptExamples, type PromptExamples } from './prompt-examples.js';
import {
  validateChunks,
  generateReport,
  printReport,
  type FileValidation,
  type ChunkValidationReport,
} from './chunk-validator.js';
import { scoreChunkSummary, type SummaryQualityScore } from './quality-scorer.js';

export interface LlmChunkingOptions {
  /** Ollama model name, e.g. 'llama3.2:latest' */
  model: string;
  /** Ollama base URL (default: 'http://localhost:11434') */
  ollamaUrl?: string;
  /** Path to the LLM chunk cache JSON file */
  cachePath: string;
  /** Prompt version from project config — used as part of the cache key (default: 1) */
  promptVersion?: number;
  /** Path to directory containing custom prompt example .md files (optional) */
  examplesDir?: string;
}

/** Extension → language mapping for CodeChunk.language field */
const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.cpp': 'cpp',
  '.c': 'c',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.php': 'php',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

/**
 * Derive a slug name from a summary string.
 * Takes first 5 words, lowercased, joined with hyphens.
 */
function slugifyName(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-');
}

/**
 * Format a 32-char hex string as a UUID (8-4-4-4-12).
 */
function hexToUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generate a deterministic chunk ID from filePath, startLine, endLine.
 * Per D-03 from Phase 03: chunk IDs are UUID via SHA-256 first 32 hex chars.
 */
function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  const hash = createHash('sha256')
    .update(`${filePath}:${startLine}:${endLine}`)
    .digest('hex')
    .slice(0, 32);
  return hexToUuid(hash);
}

/**
 * Detect programming language from file extension.
 */
function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? 'unknown';
}

/**
 * Extract lines from content (1-indexed, inclusive).
 */
function extractLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  // Convert 1-indexed to 0-indexed, slice is exclusive on end
  return lines.slice(startLine - 1, endLine).join('\n');
}

export class LlmChunkingStrategy implements ChunkingStrategy {
  readonly name = 'llm';

  private readonly model: string;
  private readonly ollamaUrl: string | undefined;
  private readonly cache: LlmChunkCache;
  private readonly promptVersion: number;
  private readonly examplesDir: string | undefined;
  private cachedExamples: PromptExamples | undefined;
  /** Accumulated validations per file — populated after each chunk() call. */
  private validations: FileValidation[] = [];
  /** Accumulated quality scores: { filePath, score }[] */
  private qualityEntries: Array<{ filePath: string; score: number }> = [];

  constructor(options: LlmChunkingOptions) {
    this.model = options.model;
    this.ollamaUrl = options.ollamaUrl;
    this.cache = new LlmChunkCache(options.cachePath);
    this.promptVersion = options.promptVersion ?? 1;
    this.examplesDir = options.examplesDir;
  }

  /**
   * Chunk a single file using Ollama LLM with content-hash caching.
   * Returns CodeChunk[] with chunkType='semantic' and description from LLM summary.
   */
  async chunk(filePath: string, config: ChunkingConfig): Promise<CodeChunk[]> {
    // Read file content
    const content = await readFile(filePath, 'utf-8');

    // Compute content hash for caching
    const contentHash = createHash('sha256').update(content).digest('hex');

    // Check cache
    const cached = this.cache.get(contentHash, this.model, this.promptVersion);
    if (cached) {
      // Run validation on cache-hit path
      const totalLines = content.split('\n').length;
      const validation = validateChunks(filePath, cached, totalLines);
      this.validations.push(validation);
      return this.mapToCodeChunks(cached, filePath, content, config);
    }

    // Cache miss — call Ollama via chunkFile (handles windowing for large files)
    const fileName = filePath.split('/').pop() ?? filePath;

    // Load examples (cached after first load)
    if (!this.cachedExamples) {
      this.cachedExamples = await loadPromptExamples(this.examplesDir);
    }

    const result = await this.callWithRetry(
      filePath,
      content,
      fileName,
      this.cachedExamples,
      config.signal,
    );

    // Cache the result
    const cachedEntries = result.chunks.map((c) => ({
      startLine: c.startLine,
      endLine: c.endLine,
      summary: c.summary,
    }));
    this.cache.set(contentHash, this.model, this.promptVersion, cachedEntries);

    // Run validation on cache-miss path
    const totalLines = content.split('\n').length;
    const validation = validateChunks(filePath, cachedEntries, totalLines);
    this.validations.push(validation);

    return this.mapToCodeChunks(cachedEntries, filePath, content, config);
  }

  /**
   * Call chunkFile with retry-once on failure (per D-19).
   * Try once, if fails retry once, if still fails throw.
   */
  private async callWithRetry(
    filePath: string,
    content: string,
    fileName: string,
    examples?: PromptExamples,
    signal?: AbortSignal,
  ): Promise<{ chunks: LLMChunk[] }> {
    const params = {
      filePath,
      content,
      fileName,
      model: this.model,
      ...(this.ollamaUrl !== undefined && { baseUrl: this.ollamaUrl }),
      ...(examples !== undefined && { examples }),
      signal,
    };

    try {
      return await chunkFile(params);
    } catch {
      // Retry once (D-19)
      return await chunkFile(params);
    }
  }

  /**
   * Map cached chunk entries to CodeChunk objects.
   */
  private mapToCodeChunks(
    entries: Array<{ startLine: number; endLine: number; summary: string }>,
    filePath: string,
    content: string,
    config: ChunkingConfig,
  ): CodeChunk[] {
    const language = detectLanguage(filePath);
    const relativePath = config.projectRoot ? relative(config.projectRoot, filePath) : filePath;

    return entries.map((entry) => {
      const qualityResult: SummaryQualityScore = scoreChunkSummary(entry.summary);
      this.qualityEntries.push({ filePath, score: qualityResult.score });

      return {
        id: makeChunkId(filePath, entry.startLine, entry.endLine),
        filePath,
        relativePath,
        language,
        chunkType: 'semantic' as const,
        name: slugifyName(entry.summary),
        content: extractLines(content, entry.startLine, entry.endLine),
        startLine: entry.startLine,
        endLine: entry.endLine,
        imports: [],
        exports: [],
        description: entry.summary,
        qualityScore: qualityResult.score,
      } as CodeChunk & { qualityScore: number };
    });
  }

  /**
   * Load cache from disk.
   */
  async loadCache(): Promise<void> {
    await this.cache.load();
  }

  /**
   * Save cache to disk.
   */
  async saveCache(): Promise<void> {
    await this.cache.save();
  }

  /**
   * Return metadata about the current prompt version and content hash.
   * Used by the indexer to store collection-level metadata in Qdrant.
   */
  getMetadata(): { promptVersion: number; promptContentHash: string } {
    return { promptVersion: this.promptVersion, promptContentHash: PROMPT_CONTENT_HASH };
  }

  /**
   * Get aggregated validation report for all chunked files.
   * Call after all files have been processed.
   */
  getValidationReport(): ChunkValidationReport {
    return generateReport(this.validations);
  }

  /**
   * Print the validation report to console.
   * // TODO: Call printValidationReport() after indexing completes
   */
  printValidationReport(): void {
    printReport(this.getValidationReport());
  }

  /**
   * Get quality report for all scored chunks.
   * Returns totals, low-quality count, average score, worst files, and score distribution.
   * Low quality threshold: score < 40.
   */
  getQualityReport(): {
    totalChunks: number;
    lowQualityCount: number;
    avgScore: number;
    worstFiles: Array<{ file: string; avgScore: number; lowCount: number }>;
    distribution: Record<string, number>;
  } {
    const LOW_QUALITY_THRESHOLD = 40;
    const totalChunks = this.qualityEntries.length;

    if (totalChunks === 0) {
      return {
        totalChunks: 0,
        lowQualityCount: 0,
        avgScore: 0,
        worstFiles: [],
        distribution: { '0-19': 0, '20-39': 0, '40-59': 0, '60-79': 0, '80-100': 0 },
      };
    }

    const lowQualityCount = this.qualityEntries.filter(
      (e) => e.score < LOW_QUALITY_THRESHOLD,
    ).length;
    const avgScore = Math.round(
      this.qualityEntries.reduce((sum, e) => sum + e.score, 0) / totalChunks,
    );

    // Distribution buckets
    const distribution: Record<string, number> = {
      '0-19': 0,
      '20-39': 0,
      '40-59': 0,
      '60-79': 0,
      '80-100': 0,
    };
    for (const { score } of this.qualityEntries) {
      if (score <= 19) distribution['0-19']!++;
      else if (score <= 39) distribution['20-39']!++;
      else if (score <= 59) distribution['40-59']!++;
      else if (score <= 79) distribution['60-79']!++;
      else distribution['80-100']!++;
    }

    // Group by file
    const byFile = new Map<string, number[]>();
    for (const { filePath, score } of this.qualityEntries) {
      const arr = byFile.get(filePath) ?? [];
      arr.push(score);
      byFile.set(filePath, arr);
    }

    const worstFiles = Array.from(byFile.entries())
      .map(([file, scores]) => ({
        file,
        avgScore: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
        lowCount: scores.filter((s) => s < LOW_QUALITY_THRESHOLD).length,
      }))
      .filter((f) => f.lowCount > 0)
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 10);

    return { totalChunks, lowQualityCount, avgScore, worstFiles, distribution };
  }

  /**
   * Print the quality report to console.
   */
  printQualityReport(): void {
    const report = this.getQualityReport();
    console.log(`\nChunk Summary Quality Report`);
    console.log(`  Total chunks:       ${report.totalChunks}`);
    console.log(`  Low quality (<40):  ${report.lowQualityCount}`);
    console.log(`  Average score:      ${report.avgScore}`);
    console.log(`  Distribution:`);
    for (const [bucket, count] of Object.entries(report.distribution)) {
      console.log(`    ${bucket}: ${count}`);
    }
    if (report.worstFiles.length > 0) {
      console.log(`\n  Worst files (by avg score):`);
      for (const f of report.worstFiles) {
        console.log(`    ${f.file}: avg=${f.avgScore}, lowCount=${f.lowCount}`);
      }
    }
  }
}
