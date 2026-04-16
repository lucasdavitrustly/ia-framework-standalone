import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmChunkingStrategy } from './llm-strategy.js';
import type { LlmChunkingOptions } from './llm-strategy.js';
import type { ChunkingConfig } from './types.js';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Mock the chunkFile function from llm-chunker
vi.mock('./llm-chunker.js', () => ({
  chunkFile: vi.fn(),
}));

describe('LlmChunkingStrategy', () => {
  let tmpDir: string;
  let cachePath: string;
  let sourceDir: string;
  let options: LlmChunkingOptions;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `llm-strategy-test-${randomUUID()}`);
    sourceDir = join(tmpDir, 'src');
    await mkdir(sourceDir, { recursive: true });
    cachePath = join(tmpDir, 'llm-chunk-cache.json');
    options = {
      model: 'llama3.2:latest',
      cachePath,
    };
    vi.resetAllMocks();
  });

  it('name property returns "llm"', () => {
    const strategy = new LlmChunkingStrategy(options);
    expect(strategy.name).toBe('llm');
  });

  it('chunk() returns CodeChunk[] with chunkType="semantic", empty imports/exports, and description', async () => {
    const fileContent = 'function hello() {\n  return "world";\n}\n';
    const filePath = join(sourceDir, 'test.ts');
    await writeFile(filePath, fileContent, 'utf-8');

    const { chunkFile } = await import('./llm-chunker.js');
    const mockChunkFile = vi.mocked(chunkFile);
    mockChunkFile.mockResolvedValue({
      chunks: [{ startLine: 1, endLine: 3, summary: 'Hello function returns a greeting string' }],
      metrics: {
        totalDurationMs: 100,
        promptTokens: 50,
        outputTokens: 20,
        tokensPerSec: 10,
        loadDurationMs: 5,
        promptEvalDurationMs: 30,
        evalDurationMs: 60,
      },
      rawResponse: '{}',
    });

    const strategy = new LlmChunkingStrategy(options);
    const config: ChunkingConfig = { projectRoot: tmpDir };
    const chunks = await strategy.chunk(filePath, config);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkType).toBe('semantic');
    expect(chunks[0]!.imports).toEqual([]);
    expect(chunks[0]!.exports).toEqual([]);
    expect(chunks[0]!.description).toBe('Hello function returns a greeting string');
  });

  it('chunk() uses cache — returns cached result without calling Ollama on cache hit', async () => {
    const fileContent = 'const x = 1;\n';
    const filePath = join(sourceDir, 'cached.ts');
    await writeFile(filePath, fileContent, 'utf-8');

    const contentHash = createHash('sha256').update(fileContent).digest('hex');
    const { chunkFile } = await import('./llm-chunker.js');
    const mockChunkFile = vi.mocked(chunkFile);

    // Pre-populate cache
    const strategy = new LlmChunkingStrategy(options);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private cache for test setup
    const cache = (strategy as any)['cache'];
    cache.set(contentHash, 'llama3.2:latest', [
      { startLine: 1, endLine: 1, summary: 'Variable declaration' },
    ]);

    const config: ChunkingConfig = { projectRoot: tmpDir };
    const chunks = await strategy.chunk(filePath, config);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.description).toBe('Variable declaration');
    // chunkFile should NOT have been called — cache hit
    expect(mockChunkFile).not.toHaveBeenCalled();
  });

  it('chunk() calls Ollama and caches result on cache miss', async () => {
    const fileContent = 'export function add(a: number, b: number) { return a + b; }\n';
    const filePath = join(sourceDir, 'add.ts');
    await writeFile(filePath, fileContent, 'utf-8');

    const { chunkFile } = await import('./llm-chunker.js');
    const mockChunkFile = vi.mocked(chunkFile);
    mockChunkFile.mockResolvedValue({
      chunks: [
        { startLine: 1, endLine: 1, summary: 'Exports an add function that sums two numbers' },
      ],
      metrics: {
        totalDurationMs: 200,
        promptTokens: 60,
        outputTokens: 25,
        tokensPerSec: 12,
        loadDurationMs: 10,
        promptEvalDurationMs: 50,
        evalDurationMs: 100,
      },
      rawResponse: '{}',
    });

    const strategy = new LlmChunkingStrategy(options);
    const config: ChunkingConfig = { projectRoot: tmpDir };
    const chunks = await strategy.chunk(filePath, config);

    expect(chunks).toHaveLength(1);
    expect(mockChunkFile).toHaveBeenCalledOnce();

    // Verify cache was populated — calling again should use cache
    mockChunkFile.mockClear();
    const chunks2 = await strategy.chunk(filePath, config);
    expect(chunks2).toHaveLength(1);
    expect(mockChunkFile).not.toHaveBeenCalled();
  });

  it('chunk name is derived from summary (slugified first words)', async () => {
    const fileContent = 'class Foo {}\n';
    const filePath = join(sourceDir, 'foo.ts');
    await writeFile(filePath, fileContent, 'utf-8');

    const { chunkFile } = await import('./llm-chunker.js');
    const mockChunkFile = vi.mocked(chunkFile);
    mockChunkFile.mockResolvedValue({
      chunks: [{ startLine: 1, endLine: 1, summary: 'Defines a Foo class for handling requests' }],
      metrics: {
        totalDurationMs: 50,
        promptTokens: 30,
        outputTokens: 15,
        tokensPerSec: 10,
        loadDurationMs: 5,
        promptEvalDurationMs: 15,
        evalDurationMs: 25,
      },
      rawResponse: '{}',
    });

    const strategy = new LlmChunkingStrategy(options);
    const config: ChunkingConfig = { projectRoot: tmpDir };
    const chunks = await strategy.chunk(filePath, config);

    expect(chunks[0]!.name).toMatch(/^defines-a-foo-class-for$/);
  });

  it('chunk id is SHA-based hash of filePath:startLine:endLine', async () => {
    const fileContent = 'const y = 2;\nconst z = 3;\n';
    const filePath = join(sourceDir, 'ids.ts');
    await writeFile(filePath, fileContent, 'utf-8');

    const { chunkFile } = await import('./llm-chunker.js');
    const mockChunkFile = vi.mocked(chunkFile);
    mockChunkFile.mockResolvedValue({
      chunks: [{ startLine: 1, endLine: 2, summary: 'Constant declarations' }],
      metrics: {
        totalDurationMs: 50,
        promptTokens: 30,
        outputTokens: 15,
        tokensPerSec: 10,
        loadDurationMs: 5,
        promptEvalDurationMs: 15,
        evalDurationMs: 25,
      },
      rawResponse: '{}',
    });

    const strategy = new LlmChunkingStrategy(options);
    const config: ChunkingConfig = { projectRoot: tmpDir };
    const chunks = await strategy.chunk(filePath, config);

    // ID should be a UUID-formatted SHA-256 hash
    const expectedHash = createHash('sha256').update(`${filePath}:1:2`).digest('hex').slice(0, 32);
    const expectedId = `${expectedHash.slice(0, 8)}-${expectedHash.slice(8, 12)}-${expectedHash.slice(12, 16)}-${expectedHash.slice(16, 20)}-${expectedHash.slice(20, 32)}`;

    expect(chunks[0]!.id).toBe(expectedId);
  });
});
