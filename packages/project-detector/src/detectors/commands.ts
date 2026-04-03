import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectPackageManager } from './package-manager.js';

interface PackageJson {
  scripts?: Record<string, string>;
}

export async function detectCommands(projectPath: string): Promise<{
  buildCommand: string | undefined;
  devCommand: string | undefined;
}> {
  const pm = await detectPackageManager(projectPath);
  const runPrefix = pm === 'npm' ? 'npm run' : pm === 'bun' ? 'bun run' : pm;

  let scripts: Record<string, string> = {};
  try {
    const raw = await readFile(join(projectPath, 'package.json'), 'utf-8');
    const pkgJson = JSON.parse(raw) as PackageJson;
    scripts = pkgJson.scripts ?? {};
  } catch {
    // No package.json
  }

  const buildCommand = 'build' in scripts ? `${runPrefix} build` : undefined;
  const devCommand =
    'dev' in scripts
      ? `${runPrefix} dev`
      : 'start' in scripts
        ? `${runPrefix} start`
        : undefined;

  return { buildCommand, devCommand };
}
