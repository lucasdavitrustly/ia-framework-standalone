import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface IndexingState {
  lastIndexedCommit: string;
  indexedAt: string;
  embeddingModel?: string;
  promptContentHash?: string;
}

/** New format: map of collection name → state */
type IndexingStateMap = Record<string, IndexingState>;

/** Legacy format (single object with collectionName field) */
interface LegacyIndexingState {
  lastIndexedCommit: string;
  collectionName: string;
  indexedAt: string;
  embeddingModel?: string;
}

const DEFAULT_COLLECTION = 'codebase';

function getStatePath(frameworkDir: string): string {
  return join(frameworkDir, 'indexing-state.json');
}

/**
 * Read the state file, migrating from legacy format if needed.
 */
async function readStateMap(frameworkDir: string): Promise<IndexingStateMap> {
  try {
    const content = await readFile(getStatePath(frameworkDir), 'utf-8');
    const parsed = JSON.parse(content) as IndexingStateMap | LegacyIndexingState;

    // Detect legacy format: has `lastIndexedCommit` at top level
    if ('lastIndexedCommit' in parsed && typeof parsed.lastIndexedCommit === 'string') {
      const legacy = parsed as LegacyIndexingState;
      const key = legacy.collectionName || DEFAULT_COLLECTION;
      const entry: IndexingState = {
        lastIndexedCommit: legacy.lastIndexedCommit,
        indexedAt: legacy.indexedAt,
      };
      if (legacy.embeddingModel) {
        entry.embeddingModel = legacy.embeddingModel;
      }
      return { [key]: entry };
    }

    return parsed as IndexingStateMap;
  } catch {
    return {};
  }
}

export async function getLastIndexedCommit(
  frameworkDir: string,
  collectionName: string,
  repoId?: string,
): Promise<string | null> {
  const map = await readStateMap(frameworkDir);
  const key = repoId ? `${collectionName}:${repoId}` : collectionName;
  return map[key]?.lastIndexedCommit ?? null;
}

export async function getLastEmbeddingModel(
  frameworkDir: string,
  collectionName: string,
  repoId?: string,
): Promise<string | null> {
  const map = await readStateMap(frameworkDir);
  const key = repoId ? `${collectionName}:${repoId}` : collectionName;
  return map[key]?.embeddingModel ?? null;
}

export async function getLastPromptContentHash(
  frameworkDir: string,
  collectionName: string,
  repoId?: string,
): Promise<string | null> {
  const map = await readStateMap(frameworkDir);
  const key = repoId ? `${collectionName}:${repoId}` : collectionName;
  return map[key]?.promptContentHash ?? null;
}

export async function saveLastIndexedCommit(
  frameworkDir: string,
  commit: string,
  collectionName: string,
  embeddingModel?: string,
  promptContentHash?: string,
  repoId?: string,
): Promise<void> {
  await mkdir(frameworkDir, { recursive: true });
  const map = await readStateMap(frameworkDir);
  const key = repoId ? `${collectionName}:${repoId}` : collectionName;
  map[key] = {
    lastIndexedCommit: commit,
    indexedAt: new Date().toISOString(),
    ...(embeddingModel ? { embeddingModel } : {}),
    ...(promptContentHash ? { promptContentHash } : {}),
  };
  await writeFile(getStatePath(frameworkDir), JSON.stringify(map, null, 2), 'utf-8');
}

export async function getCurrentCommit(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getChangedFiles(projectPath: string, sinceCommit: string): Promise<string[]> {
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
