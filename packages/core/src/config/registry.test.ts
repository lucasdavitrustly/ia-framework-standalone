import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(repos[0]!.path).toBe('/foo/bar');
    expect(repos[0]!.name).toBe('bar');
  });

  it('derives name as kebab-case lowercase from basename', () => {
    const config: ProjectConfig = {
      targetProjectPath: '/projects/My_Project',
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config-dir');
    expect(registry.getRepos()[0]!.name).toBe('my-project');
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
    expect(repos[0]!.path).toBe('/home/user/a');
    expect(repos[1]!.path).toBe('/home/user/b');
  });

  it('auto-derives name from basename when not specified', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../my-repo' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepos()[0]!.name).toBe('my-repo');
  });

  it('normalizes derived name to kebab-case lowercase', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../MyProject_v2' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepos()[0]!.name).toBe('myproject-v2');
  });

  it('uses explicit name when provided', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../some-path', name: 'explicit-name' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    expect(registry.getRepos()[0]!.name).toBe('explicit-name');
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

describe('RepoRegistry.detect()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'registry-detect-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('populates profile for a repo with package.json', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { react: '*' } }),
    );
    const config: ProjectConfig = {
      repos: [{ path: tmpDir }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    await registry.detect();
    const entry = registry.getRepos()[0]!;
    expect(entry.profile).toBeDefined();
    expect(entry.profile?.languages).toContain('typescript');
    expect(entry.profile?.frameworks).toContain('react');
  });

  it('populates provides from package.json name', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: '@org/my-lib' }));
    const config: ProjectConfig = {
      repos: [{ path: tmpDir }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    await registry.detect();
    const entry = registry.getRepos()[0]!;
    expect(entry.provides).toContain('@org/my-lib');
  });

  it('leaves profile undefined for a repo with a non-existent path (D-13)', async () => {
    const config: ProjectConfig = {
      repos: [{ path: '/non/existent/xyz-12345', name: 'missing' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    await registry.detect(); // should not throw
    const entry = registry.getRepo('missing');
    expect(entry?.profile).toBeUndefined();
    expect(entry?.provides).toBeUndefined();
  });

  it('toJSON() serializes entries with populated profile and provides', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'serialized-pkg', dependencies: {} }),
    );
    const config: ProjectConfig = {
      repos: [{ path: tmpDir }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const registry = RepoRegistry.fromConfig(config, '/config');
    await registry.detect();
    const json = registry.toJSON();
    expect(json).toHaveLength(1);
    expect(json[0]!.provides).toContain('serialized-pkg');
    expect(json[0]!.profile?.languages).toContain('typescript');
  });
});

describe('RepoRegistry.getInjectionTargets() — repos[] (US1)', () => {
  it('returns only entries flagged injectAgents: true', () => {
    const config: ProjectConfig = {
      repos: [
        { path: '../a', name: 'a', injectAgents: true },
        { path: '../b', name: 'b' },
        { path: '../c', name: 'c', injectAgents: true },
      ],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const targets = RepoRegistry.fromConfig(config, '/home/user/config').getInjectionTargets();
    expect(targets.map((t) => t.name).sort()).toEqual(['a', 'c']);
    expect(targets.every((t) => t.indexed)).toBe(true);
  });

  it('returns all repos when all flagged', () => {
    const config: ProjectConfig = {
      repos: [
        { path: '../a', name: 'a', injectAgents: true },
        { path: '../b', name: 'b', injectAgents: true },
      ],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    expect(RepoRegistry.fromConfig(config, '/config').getInjectionTargets()).toHaveLength(2);
  });

  it('returns empty when none flagged', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a' }, { path: '../b' }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    expect(RepoRegistry.fromConfig(config, '/config').getInjectionTargets()).toEqual([]);
  });

  it('resolves target paths to absolute relative to configDir', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a', name: 'a', injectAgents: true }],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const targets = RepoRegistry.fromConfig(config, '/home/user/config').getInjectionTargets();
    expect(targets[0]!.path).toBe('/home/user/a');
  });
});

describe('RepoRegistry.getInjectionTargets() — legacy (US3)', () => {
  it('returns the single legacy target as implicitly opted-in', () => {
    const config: ProjectConfig = {
      targetProjectPath: '/foo/bar',
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const targets = RepoRegistry.fromConfig(config, '/config').getInjectionTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0]!.path).toBe('/foo/bar');
    expect(targets[0]!.indexed).toBe(true);
  });
});

describe('RepoRegistry.getInjectionTargets() — agentInjectionTargets (US5)', () => {
  it('unions flagged repos with non-indexed agentInjectionTargets', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a', name: 'a', injectAgents: true }],
      agentInjectionTargets: ['../ops-runbooks'],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const targets = RepoRegistry.fromConfig(config, '/home/user/config').getInjectionTargets();
    expect(targets).toHaveLength(2);
    const indexed = targets.find((t) => t.path === '/home/user/a');
    const extra = targets.find((t) => t.path === '/home/user/ops-runbooks');
    expect(indexed?.indexed).toBe(true);
    expect(extra?.indexed).toBe(false);
  });

  it('de-dupes when an agentInjectionTarget resolves to the same path as a flagged repo', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a', name: 'a', injectAgents: true }],
      agentInjectionTargets: ['../a'],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const targets = RepoRegistry.fromConfig(config, '/home/user/config').getInjectionTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0]!.path).toBe('/home/user/a');
  });

  it('returns only agentInjectionTargets when no repo is flagged', () => {
    const config: ProjectConfig = {
      repos: [{ path: '../a' }],
      agentInjectionTargets: ['../docs'],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const targets = RepoRegistry.fromConfig(config, '/home/user/config').getInjectionTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0]!.path).toBe('/home/user/docs');
    expect(targets[0]!.indexed).toBe(false);
  });
});

describe('RepoRegistry.toJSON() — injectAgents (US1)', () => {
  it('preserves injectAgents when defined and omits when undefined', () => {
    const config: ProjectConfig = {
      repos: [
        { path: '../a', name: 'a', injectAgents: true },
        { path: '../b', name: 'b' },
      ],
      embedding: minimalEmbedding,
      vectorStore: minimalVectorStore,
    };
    const json = RepoRegistry.fromConfig(config, '/config').toJSON();
    const a = json.find((e) => e.name === 'a');
    const b = json.find((e) => e.name === 'b');
    expect(a!.injectAgents).toBe(true);
    expect('injectAgents' in b!).toBe(false);
  });
});
