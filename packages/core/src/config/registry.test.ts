import { describe, it, expect } from 'vitest';
import { RepoRegistry } from './registry.js';
import type { ProjectConfig } from '../types/index.js';

const minimalEmbedding = { provider: 'openai' as const, model: 'text-embedding-3-small' };
const minimalVectorStore = { host: 'localhost', port: 6333, collectionName: 'test' };

describe('RepoRegistry.fromConfig — legacy format', () => {
  it('produces one repo entry from targetProjectPath', () => {
    const config: ProjectConfig = {
      targetProjectPath: '/foo/bar',
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config-dir');
    const repos = registry.getRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].path).toBe('/foo/bar');
    expect(repos[0].name).toBe('bar');
  });

  it('derives name as kebab-case lowercase from basename', () => {
    const config: ProjectConfig = {
      targetProjectPath: '/projects/My_Project',
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config-dir');
    expect(registry.getRepos()[0].name).toBe('my-project');
  });
});

describe('RepoRegistry.fromConfig — repos[] format', () => {
  it('produces entries with resolved paths relative to configDir', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a' }, { path: '../b' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/home/user/config');
    const repos = registry.getRepos();
    expect(repos).toHaveLength(2);
    expect(repos[0].path).toBe('/home/user/a');
    expect(repos[1].path).toBe('/home/user/b');
  });

  it('auto-derives name from basename when not specified', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../my-repo' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepos()[0].name).toBe('my-repo');
  });

  it('normalizes derived name to kebab-case lowercase', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../MyProject_v2' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepos()[0].name).toBe('myproject-v2');
  });

  it('uses explicit name when provided', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../some-path', name: 'explicit-name' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepos()[0].name).toBe('explicit-name');
  });

  it('throws on duplicate repo names', () => {
    const config: ProjectConfig = {
      repos: [
        { path: '../a', name: 'same' },
        { path: '../b', name: 'same' },
      ],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    expect(() => RepoRegistry.fromConfig(config, '/config')).toThrow(/Duplicate repo names/);
  });

  it('throws on duplicate derived names', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../same' }, { path: '/other/same' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    expect(() => RepoRegistry.fromConfig(config, '/config')).toThrow(/Duplicate repo names/);
  });
});

describe('RepoRegistry — lookup', () => {
  it('getRepos() returns all entries', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a' }, { path: '../b' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepos()).toHaveLength(2);
  });

  it('getRepo("name") returns specific entry', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../my-repo' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    const entry = registry.getRepo('my-repo');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('/my-repo');
  });

  it('getRepo returns undefined for unknown name', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepo('unknown')).toBeUndefined();
  });

  it('size reflects number of entries', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a' }, { path: '../b' }, { path: '../c' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.size).toBe(3);
  });
});
