import { access, readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { BenchmarkQuery } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CorpusGeneratorOptions {
  targetProjectPath: string;
  completionBaseUrl: string; // e.g. "https://api.openai.com" or Ollama URL
  completionApiKey: string; // empty string for Ollama
  completionModel: string; // e.g. "gpt-4o-mini" or "llama3.2"
}

// ── Constants ─────────────────────────────────────────────────────────────────

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
  '.cache',
  '.parcel-cache',
  'storybook-static',
]);

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

const MAX_FILES = 60;

// ── File walker ───────────────────────────────────────────────────────────────

async function walkSourceFiles(projectPath: string): Promise<string[]> {
  const result: string[] = [];

  async function recurse(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (SKIP_DIRS.has(name)) continue;

      const fullPath = join(dir, name);

      if (entry.isDirectory()) {
        await recurse(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(name).toLowerCase();
        // Skip test files, generated files, and declaration files
        if (
          SOURCE_EXTENSIONS.has(ext) &&
          !name.endsWith('.d.ts') &&
          !name.includes('.test.') &&
          !name.includes('.spec.') &&
          !name.includes('.generated.')
        ) {
          result.push(fullPath);
        }
      }
    }
  }

  await recurse(projectPath);
  return result;
}

// ── Shuffle helper ────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// ── LLM call ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
}

async function callCompletionApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  // Normalize base URL — remove trailing slash, ensure no /v1 duplication
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const endpoint = normalizedBase.endsWith('/v1')
    ? `${normalizedBase}/chat/completions`
    : `${normalizedBase}/v1/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Completion API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as CompletionResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Completion API returned empty content');
  }
  return content;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  // Strip markdown code fences if present
  const stripped = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  return JSON.parse(stripped);
}

// ── Corpus generation ─────────────────────────────────────────────────────────

/**
 * Generate a 30-query benchmark corpus tailored to the target project.
 *
 * Uses an LLM to produce queries across 6 categories:
 * - semantic (5): conceptual/functional questions
 * - keyword (5): exact class/function name searches
 * - cross-file (5): questions requiring 2+ files
 * - complex (5): multi-concept retrieval
 * - negative (5): topics NOT in the codebase
 * - edge-case (5): unusual/boundary behaviors
 */
export async function generateCorpus(options: CorpusGeneratorOptions): Promise<BenchmarkQuery[]> {
  const { targetProjectPath, completionBaseUrl, completionApiKey, completionModel } = options;

  // Step 1: Walk files
  const allFiles = await walkSourceFiles(targetProjectPath);

  if (allFiles.length === 0) {
    throw new Error(
      `No source files found in ${targetProjectPath}. Is the project indexed and the path correct?`,
    );
  }

  // Step 2: Sample up to 60 files (shuffle for diversity)
  const shuffled = shuffleArray(allFiles);
  const sampled = shuffled.slice(0, MAX_FILES);

  // Step 3: Convert to relative paths from project root
  const relativePaths = sampled.map((abs) => relative(targetProjectPath, abs));

  // Group by top-level directory for better LLM context
  const grouped = new Map<string, string[]>();
  for (const relPath of relativePaths) {
    const parts = relPath.split('/');
    const topDir = parts.length > 1 ? (parts[0] ?? 'root') : 'root';
    const existing = grouped.get(topDir) ?? [];
    existing.push(relPath);
    grouped.set(topDir, existing);
  }

  // Format file list with directory grouping
  let fileList = '';
  for (const [dir, files] of grouped.entries()) {
    fileList += `\n${dir}/\n`;
    for (const f of files) {
      fileList += `  ${f}\n`;
    }
  }

  // Step 4: Build LLM prompt
  const systemPrompt =
    'You are a benchmark corpus generator. Return ONLY a JSON array, no markdown, no explanations.';

  const userPrompt = `Given this project file structure:\n\n${fileList}\nGenerate exactly 30 benchmark queries for testing a code retrieval system. Return a JSON array of objects with exactly these fields: id, query, expectedFiles (array of relative file paths that MUST exist in the list above), description. Use these IDs: sem-01 to sem-05 (semantic), kw-01 to kw-05 (keyword/symbol), xf-01 to xf-05 (cross-file, use 2+ files in expectedFiles), cx-01 to cx-05 (complex multi-concept), neg-01 to neg-05 (negative — topics NOT present, use expectedFiles: []), edge-01 to edge-05 (edge case). All expectedFiles must be from the provided file list.`;

  // Step 5: Call LLM
  const rawResponse = await callCompletionApi(
    completionBaseUrl,
    completionApiKey,
    completionModel,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  );

  // Step 6: Parse JSON response
  let parsed: unknown;
  try {
    parsed = extractJson(rawResponse);
  } catch (err) {
    throw new Error(
      `Failed to parse LLM response as JSON: ${String(err)}\nResponse: ${rawResponse.slice(0, 500)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`LLM response is not a JSON array. Got: ${typeof parsed}`);
  }

  // Step 7: Validate and clean up queries
  const relativePathSet = new Set(relativePaths);
  const queries: BenchmarkQuery[] = [];
  let negCounter = 6; // for re-categorized queries (neg-06, neg-07, ...)

  for (const item of parsed) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>)['id'] !== 'string' ||
      typeof (item as Record<string, unknown>)['query'] !== 'string' ||
      !Array.isArray((item as Record<string, unknown>)['expectedFiles'])
    ) {
      // Skip malformed items
      continue;
    }

    const raw = item as {
      id: string;
      query: string;
      expectedFiles: unknown[];
      description?: string;
    };

    const id = raw.id;
    const query = raw.query;
    const description = typeof raw.description === 'string' ? raw.description : undefined;
    const isNegative = id.startsWith('neg-');

    if (!query.trim()) continue;

    let expectedFiles: string[];

    if (isNegative) {
      // Negative queries always have empty expectedFiles
      expectedFiles = [];
    } else {
      // Filter to only files that actually exist in our sampled list
      expectedFiles = (raw.expectedFiles as unknown[]).filter(
        (f): f is string => typeof f === 'string' && relativePathSet.has(f),
      );

      // If non-negative query ends up with no valid files, re-categorize as negative
      if (expectedFiles.length === 0) {
        const newId = `neg-${String(negCounter++).padStart(2, '0')}`;
        const q: BenchmarkQuery = { id: newId, query, expectedFiles: [] };
        if (description !== undefined) q.description = description;
        queries.push(q);
        continue;
      }

      // Verify each expected file actually exists on disk
      const verifiedFiles: string[] = [];
      for (const relPath of expectedFiles) {
        const absPath = join(targetProjectPath, relPath);
        try {
          await access(absPath);
          verifiedFiles.push(relPath);
        } catch {
          // File doesn't exist on disk — skip it
        }
      }

      expectedFiles = verifiedFiles;

      if (expectedFiles.length === 0) {
        // No valid files after disk verification — re-categorize as negative
        const newId = `neg-${String(negCounter++).padStart(2, '0')}`;
        const q: BenchmarkQuery = { id: newId, query, expectedFiles: [] };
        if (description !== undefined) q.description = description;
        queries.push(q);
        continue;
      }
    }

    const q: BenchmarkQuery = { id, query, expectedFiles };
    if (description !== undefined) q.description = description;
    queries.push(q);
  }

  // Verify we have at least some queries
  if (queries.length === 0) {
    throw new Error('LLM returned no valid queries after validation');
  }

  return queries;
}

// End of corpus-generator module
