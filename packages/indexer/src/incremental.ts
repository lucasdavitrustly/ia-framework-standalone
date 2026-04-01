import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface IndexingState {
  lastIndexedCommit: string;
  collectionName: string;
  indexedAt: string;
}

function getStatePath(frameworkDir: string): string {
  return join(frameworkDir, 'indexing-state.json');
}

export async function getLastIndexedCommit(frameworkDir: string): Promise<string | null> {
  try {
    const content = await readFile(getStatePath(frameworkDir), 'utf-8');
    const state = JSON.parse(content) as IndexingState;
    return state.lastIndexedCommit;
  } catch {
    return null;
  }
}

export async function saveLastIndexedCommit(
  frameworkDir: string,
  commit: string,
  collectionName: string,
): Promise<void> {
  await mkdir(frameworkDir, { recursive: true });
  const state: IndexingState = {
    lastIndexedCommit: commit,
    collectionName,
    indexedAt: new Date().toISOString(),
  };
  await writeFile(getStatePath(frameworkDir), JSON.stringify(state, null, 2), 'utf-8');
}

export async function getCurrentCommit(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getChangedFiles(
  projectPath: string,
  sinceCommit: string,
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-only', `${sinceCommit}...HEAD`],
      { cwd: projectPath },
    );
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => join(projectPath, f));
  } catch {
    return [];
  }
}
