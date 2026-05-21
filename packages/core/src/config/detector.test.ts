import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { detectRepoProfile, detectRepoProvides } from './detector.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'detector-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('detectRepoProfile', () => {
  it('returns undefined for a path that does not exist', async () => {
    const result = await detectRepoProfile('/non/existent/path/xyz-12345');
    expect(result).toBeUndefined();
  });

  it('detects TypeScript/React project from package.json', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '*' }, devDependencies: {} }),
    );
    const result = await detectRepoProfile(tmpDir);
    expect(result).toBeDefined();
    expect(result!.languages).toContain('typescript');
    expect(result!.frameworks).toContain('react');
    expect(result!.packageManager).toBe('npm');
  });

  it('detects Java project from pom.xml', async () => {
    await writeFile(
      join(tmpDir, 'pom.xml'),
      '<project><artifactId>my-service</artifactId></project>',
    );
    const result = await detectRepoProfile(tmpDir);
    expect(result).toBeDefined();
    expect(result!.languages).toContain('java');
    expect(result!.packageManager).toBe('maven');
  });

  it('detects Python project from requirements.txt', async () => {
    await writeFile(join(tmpDir, 'requirements.txt'), 'flask==2.0.0\n');
    const result = await detectRepoProfile(tmpDir);
    expect(result).toBeDefined();
    expect(result!.languages).toContain('python');
    expect(result!.packageManager).toBe('pip');
  });

  it('returns unknown language and packageManager for empty dir', async () => {
    const result = await detectRepoProfile(tmpDir);
    expect(result).toBeDefined();
    expect(result!.languages).toContain('unknown');
    expect(result!.packageManager).toBe('unknown');
  });

  it('detects pnpm from pnpm-lock.yaml', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
    const result = await detectRepoProfile(tmpDir);
    expect(result!.packageManager).toBe('pnpm');
  });

  it('detects vitest test runner', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^4.0.0' } }),
    );
    const result = await detectRepoProfile(tmpDir);
    expect(result!.testRunner).toBe('vitest');
  });

  it('returns frameworks array (empty) for plain Node project', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    const result = await detectRepoProfile(tmpDir);
    expect(result!.frameworks).toEqual([]);
  });
});

describe('detectRepoProvides', () => {
  it('returns [] for a path that does not exist', async () => {
    const result = await detectRepoProvides('/non/existent/path/xyz-12345');
    expect(result).toEqual([]);
  });

  it('returns [] for an empty dir', async () => {
    const result = await detectRepoProvides(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns package name from package.json', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: '@org/my-lib' }));
    const result = await detectRepoProvides(tmpDir);
    expect(result).toEqual(['@org/my-lib']);
  });

  it('returns artifactId from pom.xml', async () => {
    await writeFile(
      join(tmpDir, 'pom.xml'),
      '<project><artifactId>my-service</artifactId></project>',
    );
    const result = await detectRepoProvides(tmpDir);
    expect(result).toContain('my-service');
  });

  it('returns names from all workspace packages when pnpm-workspace.yaml exists', async () => {
    // Create workspace structure
    await writeFile(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    await mkdir(join(tmpDir, 'packages', 'pkg-a'), { recursive: true });
    await mkdir(join(tmpDir, 'packages', 'pkg-b'), { recursive: true });
    await writeFile(
      join(tmpDir, 'packages', 'pkg-a', 'package.json'),
      JSON.stringify({ name: '@my-org/pkg-a' }),
    );
    await writeFile(
      join(tmpDir, 'packages', 'pkg-b', 'package.json'),
      JSON.stringify({ name: '@my-org/pkg-b' }),
    );
    const result = await detectRepoProvides(tmpDir);
    expect(result).toContain('@my-org/pkg-a');
    expect(result).toContain('@my-org/pkg-b');
  });
});
