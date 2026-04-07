import { describe, it, expect } from 'vitest';
import { chunkToDescription } from './chunk-description.js';
import type { CodeChunk } from '@ia-framework/ast-parser';

function makeChunk(overrides: Partial<CodeChunk>): CodeChunk {
  return {
    id: 'test-id',
    filePath: '/project/src/example.ts',
    relativePath: 'src/example.ts',
    language: 'TypeScript',
    chunkType: 'other',
    content: 'const x = 1;',
    startLine: 1,
    endLine: 5,
    imports: [],
    exports: [],
    ...overrides,
  };
}

describe('chunkToDescription', () => {
  it('function chunk: description contains "function", the name, and file path', () => {
    const chunk = makeChunk({
      chunkType: 'function',
      name: 'searchWithExpansion',
      relativePath: 'packages/retrieval/src/search-engine.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('function');
    expect(description).toContain('searchWithExpansion');
    expect(description).toContain('packages/retrieval/src/search-engine.ts');
  });

  it('class chunk: description contains "class" and the name', () => {
    const chunk = makeChunk({
      chunkType: 'class',
      name: 'QdrantVectorStore',
      relativePath: 'packages/vector-store/src/qdrant.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('class');
    expect(description).toContain('QdrantVectorStore');
  });

  it('interface chunk: description contains "interface" and the name', () => {
    const chunk = makeChunk({
      chunkType: 'interface',
      name: 'BenchmarkQuery',
      relativePath: 'packages/benchmark/src/types.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('interface');
    expect(description).toContain('BenchmarkQuery');
  });

  it('type chunk: description contains "type alias" and the name', () => {
    const chunk = makeChunk({
      chunkType: 'type',
      name: 'ProgressCallback',
      relativePath: 'packages/indexer/src/pipeline.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('type alias');
    expect(description).toContain('ProgressCallback');
  });

  it('enum chunk: description contains "enum" and the name', () => {
    const chunk = makeChunk({
      chunkType: 'enum',
      name: 'LogLevel',
      relativePath: 'packages/core/src/logger.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('enum');
    expect(description).toContain('LogLevel');
  });

  it('module chunk: description contains "module" and the file path', () => {
    const chunk = makeChunk({
      chunkType: 'module',
      relativePath: 'packages/indexer/src/index.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('module');
    expect(description).toContain('packages/indexer/src/index.ts');
  });

  it('other chunk: description contains the file path and language', () => {
    const chunk = makeChunk({
      chunkType: 'other',
      language: 'Python',
      relativePath: 'scripts/seed.py',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('scripts/seed.py');
    expect(description).toContain('Python');
  });

  it('chunk with parentName: description mentions parent context', () => {
    const chunk = makeChunk({
      chunkType: 'function',
      name: 'handleRequest',
      parentName: 'HttpServer',
      relativePath: 'packages/mcp-server/src/server.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('HttpServer');
    expect(description).toContain('inside');
  });

  it('chunk with non-empty exports: description mentions exported names', () => {
    const chunk = makeChunk({
      chunkType: 'function',
      name: 'searchWithExpansion',
      exports: ['searchWithExpansion', 'SearchResult'],
      relativePath: 'packages/retrieval/src/search-engine.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description).toContain('searchWithExpansion');
    expect(description).toContain('SearchResult');
    expect(description.toLowerCase()).toContain('export');
  });

  it('chunk with non-empty imports: description mentions imported modules', () => {
    const chunk = makeChunk({
      chunkType: 'class',
      name: 'QdrantVectorStore',
      imports: ['@qdrant/js-client-rest', '@ia-framework/core', 'crypto'],
      relativePath: 'packages/vector-store/src/qdrant.ts',
    });
    const description = chunkToDescription(chunk);
    expect(description.toLowerCase()).toContain('import');
    // Should mention module names (last segment)
    expect(description).toContain('js-client-rest');
  });

  it('returns a string ending with a period', () => {
    const chunk = makeChunk({ chunkType: 'function', name: 'foo' });
    expect(chunkToDescription(chunk)).toMatch(/\.$/);
  });

  it('handles anonymous function (no name) without crashing', () => {
    const chunk = makeChunk({ chunkType: 'function', name: undefined });
    const description = chunkToDescription(chunk);
    expect(description).toContain('function');
    expect(description).toContain('anonymous');
  });
});
