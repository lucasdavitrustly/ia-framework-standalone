import { access } from 'node:fs/promises';
import { join } from 'node:path';

const LOCKFILES: Array<{ file: string; manager: string }> = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'package-lock.json', manager: 'npm' },
  { file: 'go.sum', manager: 'go mod' },
  { file: 'Pipfile.lock', manager: 'pipenv' },
  { file: 'poetry.lock', manager: 'poetry' },
  { file: 'uv.lock', manager: 'uv' },
];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(projectPath: string): Promise<string> {
  for (const { file, manager } of LOCKFILES) {
    if (await exists(join(projectPath, file))) {
      return manager;
    }
  }
  // Fallback: check for package.json without lockfile
  if (await exists(join(projectPath, 'package.json'))) {
    return 'npm';
  }
  return 'unknown';
}
