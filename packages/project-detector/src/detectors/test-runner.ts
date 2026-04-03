import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const TEST_RUNNER_DEPS: Array<{ dep: string; runner: string }> = [
  { dep: 'vitest', runner: 'vitest' },
  { dep: 'jest', runner: 'jest' },
  { dep: '@jest/core', runner: 'jest' },
  { dep: 'mocha', runner: 'mocha' },
  { dep: '@playwright/test', runner: 'playwright' },
  { dep: 'cypress', runner: 'cypress' },
  { dep: 'jasmine', runner: 'jasmine' },
  { dep: 'ava', runner: 'ava' },
  { dep: 'tap', runner: 'tap' },
];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectTestRunner(projectPath: string): Promise<string | undefined> {
  // Check package.json deps first
  try {
    const raw = await readFile(join(projectPath, 'package.json'), 'utf-8');
    const pkgJson = JSON.parse(raw) as PackageJson;
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    for (const { dep, runner } of TEST_RUNNER_DEPS) {
      if (dep in allDeps) return runner;
    }
  } catch {
    // No package.json — check other ecosystems
  }

  // Python
  if (
    (await exists(join(projectPath, 'pytest.ini'))) ||
    (await exists(join(projectPath, 'pyproject.toml')))
  ) {
    return 'pytest';
  }

  // Go always has go test
  if (await exists(join(projectPath, 'go.mod'))) {
    return 'go test';
  }

  return undefined;
}
