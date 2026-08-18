import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectProfile } from '../types/index.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function getPackageName(dir: string): Promise<string | undefined> {
  try {
    const pkg: unknown = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'));
    if (pkg === null || typeof pkg !== 'object') return undefined;
    const { name } = pkg as { name?: unknown };
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse pnpm-workspace.yaml to extract package directory globs,
 * then resolve them to actual directories that contain a package.json.
 */
async function parseWorkspacePackages(
  workspaceContent: string,
  rootPath: string,
): Promise<string[]> {
  // Extract patterns under `packages:` list
  const patterns: string[] = [];
  const lines = workspaceContent.split('\n');
  let inPackages = false;
  for (const line of lines) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const match = line.match(/^\s+-\s+["']?([^"'\n]+)["']?/);
      if (match?.[1]) {
        patterns.push(match[1].trim());
      } else if (/^\S/.test(line)) {
        inPackages = false;
      }
    }
  }

  const result: string[] = [];
  for (const pattern of patterns) {
    // Handle simple glob like "packages/*"
    const parts = pattern.split('/');
    if (parts.length === 2 && parts[1] === '*' && parts[0]) {
      const parentDir = join(rootPath, parts[0]);
      try {
        const entries = await readdir(parentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            result.push(join(parentDir, entry.name));
          }
        }
      } catch {
        // directory doesn't exist — skip
      }
    } else {
      // Non-glob: treat as a direct path
      const resolved = join(rootPath, pattern);
      if (await fileExists(resolved)) {
        result.push(resolved);
      }
    }
  }
  return result;
}

/**
 * Detect the language/framework/tooling profile for a single repo directory.
 * Returns undefined if the path doesn't exist on disk (D-13).
 */
export async function detectRepoProfile(repoPath: string): Promise<ProjectProfile | undefined> {
  // D-13: return early if path doesn't exist
  try {
    await stat(repoPath);
  } catch {
    return undefined;
  }

  const languages: string[] = [];
  const frameworks: string[] = [];
  let packageManager = 'unknown';
  let testRunner: string | undefined;
  let buildCommand: string | undefined;
  let devCommand: string | undefined;

  // ── JavaScript / TypeScript ─────────────────────────────────────────────
  const pkgPath = join(repoPath, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as Record<string, unknown>;
      const allDeps = {
        ...((pkg.dependencies as Record<string, string>) ?? {}),
        ...((pkg.devDependencies as Record<string, string>) ?? {}),
      };

      languages.push('typescript');

      // Framework detection
      if (allDeps['react']) frameworks.push('react');
      if (allDeps['next']) frameworks.push('next.js');
      if (allDeps['express']) frameworks.push('express');
      if (allDeps['hono']) frameworks.push('hono');

      // Package manager detection
      const pkgMgr = pkg.packageManager as string | undefined;
      if (pkgMgr?.startsWith('pnpm') || (await fileExists(join(repoPath, 'pnpm-lock.yaml')))) {
        packageManager = 'pnpm';
      } else if (await fileExists(join(repoPath, 'yarn.lock'))) {
        packageManager = 'yarn';
      } else {
        packageManager = 'npm';
      }

      // Test runner
      if (allDeps['vitest']) testRunner = 'vitest';
      else if (allDeps['jest']) testRunner = 'jest';

      // Build / dev commands
      const scripts = (pkg.scripts as Record<string, string>) ?? {};
      if (scripts['build']) buildCommand = `${packageManager} run build`;
      if (scripts['dev']) devCommand = `${packageManager} run dev`;
    } catch {
      // malformed package.json — skip
    }
  }

  // ── Java / Maven ─────────────────────────────────────────────────────────
  if (await fileExists(join(repoPath, 'pom.xml'))) {
    languages.push('java');
    packageManager = 'maven';
  }

  // ── Python ───────────────────────────────────────────────────────────────
  const hasPyproject = await fileExists(join(repoPath, 'pyproject.toml'));
  const hasRequirements = await fileExists(join(repoPath, 'requirements.txt'));
  if (hasPyproject || hasRequirements) {
    languages.push('python');
    if (hasPyproject) packageManager = 'poetry';
    else packageManager = 'pip';
  }

  if (languages.length === 0) languages.push('unknown');

  return { languages, frameworks, packageManager, testRunner, buildCommand, devCommand };
}

/**
 * Detect what package names a repo provides.
 * For monorepos with pnpm-workspace.yaml, returns all workspace package names (D-02).
 * For single-package repos, returns the name from package.json or pom.xml artifactId.
 * Returns [] if path doesn't exist.
 */
export async function detectRepoProvides(repoPath: string): Promise<string[]> {
  try {
    await stat(repoPath);
  } catch {
    return [];
  }

  const provides: string[] = [];

  // ── pnpm monorepo (D-02) ─────────────────────────────────────────────────
  const workspacePath = join(repoPath, 'pnpm-workspace.yaml');
  if (await fileExists(workspacePath)) {
    const workspaceContent = await readFile(workspacePath, 'utf-8');
    const dirs = await parseWorkspacePackages(workspaceContent, repoPath);
    for (const dir of dirs) {
      const name = await getPackageName(dir);
      if (name) provides.push(name);
    }
    if (provides.length > 0) return provides;
  }

  // ── Single package.json ──────────────────────────────────────────────────
  const name = await getPackageName(repoPath);
  if (name) {
    provides.push(name);
    return provides;
  }

  // ── pom.xml artifactId ───────────────────────────────────────────────────
  const pomPath = join(repoPath, 'pom.xml');
  if (await fileExists(pomPath)) {
    try {
      const pom = await readFile(pomPath, 'utf-8');
      const match = pom.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (match?.[1]) provides.push(match[1].trim());
    } catch {
      // no pom.xml — skip
    }
  }

  return provides;
}
