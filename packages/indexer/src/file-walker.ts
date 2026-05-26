import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { glob } from 'tinyglobby';
import { createRequire } from 'node:module';
import type { Ignore } from 'ignore';

/** Max file size in bytes (512 KB). Files larger than this are likely generated/bundled. */
const MAX_FILE_SIZE = 512 * 1024;

// CJS interop: ignore is a CommonJS module with a callable default export
const require = createRequire(import.meta.url);
const createIgnore = require('ignore') as { default?: () => Ignore; (): Ignore };

const SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.turbo',
  'coverage',
  '.cache',
  '.parcel-cache',
  'storybook-static',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.rb',
]);

const DEFAULT_EXCLUDE = [
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.chunk.js',
  '**/*.generated.*',
  '**/*.d.ts',
  '**/__snapshots__/**',
  '**/fixtures/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/static/assets/**',
  '**/static/js/**',
  '**/static/css/**',
  '**/public/assets/**',
  '**/resources/static/**',
];

export interface WalkOptions {
  projectPath: string;
  includePatterns?: string[] | undefined;
  excludePatterns?: string[] | undefined;
  respectGitignore?: boolean | undefined;
}

async function loadGitignore(projectPath: string): Promise<Ignore | null> {
  const gitignorePath = join(projectPath, '.gitignore');
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    const ig = (createIgnore.default ?? createIgnore)();
    return ig.add(content);
  } catch {
    return null;
  }
}

export async function walkFiles(options: WalkOptions): Promise<string[]> {
  const { projectPath, includePatterns, excludePatterns = [], respectGitignore = true } = options;

  // Build gitignore filter
  const gitignoreFilter = respectGitignore ? await loadGitignore(projectPath) : null;

  // Build skip patterns for tinyglobby
  const ignorePatterns = [
    ...SKIP_DIRS.map((d) => `**/${d}/**`),
    ...DEFAULT_EXCLUDE,
    ...excludePatterns,
  ];

  // Default include: all source files (treat empty array same as unset)
  const patterns = includePatterns?.length ? includePatterns : ['**/*'];

  const files = await glob(patterns, {
    cwd: projectPath,
    ignore: ignorePatterns,
    absolute: true,
    onlyFiles: true,
  });

  const filtered = files.filter((file) => {
    // Must be a recognized source extension (unless explicit include patterns given)
    if (!includePatterns?.length) {
      const ext = extname(file).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) return false;
    }

    // Apply gitignore filter
    if (gitignoreFilter) {
      const relativePath = file.slice(projectPath.length + 1);
      if (gitignoreFilter.ignores(relativePath)) return false;
    }

    return true;
  });

  // Filter out oversized files (likely generated/bundled)
  const results: string[] = [];
  await Promise.all(
    filtered.map(async (file) => {
      try {
        const s = await stat(file);
        if (s.size <= MAX_FILE_SIZE) results.push(file);
      } catch {
        // If stat fails, skip the file
      }
    }),
  );
  return results;
}
