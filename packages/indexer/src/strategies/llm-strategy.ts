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

export interface LlmChunkingOptions {
  /** Ollama model name, e.g. 'llama3.2:latest' */
  model: string;
  /** Ollama base URL (default: 'http://localhost:11434') */
  ollamaUrl?: string;
  /** Path to the LLM chunk cache JSON file */
  cachePath: string;
  /** Optional per-file progress callback for CLI display */
  onFileProgress?: (fileName: string, fileIndex: number, totalFiles: number) => void;
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
  private readonly onFileProgress?: LlmChunkingOptions['onFileProgress'];

  constructor(options: LlmChunkingOptions) {
    this.model = options.model;
    this.ollamaUrl = options.ollamaUrl;
    this.cache = new LlmChunkCache(options.cachePath);
    this.onFileProgress = options.onFileProgress;
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
    const cached = this.cache.get(contentHash, this.model);
    if (cached) {
      return this.mapToCodeChunks(cached, filePath, content, config);
    }

    // Cache miss — call Ollama via chunkFile (handles windowing for large files)
    const fileName = filePath.split('/').pop() ?? filePath;
    const result = await this.callWithRetry(filePath, content, fileName);

    // Cache the result
    const cachedEntries = result.chunks.map((c) => ({
      startLine: c.startLine,
      endLine: c.endLine,
      summary: c.summary,
    }));
    this.cache.set(contentHash, this.model, cachedEntries);

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
  ): Promise<{ chunks: LLMChunk[] }> {
    const params = {
      filePath,
      content,
      fileName,
      model: this.model,
      ...(this.ollamaUrl !== undefined && { baseUrl: this.ollamaUrl }),
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

    return entries.map((entry) => ({
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
    }));
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
}
