import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';
import { formatRetrievalContext } from './result-formatting.js';
import { coercedNumber } from './coerce.js';

type Engine = {
  getFile(path: string, repoId?: string): Promise<RetrievalResult[]>;
  search?(query: { text: string; limit?: number | undefined }): Promise<RetrievalResult[]>;
};

export interface GetFileInput {
  path: string;
  startLine?: number | undefined;
  endLine?: number | undefined;
  name?: string | undefined;
}

export interface GetFileOptions {
  readFileFn?: (
    path: string,
    repo?: string,
    startLine?: number,
    endLine?: number,
  ) => Promise<string>;
  /** Optional stat function for mtime-based cache invalidation. Returns { mtimeMs: number }. */
  statFn?: (path: string, repo?: string) => Promise<{ mtimeMs: number }>;
  /** Enable session-level dedup cache. Default: false. */
  sessionCache?: boolean;
}

export type ToolOutput = CallToolResult;

// ---------------------------------------------------------------------------
// Session-level dedup cache (T155)
// ---------------------------------------------------------------------------

interface GetFileCacheEntry {
  responseText: string;
  mtimeMs: number;
  lineCount: number;
  lastAccess: number;
}

const GET_FILE_CACHE_MAX = 100;
const getFileCache = new Map<string, GetFileCacheEntry>();
let getFileCacheAccessCounter = 0;

function buildGetFileCacheKey(
  path: string,
  repo: string | undefined,
  startLine: number | undefined,
  endLine: number | undefined,
  name: string | undefined,
): string {
  return `${repo ?? ''}:${path}:${startLine ?? ''}:${endLine ?? ''}:${name ?? ''}`;
}

function evictGetFileLRU(): void {
  let oldestKey: string | undefined;
  let oldestAccess = Infinity;
  for (const [key, entry] of getFileCache) {
    if (entry.lastAccess < oldestAccess) {
      oldestAccess = entry.lastAccess;
      oldestKey = key;
    }
  }
  if (oldestKey) getFileCache.delete(oldestKey);
}

/** Exported for testing: reset the session cache (used between test runs). */
export function resetGetFileSessionCache(): void {
  getFileCache.clear();
  getFileCacheAccessCounter = 0;
}

/**
 * Parse an optional `repo:path` prefix from a file path string.
 * Only matches lowercase alphanumeric + hyphens (min 2 chars) before colon,
 * avoiding false positives on Windows drive letters (single uppercase char).
 */
export function parseRepoPath(input: string): { repo?: string; path: string } {
  const match = input.match(/^([a-z][a-z0-9-]*):(.+)$/);
  if (match) return { repo: match[1]!, path: match[2]! };
  return { path: input };
}

/**
 * Handle the get_file tool call.
 * Returns all chunks for a file formatted as sequential code blocks.
 * Supports multi-repo resolution with optional repo:path prefix syntax.
 *
 * When `options.readFileFn` is provided, the live file content is read from
 * the filesystem and returned as the primary response; indexed chunk metadata
 * is surfaced in `structuredContent.chunks`. If the filesystem read fails
 * (e.g. ENOENT) the tool falls back to stored Qdrant content and sets
 * `structuredContent.fallbackUsed = true`.
 */
