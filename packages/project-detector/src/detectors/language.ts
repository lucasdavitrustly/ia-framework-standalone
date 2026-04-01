import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, extname } from 'node:path';

const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.swift': 'swift',
};

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

async function scanDir(dirPath: string, counts: Map<string, number>, depth = 0): Promise<void> {
  if (depth > 3) return; // limit scan depth
  let entries: Dirent<string>[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true, encoding: 'utf-8' });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith('.')) {
        await scanDir(join(dirPath, name), counts, depth + 1);
      }
    } else if (entry.isFile()) {
      const ext = extname(name).toLowerCase();
      const lang = EXTENSION_MAP[ext];
      if (lang) {
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  }
}

export async function detectLanguages(projectPath: string): Promise<string[]> {
  const counts = new Map<string, number>();
  await scanDir(projectPath, counts);
  // Sort by file count descending, return languages with >0 files
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0)
    .map(([lang]) => lang);
}
