import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface IndexingState {
  lastIndexedCommit?: string;
  indexedAt: string;
  embeddingModel?: string;
  promptContentHash?: string;
  fullReindexRequired?: boolean;
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

function stateKey(collectionName: string, repoId?: string): string {
  return repoId ? `${collectionName}:${repoId}` : collectionName;
}

async function writeStateMap(frameworkDir: string, map: IndexingStateMap): Promise<void> {
  await mkdir(frameworkDir, { recursive: true });
  await writeFile(getStatePath(frameworkDir), JSON.stringify(map, null, 2), 'utf-8');
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
  return map[stateKey(collectionName, repoId)]?.lastIndexedCommit ?? null;
}

export async function getLastEmbeddingModel(
  frameworkDir: string,
  collectionName: string,
  repoId?: string,
): Promise<string | null> {
  const map = await readStateMap(frameworkDir);
  return map[stateKey(collectionName, repoId)]?.embeddingModel ?? null;
}

export async function getLastPromptContentHash(
  frameworkDir: string,
  collectionName: string,
  repoId?: string,
): Promise<string | null> {
  const map = await readStateMap(frameworkDir);
  return map[stateKey(collectionName, repoId)]?.promptContentHash ?? null;
}

export async function getFullReindexRequired(
  frameworkDir: string,
  collectionName: string,
  repoId?: string,
): Promise<boolean> {
  const map = await readStateMap(frameworkDir);
  return map[stateKey(collectionName, repoId)]?.fullReindexRequired === true;
}

/** Mark a repository for a full retry after a destructive or incomplete rebuild. */
export async function setFullReindexRequired(
  frameworkDir: string,
  collectionName: string,
  required: boolean,
  repoId?: string,
): Promise<void> {
  const map = await readStateMap(frameworkDir);
  const key = stateKey(collectionName, repoId);
  const current = map[key];

  if (!current && !required) return;

  if (required) {
    map[key] = {
      ...(current ?? { indexedAt: new Date().toISOString() }),
      fullReindexRequired: true,
    };
  } else if (current) {
    const withoutMarker = { ...current };
    delete withoutMarker.fullReindexRequired;
    map[key] = withoutMarker;
  }

  await writeStateMap(frameworkDir, map);
}

export async function saveLastIndexedCommit(
  frameworkDir: string,
  commit: string,
  collectionName: string,
  embeddingModel?: string,
  promptContentHash?: string,
  repoId?: string,
): Promise<void> {
  const map = await readStateMap(frameworkDir);
  const key = stateKey(collectionName, repoId);
  map[key] = {
    lastIndexedCommit: commit,
    indexedAt: new Date().toISOString(),
    ...(embeddingModel ? { embeddingModel } : {}),
    ...(promptContentHash ? { promptContentHash } : {}),
  };
  await writeStateMap(frameworkDir, map);
}

export async function getCurrentCommit(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

export interface ChangedFiles {
  /** Files that were added, copied, modified, or renamed (new path) — exist on disk, need re-parsing. */
  toProcess: string[];
  /** Files that were deleted or renamed (old path) — no longer on disk, need removal from vector store. */
  toDelete: string[];
  /** Git change-detection failures. Existing callers may ignore this optional field. */
  failures?: ChangeFailure[] | undefined;
}

export interface ChangeFailure {
  operation: 'process' | 'delete';
  error: string;
}

/**
 * Convert raw `git diff --relative` output into absolute paths scoped to `projectPath`,
 * rejecting any line that is absolute or resolves outside `projectPath`. Rejections are
 * appended to `failures` rather than silently dropped or joined into an unsafe path.
 *
 * Deleted paths are not filtered by existence on disk — the caller relies on missing
 * files still being returned so they can be removed from the vector store.
 */
function toScopedPaths(
  projectPath: string,
  stdout: string,
  operation: ChangeFailure['operation'],
  failures: ChangeFailure[],
): string[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const scoped: string[] = [];

  for (const line of lines) {
    if (isAbsolute(line)) {
      failures.push({
        operation,
        error: `Rejected unsafe git path (absolute): ${line}`,
      });
      continue;
    }

    const joined = join(projectPath, line);
    const rel = relative(projectPath, joined);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      failures.push({
        operation,
        error: `Rejected unsafe git path (outside project): ${line}`,
      });
      continue;
    }

    scoped.push(joined);
  }

  return scoped;
}

export async function getChangedFiles(
  projectPath: string,
  sinceCommit: string,
): Promise<ChangedFiles> {
  const result: ChangedFiles = { toProcess: [], toDelete: [] };
  const failures: ChangeFailure[] = [];

  try {
    // Files to re-parse: Added, Copied, Modified, Renamed (new name)
    // --relative scopes git's output to projectPath when it is a subdirectory of the
    // worktree, excluding sibling changes and returning paths relative to projectPath.
    const { stdout: processStdout } = await execFileAsync(
      'git',
      ['diff', '--relative', '--name-only', '--diff-filter=ACMR', `${sinceCommit}...HEAD`],
      { cwd: projectPath },
    );
    result.toProcess = toScopedPaths(projectPath, processStdout, 'process', failures);
  } catch (error) {
    failures.push({
      operation: 'process',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    // Files to remove from store: Deleted (and old paths of Renames)
    const { stdout: deleteStdout } = await execFileAsync(
      'git',
      ['diff', '--relative', '--name-only', '--diff-filter=D', `${sinceCommit}...HEAD`],
      { cwd: projectPath },
    );
    result.toDelete = toScopedPaths(projectPath, deleteStdout, 'delete', failures);
  } catch (error) {
    failures.push({
      operation: 'delete',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (failures.length > 0) result.failures = failures;
  return result;
}