export async function getFileHandler(
  engine: Engine,
  input: GetFileInput,
  options?: GetFileOptions,
): Promise<ToolOutput> {
  const { repo, path: filePath } = parseRepoPath(input.path);
  const readFileFn = options?.readFileFn;

  let results: RetrievalResult[];
  let fallbackNote: string | undefined;

  try {
    results = await engine.getFile(filePath, repo);
  } catch (error) {
    if (!engine.search) {
      throw error;
    }

    results = await engine.search({ text: filePath, limit: 5 });
    fallbackNote =
      `Note: direct file retrieval was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning indexed evidence matching the requested path.';
  }

  // Semantic search fallback when getFile returns empty (not throws)
  if (results.length === 0 && !readFileFn && engine.search) {
    results = await engine.search({ text: filePath, limit: 5 });
  }

  // Defense-in-depth: when a repo prefix was given, ensure only that repo's
  // chunks survive even if the engine ignored the repoId filter (e.g. search
  // fallback path, or old-schema collections without repoId).
  if (repo) {
    results = results.filter((r) => r.repoId === repo);
  }

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: fallbackNote
            ? `${fallbackNote}\n\nNo indexed chunks found for: ${input.path}`
            : `No indexed chunks found for: ${input.path}`,
        },
      ],
      ...(fallbackNote ? { structuredContent: { fallbackUsed: true } } : {}),
    };
  }

  // Build structured chunk metadata (used in all paths)
  const chunks = results.map((r) => ({
    repo: r.repoId,
    path: r.relativePath,
    name: r.name,
    chunkType: r.chunkType,
    startLine: r.startLine,
    endLine: r.endLine,
  }));

  // Resolve the repo(s) the matched chunks belong to. When the caller did not
  // supply a `repo:` prefix, we derive it from the chunk metadata so the
  // filesystem read targets the correct repo root (not the default/first repo).
  const distinctRepos = [
    ...new Set(results.map((r) => r.repoId).filter((id): id is string => !!id)),
  ];
  // Single effective repo when the caller gave a prefix OR all chunks agree on
  // one repo. Undefined only when chunks span multiple repos and no prefix was
  // given (handled by the multi-repo grouping path below).
  const effectiveRepo: string | undefined =
    repo ?? (distinctRepos.length === 1 ? distinctRepos[0] : undefined);

  // ── Multi-repo disambiguation (filesystem-read path) ───────────────────────
  // No prefix + chunks from >1 repo: read each repo's file from its own root
  // and return them grouped by repo so the caller can disambiguate.
  if (readFileFn && !repo && distinctRepos.length > 1) {
    return buildMultiRepoFileResponse(results, filePath, readFileFn, input, chunks);
  }

  // ── Session dedup check (T155) ──────────────────────────────────────────────
  if (options?.sessionCache && readFileFn && options.statFn) {
    const cacheKey = buildGetFileCacheKey(
      filePath,
      effectiveRepo,
      input.startLine,
      input.endLine,
      input.name,
    );
    const cached = getFileCache.get(cacheKey);

    if (cached) {
      // Check file mtime to validate cache
      try {
        const stat = await options.statFn(filePath, effectiveRepo);
        if (stat.mtimeMs === cached.mtimeMs) {
          // Cache hit — mtime unchanged, return short dedup message
          cached.lastAccess = ++getFileCacheAccessCounter;
          const shortMsg = `Content unchanged since previous request (${cached.lineCount} lines, ${filePath}). Use startLine/endLine or name to narrow.`;
          return {
            content: [{ type: 'text', text: shortMsg }],
            structuredContent: { answered: true, cached: true, chunks },
          };
        }
        // Mtime changed — invalidate and fall through to re-read
        getFileCache.delete(cacheKey);
      } catch {
        // stat failed — invalidate and fall through
        getFileCache.delete(cacheKey);
      }
    }
  }

  // ── Filesystem-read path ──────────────────────────────────────────────────
  if (readFileFn) {
    // Helper to store response in session cache after a successful filesystem read
    const storeInCache = async (text: string, lineCount: number): Promise<void> => {
      if (!options?.sessionCache || !options.statFn) return;
      const cacheKey = buildGetFileCacheKey(
        filePath,
        effectiveRepo,
        input.startLine,
        input.endLine,
        input.name,
      );
      try {
        const stat = await options.statFn(filePath, effectiveRepo);
        if (getFileCache.size >= GET_FILE_CACHE_MAX) evictGetFileLRU();
        getFileCache.set(cacheKey, {
          responseText: text,
          mtimeMs: stat.mtimeMs,
          lineCount,
          lastAccess: ++getFileCacheAccessCounter,
        });
      } catch {
        // stat failed — skip caching
      }
    };

    try {
      // ── Name filter path: filter chunks by name, read only matching ranges ──
      if (input.name) {
        const nameFilter = input.name.toLowerCase();
        const matchingChunks = results.filter(
          (r) => r.name && r.name.toLowerCase().includes(nameFilter),
        );

        if (matchingChunks.length > 0) {
          // Read only the matching chunk ranges from disk
          const sections: string[] = [];
          const lang = matchingChunks[0]?.language ?? '';

          for (const chunk of matchingChunks.sort((a, b) => a.startLine - b.startLine)) {
            const chunkContent = await readFileFn(
              filePath,
              effectiveRepo,
              chunk.startLine,
              chunk.endLine,
            );
            const header = chunk.name
              ? `### ${chunk.chunkType}: ${chunk.name} (lines ${chunk.startLine}-${chunk.endLine})`
              : `### Lines ${chunk.startLine}-${chunk.endLine}`;
            sections.push(`${header}\n\`\`\`${lang}\n${chunkContent}\n\`\`\``);
          }

          const filteredChunks = matchingChunks.map((r) => ({
            repo: r.repoId,
            path: r.relativePath,
            name: r.name,
            chunkType: r.chunkType,
            startLine: r.startLine,
            endLine: r.endLine,
          }));

          const title = `## File: ${filePath} (filtered by name: "${input.name}")`;
          const text = `${title}\n\n${sections.join('\n\n')}`;
          const totalLines = matchingChunks.reduce(
            (sum, c) => sum + (c.endLine - c.startLine + 1),
            0,
          );
          await storeInCache(text, totalLines);
          return {
            content: [{ type: 'text', text }],
            structuredContent: {
              answered: true,
              content: sections.map((s) => s.split('\n').slice(1).join('\n')).join('\n'),
              chunks: filteredChunks,
            },
          };
        }

        // No chunks matched the name filter — fall back to full file with a note
        const fileContent = await readFileFn(filePath, effectiveRepo);
        const lang = results[0]?.language ?? '';
        const note = `Note: No chunks matching name "${input.name}" found. Returning full file.`;
        const title = `## File: ${filePath}`;
        const text = `${note}\n\n${title}\n\n\`\`\`${lang}\n${fileContent}\n\`\`\``;
        const lineCount = fileContent.split('\n').length;
        await storeInCache(text, lineCount);
        return {
          content: [{ type: 'text', text }],
          structuredContent: {
            answered: true,
            content: fileContent,
            chunks,
          },
        };
      }

      // ── Line-range filter path: slice file content to specified range ──
      if (input.startLine !== undefined && input.endLine !== undefined) {
        const fileContent = await readFileFn(filePath, effectiveRepo);
        const lines = fileContent.split('\n');
        // Convert to 0-indexed, inclusive of endLine
        const start = Math.max(0, input.startLine - 1);
        const end = Math.min(lines.length, input.endLine);
        const slicedContent = lines.slice(start, end).join('\n');

        const lang = results[0]?.language ?? '';
        const title = `## File: ${filePath} (lines ${input.startLine}-${input.endLine})`;
        const text = `${title}\n\n\`\`\`${lang}\n${slicedContent}\n\`\`\``;
        await storeInCache(text, end - start);
        return {
          content: [{ type: 'text', text }],
          structuredContent: {
            answered: true,
            content: slicedContent,
            chunks,
          },
        };
      }

      // ── Default path: return full file content (existing behavior) ──
      const fileContent = await readFileFn(filePath, effectiveRepo);
      const lang = results[0]?.language ?? '';
      const title = `## File: ${filePath}`;
      const text = `${title}\n\n\`\`\`${lang}\n${fileContent}\n\`\`\``;
      const lineCount = fileContent.split('\n').length;
      await storeInCache(text, lineCount);
      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          answered: true,
          content: fileContent,
          chunks,
        },
      };
    } catch {
      // readFileFn failed — fall through to stored-content rendering below,
      // but mark the response so callers know we used the fallback.
      return buildStoredContentResponse(results, filePath, input.path, fallbackNote, chunks, true);
    }
  }

  // ── Stored-content rendering (no readFileFn) ──────────────────────────────
  return buildStoredContentResponse(results, filePath, input.path, fallbackNote, chunks, false);
}

