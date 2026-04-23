/**
 * Content-hash LLM chunk cache.
 * Stores LLM chunking results keyed by content hash + model name to avoid
 * re-processing unchanged files through Ollama.
 *
 * Cache key = sha256(fileContent) + ':' + modelName (per D-13).
 * Cache path is .ia-framework/llm-chunk-cache.json (per D-11).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface CachedChunkEntry {
  startLine: number;
  endLine: number;
  summary: string;
}

export class LlmChunkCache {
  private cache: Map<string, CachedChunkEntry[]>;
  private readonly cachePath: string;

  constructor(cachePath: string) {
    this.cachePath = cachePath;
    this.cache = new Map();
  }

  /**
   * Build cache key from content hash, model name, and prompt version.
   * Different models produce different chunk boundaries — cache must be per-model.
   * Different prompt versions produce different chunks — cache must be per-prompt-version.
   * Key format: `{contentHash}:{model}:{promptVersion}`
   */
  private makeKey(contentHash: string, model: string, promptVersion: number): string {
    return `${contentHash}:${model}:${promptVersion}`;
  }

  /**
   * Get cached chunks for a given content hash + model + prompt version.
   * Returns undefined on cache miss (including when prompt version changes).
   */
  get(contentHash: string, model: string, promptVersion: number): CachedChunkEntry[] | undefined {
    return this.cache.get(this.makeKey(contentHash, model, promptVersion));
  }

  /**
   * Store chunks in cache for a given content hash + model + prompt version.
   */
  set(contentHash: string, model: string, promptVersion: number, chunks: CachedChunkEntry[]): void {
    this.cache.set(this.makeKey(contentHash, model, promptVersion), chunks);
  }

  /**
   * Load cache from JSON file.
   * Resilient to missing or corrupt files — returns empty cache on error.
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.cachePath, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, CachedChunkEntry[]>;
      this.cache = new Map(Object.entries(parsed));
    } catch {
      // Missing file or corrupt JSON — start with empty cache
      this.cache = new Map();
    }
  }

  /**
   * Save cache to JSON file.
   * Creates parent directories if needed.
   */
  async save(): Promise<void> {
    const obj: Record<string, CachedChunkEntry[]> = Object.fromEntries(this.cache);
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify(obj, null, 2), 'utf-8');
  }
}
