import { readFile, writeFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { BenchmarkQuery } from './types.js';

// ── Custom error ──────────────────────────────────────────────────────────────

export class CorpusNotFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`Benchmark corpus not found: ${filePath}`);
    this.name = 'CorpusNotFoundError';
  }
}

// ── Validation error type ─────────────────────────────────────────────────────

export interface CorpusValidationError {
  queryId: string;
  error: string;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const BenchmarkQuerySchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  // Allow empty arrays for negative queries (topics not in the codebase)
  expectedFiles: z.array(z.string()).min(0),
  description: z.string().optional(),
});

export const BenchmarkQueriesFileSchema = z.object({
  queries: z.array(BenchmarkQuerySchema),
});

// Flat JSON array format (primary format for corpus files)
export const BenchmarkQueriesFlatSchema = z.array(BenchmarkQuerySchema);

// ── Example corpus content ────────────────────────────────────────────────────

const EXAMPLE_CORPUS = JSON.stringify(
  {
    queries: [
      {
        id: 'example-auth',
        query: 'authentication middleware',
        expectedFiles: ['src/middleware/auth.ts'],
        description:
          'Should find authentication middleware — update expectedFiles to match your codebase',
      },
      {
        id: 'example-config',
        query: 'configuration loader',
        expectedFiles: ['src/config/loader.ts'],
        description:
          'Should find config loading logic — update expectedFiles to match your codebase',
      },
      {
        id: 'example-types',
        query: 'shared types interfaces',
        expectedFiles: ['src/types/index.ts'],
        description:
          'Should find shared type definitions — update expectedFiles to match your codebase',
      },
    ],
  },
  null,
  2,
);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load benchmark queries from a JSON file.
 * Supports both flat JSON array format and wrapped `{ queries: [...] }` format.
 *
 * @param filePath - Absolute path to the benchmark-queries.json file
 * @returns Array of validated BenchmarkQuery objects
 * @throws {CorpusNotFoundError} If the file does not exist
 * @throws {ZodError} If the JSON structure is invalid
 */
export async function loadCorpus(filePath: string): Promise<BenchmarkQuery[]> {
  let content: string;

  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (isEnoent(err)) {
      throw new CorpusNotFoundError(filePath);
    }
    throw err;
  }

  const parsed: unknown = JSON.parse(content);

  // Support flat JSON array format (primary) or wrapped { queries: [...] } format
  if (Array.isArray(parsed)) {
    const validated = BenchmarkQueriesFlatSchema.parse(parsed);
    return validated as BenchmarkQuery[];
  }

  const validated = BenchmarkQueriesFileSchema.parse(parsed);
  // Cast required due to exactOptionalPropertyTypes: Zod infers `description?: string | undefined`
  // while BenchmarkQuery uses exactOptionalPropertyTypes-compatible `description?: string`
  return validated.queries as BenchmarkQuery[];
}

/**
 * Write an example benchmark-queries.json to disk.
 * Uses 'wx' write mode — throws if the file already exists (does NOT overwrite).
 *
 * @param filePath - Path to write the example corpus to
 * @throws If the file already exists
 */
export async function scaffoldExampleCorpus(filePath: string): Promise<void> {
  await writeFile(filePath, EXAMPLE_CORPUS, { encoding: 'utf-8', flag: 'wx' });
}

/**
 * Validate a loaded corpus against the project root.
 * Checks: unique IDs, non-empty query text, file existence for non-empty expectedFiles.
 * Empty expectedFiles arrays are valid (negative test queries).
 * Returns all errors found (empty array = valid corpus).
 *
 * @param queries - Array of BenchmarkQuery objects to validate
 * @param projectRoot - Absolute path to the project root for resolving expectedFiles
 * @returns Array of CorpusValidationError objects (empty if corpus is valid)
 */
export async function validateCorpus(
  queries: BenchmarkQuery[],
  projectRoot: string,
): Promise<CorpusValidationError[]> {
  const errors: CorpusValidationError[] = [];
  const seenIds = new Set<string>();

  for (const q of queries) {
    if (seenIds.has(q.id)) {
      errors.push({ queryId: q.id, error: `Duplicate query ID: "${q.id}"` });
    }
    seenIds.add(q.id);

    if (!q.query.trim()) {
      errors.push({ queryId: q.id, error: 'Query text is empty' });
    }

    // Skip file-existence check for negative queries (expectedFiles=[])
    for (const relPath of q.expectedFiles) {
      const absPath = path.join(projectRoot, relPath);
      try {
        await fs.access(absPath);
      } catch {
        errors.push({ queryId: q.id, error: `Expected file not found: ${relPath}` });
      }
    }
  }

  return errors;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}
