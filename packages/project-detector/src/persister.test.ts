import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { persistProfile, readPersistedProfile } from './persister.js';
import { loadConfig } from '@ia-framework/core';
import type { ProjectProfile } from '@ia-framework/core';

const profile: ProjectProfile = {
  languages: ['typescript'],
  frameworks: ['next.js', 'react'],
  packageManager: 'pnpm',
  testRunner: 'vitest',
  buildCommand: 'pnpm build',
  devCommand: 'pnpm dev',
};

const minimalConfig = {
  targetProjectPath: '/Users/dev/my-app',
  embedding: { provider: 'ollama', model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' },
  vectorStore: { host: 'localhost', port: 6333, collectionName: 'codebase' },
};

let tmpDir: string;
let configPath: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `persister-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  configPath = join(tmpDir, 'project.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('persistProfile', () => {
  it('merges profile into existing config file', async () => {
    await writeFile(configPath, JSON.stringify(minimalConfig));
    await persistProfile(profile, configPath);
    const raw = await readFile(configPath, 'utf-8');
    const saved = JSON.parse(raw) as { profile: ProjectProfile };
    expect(saved.profile.languages).toContain('typescript');
    expect(saved.profile.frameworks).toContain('next.js');
  });

  it('allows loadConfig to read back the persisted profile', async () => {
    await writeFile(configPath, JSON.stringify(minimalConfig));
    await persistProfile(profile, configPath);
    const config = await loadConfig(configPath);
    expect(config.profile?.languages).toContain('typescript');
    expect(config.profile?.packageManager).toBe('pnpm');
  });

  it('creates minimal config file when path does not exist', async () => {
    const newPath = join(tmpDir, 'new-project.json');
    await persistProfile(profile, newPath, {
      targetProjectPath: '/some/project',
      embeddingProvider: 'ollama',
      embeddingModel: 'nomic-embed-text',
    });
    const raw = await readFile(newPath, 'utf-8');
    const saved = JSON.parse(raw) as { profile: ProjectProfile; targetProjectPath: string };
    expect(saved.profile.languages).toContain('typescript');
    expect(saved.targetProjectPath).toBe('/some/project');
  });

  it('preserves existing config fields when merging', async () => {
    await writeFile(configPath, JSON.stringify(minimalConfig));
    await persistProfile(profile, configPath);
    const raw = await readFile(configPath, 'utf-8');
    const saved = JSON.parse(raw) as typeof minimalConfig & { profile: ProjectProfile };
    expect(saved.targetProjectPath).toBe('/Users/dev/my-app');
    expect(saved.embedding.model).toBe('nomic-embed-text');
  });
});

describe('readPersistedProfile', () => {
  it('returns the profile from an existing config file', async () => {
    await writeFile(configPath, JSON.stringify({ ...minimalConfig, profile }));
    const result = await readPersistedProfile(configPath);
    expect(result?.languages).toContain('typescript');
    expect(result?.packageManager).toBe('pnpm');
  });

  it('returns undefined when config has no profile field', async () => {
    await writeFile(configPath, JSON.stringify(minimalConfig));
    const result = await readPersistedProfile(configPath);
    expect(result).toBeUndefined();
  });
});
