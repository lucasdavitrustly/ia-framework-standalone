import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, validateConfig, ConfigNotFoundError } from './loader.js';

const validConfig = {
  targetProjectPath: '/Users/dev/my-app',
  embedding: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
  },
  vectorStore: {
    host: 'localhost',
    port: 6333,
    collectionName: 'codebase',
  },
};

let tmpDir: string;
let configPath: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `ia-framework-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  configPath = join(tmpDir, 'project.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns typed ProjectConfig when file is valid', async () => {
    await writeFile(configPath, JSON.stringify(validConfig));
    const config = await loadConfig(configPath);
    expect(config.targetProjectPath).toBe('/Users/dev/my-app');
    expect(config.embedding.provider).toBe('ollama');
    expect(config.embedding.model).toBe('nomic-embed-text');
    expect(config.vectorStore.port).toBe(6333);
  });

  it('throws ZodError mentioning targetProjectPath when field is missing', async () => {
    const invalid = { ...validConfig, targetProjectPath: undefined };
    await writeFile(configPath, JSON.stringify(invalid));
    await expect(loadConfig(configPath)).rejects.toThrow(/targetProjectPath/i);
  });

  it('throws ConfigNotFoundError when file does not exist', async () => {
    const missing = join(tmpDir, 'nonexistent.json');
    await expect(loadConfig(missing)).rejects.toBeInstanceOf(ConfigNotFoundError);
  });

  it('throws ZodError mentioning provider when embedding.provider is invalid', async () => {
    const invalid = {
      ...validConfig,
      embedding: { ...validConfig.embedding, provider: 'unknown' },
    };
    await writeFile(configPath, JSON.stringify(invalid));
    await expect(loadConfig(configPath)).rejects.toThrow(/provider/i);
  });

  it('succeeds for Ollama config without apiKey', async () => {
    const ollamaConfig = { ...validConfig }; // no apiKey — should be fine
    await writeFile(configPath, JSON.stringify(ollamaConfig));
    const config = await loadConfig(configPath);
    expect(config.embedding.apiKey).toBeUndefined();
  });

  // US3 (T021): repos[] without injectAgents loads without error
  it('loads a repos[] config that has no injectAgents field', async () => {
    const cfg = {
      repos: [{ path: '../a' }, { path: '../b' }],
      embedding: validConfig.embedding,
      vectorStore: validConfig.vectorStore,
    };
    await writeFile(configPath, JSON.stringify(cfg));
    const config = await loadConfig(configPath);
    expect(config.repos).toHaveLength(2);
    expect(config.repos?.[0]?.injectAgents).toBeUndefined();
  });

  // US1 (T026): malformed injectAgents surfaces a clear validation error
  it('throws a validation error mentioning injectAgents when it is not a boolean', async () => {
    const cfg = {
      repos: [{ path: '../a', injectAgents: 'yes' }],
      embedding: validConfig.embedding,
      vectorStore: validConfig.vectorStore,
    };
    await writeFile(configPath, JSON.stringify(cfg));
    await expect(loadConfig(configPath)).rejects.toThrow(/injectAgents/i);
  });
});

describe('validateConfig', () => {
  it('returns typed ProjectConfig for a valid object', () => {
    const config = validateConfig(validConfig);
    expect(config.targetProjectPath).toBe('/Users/dev/my-app');
    expect(config.vectorStore.collectionName).toBe('codebase');
  });

  it('throws ZodError for an invalid object', () => {
    expect(() => validateConfig({ invalid: true })).toThrow();
  });
});
