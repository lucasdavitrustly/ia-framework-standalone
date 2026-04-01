import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectProject, DetectionError } from './detector.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `detector-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = join(tmpDir, `project-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const fullPath = join(dir, name);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
  }
  return dir;
}

describe('detectProject', () => {
  it('detects typescript from .ts files', async () => {
    const dir = await makeProject({
      'src/index.ts': 'export const x = 1;',
      'src/utils.ts': 'export const y = 2;',
    });
    const profile = await detectProject(dir);
    expect(profile.languages).toContain('typescript');
  });

  it('detects pnpm from pnpm-lock.yaml', async () => {
    const dir = await makeProject({
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'package.json': JSON.stringify({ name: 'test', scripts: {} }),
      'src/index.ts': 'const x = 1;',
    });
    const profile = await detectProject(dir);
    expect(profile.packageManager).toBe('pnpm');
  });

  it('detects next.js and react frameworks', async () => {
    const dir = await makeProject({
      'package.json': JSON.stringify({
        name: 'next-app',
        dependencies: { next: '^14.0.0', react: '^18.0.0', 'react-dom': '^18.0.0' },
        scripts: { build: 'next build', dev: 'next dev' },
      }),
      'src/app/page.tsx': 'export default function Page() { return null; }',
    });
    const profile = await detectProject(dir);
    expect(profile.frameworks).toContain('next.js');
    expect(profile.frameworks).toContain('react');
  });

  it('detects vitest as test runner', async () => {
    const dir = await makeProject({
      'package.json': JSON.stringify({
        name: 'test-project',
        devDependencies: { vitest: '^4.0.0' },
        scripts: { test: 'vitest run', build: 'tsc' },
      }),
      'src/index.ts': 'export const x = 1;',
    });
    const profile = await detectProject(dir);
    expect(profile.testRunner).toBe('vitest');
  });

  it('detects build command from package.json scripts', async () => {
    const dir = await makeProject({
      'package.json': JSON.stringify({
        name: 'test-project',
        scripts: { build: 'tsc', dev: 'tsx watch src/index.ts' },
      }),
      'src/index.ts': 'export const x = 1;',
    });
    const profile = await detectProject(dir);
    expect(profile.buildCommand).toContain('build');
  });

  it('throws DetectionError for non-existent path', async () => {
    await expect(detectProject('/does/not/exist/path')).rejects.toBeInstanceOf(DetectionError);
  });

  it('returns empty profile for an empty directory', async () => {
    const dir = await makeProject({});
    const profile = await detectProject(dir);
    expect(profile.languages).toEqual([]);
    expect(profile.frameworks).toEqual([]);
    expect(profile.packageManager).toBe('unknown');
    expect(profile.testRunner).toBeUndefined();
  });
});
