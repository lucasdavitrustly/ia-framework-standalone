import { describe, it, expect, vi } from 'vitest';
import type { ModuleDepsEngine } from './get-module-dependencies.js';
import { getModuleDependenciesHandler } from './get-module-dependencies.js';
import { createSearchByModuleAdapter } from '../server.js';
import type { ModuleGraphJSON } from '@ia-framework/core';
import type { SearchEngine } from '@ia-framework/retrieval';

function makeMockGraph(): ModuleGraphJSON {
  return {
    version: 1,
    modules: {
      'com.example:core': {
        coordinate: { groupId: 'com.example', artifactId: 'core', version: '1.0.0' },
        dependencies: [],
        interfaces: [],
        dtos: [],
        pomPath: 'core/pom.xml',
        sourceRoot: 'core/src/main/java',
      },
      'com.example:service': {
        coordinate: { groupId: 'com.example', artifactId: 'service', version: '1.0.0' },
        dependencies: ['com.example:core'],
        interfaces: [],
        dtos: [],
        pomPath: 'service/pom.xml',
        sourceRoot: 'service/src/main/java',
      },
      'com.example:api': {
        coordinate: { groupId: 'com.example', artifactId: 'api', version: '1.0.0' },
        dependencies: ['com.example:service'],
        interfaces: [],
        dtos: [],
        pomPath: 'api/pom.xml',
        sourceRoot: 'api/src/main/java',
      },
    },
  };
}

function makeMockEngine(graph: ModuleGraphJSON | null = makeMockGraph()): ModuleDepsEngine {
  return {
    getModuleGraph: () => graph,
    searchByModule: async (_moduleName: string, _limit: number) => [
      {
        relativePath: 'service/src/main/java/UserService.java',
        chunkType: 'class',
        name: 'UserService',
        content: 'public class UserService { }',
      },
    ],
  };
}

describe('getModuleDependenciesHandler', () => {
  it('returns direct deps for a known module', async () => {
    const engine = makeMockEngine();
    const result = await getModuleDependenciesHandler(engine, {
      moduleName: 'com.example:service',
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('com.example:core');
    expect(text).toContain('Direct');
  });

  it('returns transitive deps up to 2 hops', async () => {
    const engine = makeMockEngine();
    const result = await getModuleDependenciesHandler(engine, { moduleName: 'com.example:api' });
    const text = (result.content[0] as { type: string; text: string }).text;
    // api -> service -> core (2 hops)
    expect(text).toContain('com.example:core');
    expect(text).toContain('com.example:service');
    expect(text).toContain('Transitive');
  });

  it('does partial match on artifactId when moduleName has no colon', async () => {
    const engine = makeMockEngine();
    const result = await getModuleDependenciesHandler(engine, { moduleName: 'service' });
    const text = (result.content[0] as { type: string; text: string }).text;
    // Should find com.example:service via partial match
    expect(text).toContain('com.example:service');
    expect(text).toContain('com.example:core');
  });

  it('returns error content when module not found', async () => {
    const engine = makeMockEngine();
    const result = await getModuleDependenciesHandler(engine, { moduleName: 'nonexistent' });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('not found');
    expect(text).toContain('Available');
  });

  it('includes top-5 interface/DTO chunks from search', async () => {
    const engine = makeMockEngine();
    const result = await getModuleDependenciesHandler(engine, {
      moduleName: 'com.example:service',
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('UserService');
  });

  it('returns message when no module graph available', async () => {
    const engine = makeMockEngine(null);
    const result = await getModuleDependenciesHandler(engine, { moduleName: 'anything' });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('No Maven module graph');
  });

  it('formats interface chunks with code blocks under Key Interface/DTO Chunks', async () => {
    const engine = makeMockEngine();
    const result = await getModuleDependenciesHandler(engine, {
      moduleName: 'com.example:service',
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Key Interface/DTO Chunks');
    expect(text).toContain('```');
    expect(text).toContain('public class UserService');
  });
});

describe('createSearchByModuleAdapter', () => {
  function makeMockSearchEngine(): SearchEngine {
    return {
      search: vi.fn().mockResolvedValue([
        {
          chunkId: 'c1',
          filePath: '/abs/core/src/main/java/PaymentService.java',
          relativePath: 'core/src/main/java/PaymentService.java',
          language: 'java',
          chunkType: 'interface',
          name: 'PaymentService',
          content: 'public interface PaymentService { void pay(); }',
          score: 0.85,
          matchedVector: 'code' as const,
        },
      ]),
      getFileChunks: vi.fn(),
      getDependencies: vi.fn(),
    } as unknown as SearchEngine;
  }

  it('calls searchEngine.search with mavenModule.artifactId filter', async () => {
    const searchEngine = makeMockSearchEngine();
    const adapter = createSearchByModuleAdapter(searchEngine);
    await adapter('com.payments:core', 5);
    expect(searchEngine.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { must: [{ key: 'mavenModule.artifactId', match: { value: 'core' } }] },
      }),
    );
  });

  it('extracts artifactId from groupId:artifactId format', async () => {
    const searchEngine = makeMockSearchEngine();
    const adapter = createSearchByModuleAdapter(searchEngine);
    await adapter('com.payments:core', 5);
    expect(searchEngine.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { must: [{ key: 'mavenModule.artifactId', match: { value: 'core' } }] },
      }),
    );
  });

  it('uses moduleName as-is when no colon present', async () => {
    const searchEngine = makeMockSearchEngine();
    const adapter = createSearchByModuleAdapter(searchEngine);
    await adapter('core', 5);
    expect(searchEngine.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { must: [{ key: 'mavenModule.artifactId', match: { value: 'core' } }] },
      }),
    );
  });

  it('maps RetrievalResult to ModuleChunkResult', async () => {
    const searchEngine = makeMockSearchEngine();
    const adapter = createSearchByModuleAdapter(searchEngine);
    const results = await adapter('com.payments:core', 5);
    expect(results).toEqual([
      {
        name: 'PaymentService',
        relativePath: 'core/src/main/java/PaymentService.java',
        chunkType: 'interface',
        content: 'public interface PaymentService { void pay(); }',
      },
    ]);
  });

  it('returns empty array when searchEngine returns no results', async () => {
    const searchEngine = {
      search: vi.fn().mockResolvedValue([]),
      getFileChunks: vi.fn(),
      getDependencies: vi.fn(),
    } as unknown as SearchEngine;
    const adapter = createSearchByModuleAdapter(searchEngine);
    const results = await adapter('com.payments:core', 5);
    expect(results).toEqual([]);
  });
});
