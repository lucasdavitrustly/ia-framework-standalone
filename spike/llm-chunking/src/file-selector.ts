/**
 * Auto-discovers representative source files from the target project.
 * Selects small (~50 LOC), medium (~200 LOC), and large (~500+ LOC) files.
 * Per D-07: test files come from the configured target project.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const SKIP_DIRS = new Set([
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
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.java']);

export interface SelectedFile {
  filePath: string;
  relativePath: string;
  lineCount: number;
  sizeCategory: 'small' | 'medium' | 'large';
}

interface SizeCategory {
  name: 'small' | 'medium' | 'large';
  minLines: number;
  maxLines: number;
  targetLines: number;
}

const SIZE_CATEGORIES: SizeCategory[] = [
  { name: 'small', minLines: 30, maxLines: 80, targetLines: 50 },
  { name: 'medium', minLines: 150, maxLines: 300, targetLines: 200 },
  { name: 'large', minLines: 400, maxLines: Infinity, targetLines: 500 },
];

const SKIP_PATTERNS = [/\.min\.js$/, /\.generated\./, /\.d\.ts$/, /\.test\./, /\.spec\./];

function shouldSkipFile(fileName: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(fileName));
}

async function walkDirectory(
  dir: string,
  projectPath: string,
  results: Array<{ filePath: string; relativePath: string }>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Skip unreadable directories
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await walkDirectory(fullPath, projectPath, results);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext) && !shouldSkipFile(entry.name)) {
        results.push({
          filePath: fullPath,
          relativePath: relative(projectPath, fullPath),
        });
      }
    }
  }
}

/**
 * Selects representative test files from the target project.
 * Returns up to 2 files per size category (small, medium, large).
 */
export async function selectTestFiles(projectPath: string): Promise<SelectedFile[]> {
  // Discover all source files
  const allFiles: Array<{ filePath: string; relativePath: string }> = [];
  await walkDirectory(projectPath, projectPath, allFiles);

  // Read each file and count lines
  const filesWithLineCounts: Array<{
    filePath: string;
    relativePath: string;
    lineCount: number;
  }> = [];

  for (const file of allFiles) {
    try {
      const content = await readFile(file.filePath, 'utf-8');
      const lineCount = content.split('\n').length;
      filesWithLineCounts.push({ ...file, lineCount });
    } catch {
      // Skip unreadable files
    }
  }

  // Select 2 files per category, closest to target LOC
  const selected: SelectedFile[] = [];

  for (const category of SIZE_CATEGORIES) {
    const candidates = filesWithLineCounts.filter(
      (f) => f.lineCount >= category.minLines && f.lineCount <= category.maxLines,
    );

    if (candidates.length === 0) {
      console.warn(`[file-selector] Warning: no files found for category '${category.name}'`);
      continue;
    }

    // Sort by closeness to target line count
    candidates.sort(
      (a, b) =>
        Math.abs(a.lineCount - category.targetLines) - Math.abs(b.lineCount - category.targetLines),
    );

    // Pick top 2
    const top2 = candidates.slice(0, 2);
    for (const file of top2) {
      selected.push({
        filePath: file.filePath,
        relativePath: file.relativePath,
        lineCount: file.lineCount,
        sizeCategory: category.name,
      });
    }
  }

  return selected;
}