type ChunkMeta = {
  repo: string | undefined;
  path: string | undefined;
  name: string | undefined;
  chunkType: string | undefined;
  startLine: number;
  endLine: number;
};

/**
 * Render a file that exists in multiple repos (no `repo:` prefix supplied).
 * Reads each repo's copy from its own root and returns them grouped under a
 * `## [repo]` heading so the caller can disambiguate. Honors the `name` and
 * `startLine`/`endLine` filters per repo, mirroring the single-repo paths.
 */
async function buildMultiRepoFileResponse(
  results: RetrievalResult[],
  filePath: string,
  readFileFn: NonNullable<GetFileOptions['readFileFn']>,
  input: GetFileInput,
  chunks: ChunkMeta[],
): Promise<ToolOutput> {
  // Group results by repoId, preserving discovery order.
  const repoGroups = new Map<string, RetrievalResult[]>();
  for (const r of results) {
    const key = r.repoId ?? '_default';
    const group = repoGroups.get(key) ?? [];
    group.push(r);
    repoGroups.set(key, group);
  }

  const nameFilter = input.name?.toLowerCase();
  const sections: string[] = [];

  for (const [repoKey, groupResults] of repoGroups) {
    const lang = groupResults[0]?.language ?? '';
    sections.push(`## [${repoKey}]`);

    try {
      if (nameFilter) {
        const matching = groupResults
          .filter((r) => r.name && r.name.toLowerCase().includes(nameFilter))
          .sort((a, b) => a.startLine - b.startLine);
        const toRead = matching.length > 0 ? matching : null;
        if (toRead) {
          for (const chunk of toRead) {
            const content = await readFileFn(filePath, repoKey, chunk.startLine, chunk.endLine);
            const header = chunk.name
              ? `### ${chunk.chunkType}: ${chunk.name} (lines ${chunk.startLine}-${chunk.endLine})`
              : `### Lines ${chunk.startLine}-${chunk.endLine}`;
            sections.push(`${header}\n\`\`\`${lang}\n${content}\n\`\`\``);
          }
          continue;
        }
        // No chunk matched name in this repo — fall through to full file.
        sections.push(
          `Note: No chunks matching name "${input.name}" in this repo. Returning full file.`,
        );
      }

      if (input.startLine !== undefined && input.endLine !== undefined) {
        const content = await readFileFn(filePath, repoKey, input.startLine, input.endLine);
        sections.push(
          `### Lines ${input.startLine}-${input.endLine}\n\`\`\`${lang}\n${content}\n\`\`\``,
        );
        continue;
      }

      const content = await readFileFn(filePath, repoKey);
      sections.push(`\`\`\`${lang}\n${content}\n\`\`\``);
    } catch (err) {
      sections.push(
        `Note: filesystem read failed for [${repoKey}] (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }

  const repoList = [...repoGroups.keys()].join(', ');
  const note =
    `Note: "${filePath}" exists in ${repoGroups.size} repos (${repoList}). ` +
    'Showing all matches grouped by repo — pass a `repo:` prefix ' +
    `(e.g. get_file(path="${[...repoGroups.keys()][0]}:${filePath}")) to target one.`;
  const text = `${note}\n\n## File: ${filePath}\n\n${sections.join('\n\n')}`;

  return {
    content: [{ type: 'text', text }],
    structuredContent: { answered: true, multiRepo: true, chunks },
  };
}

/** Render stored Qdrant chunk content into the standard sectioned layout. */
function buildStoredContentResponse(
  results: RetrievalResult[],
  filePath: string,
  inputPath: string,
  fallbackNote: string | undefined,
  chunks: Array<{
    repo: string | undefined;
    path: string | undefined;
    name: string | undefined;
    chunkType: string | undefined;
    startLine: number;
    endLine: number;
  }>,
  fsReadFailed: boolean,
): ToolOutput {
  // Group results by repoId
  const repoGroups = new Map<string, RetrievalResult[]>();
  for (const r of results) {
    const key = r.repoId ?? '_default';
    const group = repoGroups.get(key) ?? [];
    group.push(r);
    repoGroups.set(key, group);
  }

  const multiRepo = repoGroups.size > 1 || (repoGroups.size === 1 && !repoGroups.has('_default'));
  const allSections: string[] = [];

  for (const [repoKey, groupResults] of repoGroups) {
    const sorted = [...groupResults].sort((a, b) => a.startLine - b.startLine);

    if (multiRepo && repoKey !== '_default') {
      allSections.push(`## [${repoKey}]`);
    }

    for (const r of sorted) {
      const sourceTag = r.source ? ` [${r.source}]` : '';
      const header = r.name
        ? `### ${r.chunkType}: ${r.name} (lines ${r.startLine}-${r.endLine})${sourceTag}`
        : `### Lines ${r.startLine}-${r.endLine}${sourceTag}`;
      const contextLine = formatRetrievalContext(r);
      allSections.push(`${header}\n${contextLine}\n\`\`\`${r.language}\n${r.content}\n\`\`\``);
    }
  }

  const title = fallbackNote ? `## Indexed evidence for: ${inputPath}` : `## File: ${filePath}`;
  const conclusion = `Conclusion: returning ${results.length} indexed ${results.length === 1 ? 'section' : 'sections'} for ${inputPath}.`;
  const text = `${conclusion}\n\n${fallbackNote ? `${fallbackNote}\n\n` : ''}${title}\n\n${allSections.join('\n\n')}`;

  const usedFallback = fsReadFailed || !!fallbackNote;

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      ...(usedFallback ? { fallbackUsed: true } : {}),
      answered: true,
      chunks,
    },
  };
}

/**
 * Register the get_file tool on an MCP server.
 */
export function registerGetFileTool(
  server: McpServer,
  engine: Engine,
  options?: GetFileOptions,
): void {
  server.registerTool(
    'get_file',
    {
      description:
        'Get all indexed code chunks for a specific file by its relative path. Returns the complete file context. ' +
        'Reads live content from the filesystem first; falls back to stored Qdrant content if the file is inaccessible. ' +
        'Also returns chunk-level metadata (imports, exports, dependency edges, stereotype, archLayer).',
      inputSchema: {
        path: z.string().describe('Relative file path (e.g., "src/auth/middleware.ts")'),
        startLine: coercedNumber()
          .optional()
          .describe(
            'Start line (1-indexed). When provided with endLine, returns only that range from the file.',
          ),
        endLine: coercedNumber()
          .optional()
          .describe(
            'End line (1-indexed). When provided with startLine, returns only that range from the file.',
          ),
        name: z
          .string()
          .optional()
          .describe(
            'Filter to chunks matching this function/class name (case-insensitive). Returns only matching sections.',
          ),
      },
    },
    async (input) => {
      return getFileHandler(engine, input, options);
    },
  );
}
