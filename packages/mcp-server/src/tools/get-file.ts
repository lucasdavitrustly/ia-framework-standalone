import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createEffectiveFilter } from '@ia-framework/retrieval';
import type { RetrievalResult, EffectiveFilter } from '@ia-framework/retrieval';
import { formatRetrievalContext, isValidLineRange } from './result-formatting.js';
import { coercedNumber } from './coerce.js';
import { withDegradation, type ServerCapabilities } from '../capabilities.js';
import { validateRelativePath } from '../context/live-source-reader.js';

type Engine = {
  getFile(path: string, filter: EffectiveFilter): Promise<RetrievalResult[]>;
  search?(query: { text: string; limit?: number | undefined }): Promise<RetrievalResult[]>;
};

export interface GetFileInput {
  path: string;
  startLine?: number | undefined;
  endLine?: number | undefined;
  name?: string | undefined;
}

/**
 * Outcome of an exact-join existence check for a single repository (feature 017).
 * Produced by the injected {@link GetFileOptions.resolveFileAcrossRepos} capability.
 */
export interface RepoResolution {
  /** Repository name (id used as the `repo:` prefix). */
  repo: string;
  /** Whether `repoRoot + relativePath` was found and read successfully. */
  found: boolean;
  /** File content (full or sliced range) when `found`. */
  content?: string | undefined;
  /** True when the repo was inaccessible and therefore not checked. */
  skipped?: boolean | undefined;
  /** Read/skip failure reason. */
  error?: string | undefined;
}

/** Default number of on-disk matches above which a candidate list replaces content. */
export const DEFAULT_DISAMBIGUATION_THRESHOLD = 3;

export interface GetFileOptions {
  readFileFn?: (
    path: string,
    repo?: string,
    startLine?: number,
    endLine?: number,
  ) => Promise<string>;
  /** Optional stat function for mtime-based cache invalidation. Returns { mtimeMs: number }. */
  statFn?: (path: string, repo?: string) => Promise<{ mtimeMs: number }>;
  /**
   * Cross-repo existence-check capability (feature 017). When the index yields
   * no chunk and no `repo:` prefix was given, the handler calls this to locate
   * the relative path via an exact join against each configured repository root.
   * Inaccessible repos are reported with `skipped: true`. Implementations MUST
   * NOT perform a recursive directory scan.
   */
  resolveFileAcrossRepos?: (
    relativePath: string,
    opts?: { startLine?: number; endLine?: number },
  ) => Promise<RepoResolution[]>;
  /**
   * Match count above which the handler returns a content-free candidate list
   * instead of grouped file content. Default {@link DEFAULT_DISAMBIGUATION_THRESHOLD}.
   */
  disambiguationThreshold?: number | undefined;
  /** Enable session-level dedup cache. Default: false. */
  sessionCache?: boolean;
  /** Runtime capabilities — degradation surfaced in response structuredContent. */
  capabilities?: ServerCapabilities | undefined;
  /** Configured repository names, used to validate an explicit repo:path prefix. */
  knownRepos?: readonly string[] | undefined;
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

interface ParentRange {
  name: string;
  startLine: number;
  endLine: number;
  language: string;
}

interface NameResolution {
  matchingChunks: RetrievalResult[];
  parentRanges: ParentRange[];
}

function resolveNameMatches(results: RetrievalResult[], requestedName: string): NameResolution {
  const normalizedName = requestedName.toLowerCase();
  const directMatches = results.filter((result) => result.name?.toLowerCase() === normalizedName);
  const parentMatches = results.filter(
    (result) => result.parentName?.toLowerCase() === normalizedName,
  );
  const exactMatches = directMatches.length > 0 ? directMatches : parentMatches;

  const parentRanges = [...
    new Map(
      exactMatches
        .filter((result) => isValidLineRange(result.parentStartLine, result.parentEndLine))
        .map((result) => {
          const range: ParentRange = {
            name: result.parentName ?? result.name ?? requestedName,
            startLine: result.parentStartLine!,
            endLine: result.parentEndLine!,
            language: result.language,
          };
          return [`${range.name}:${range.startLine}:${range.endLine}`, range] as const;
        }),
    ).values(),
  ];

  if (exactMatches.length > 0) {
    return { matchingChunks: exactMatches, parentRanges };
  }

  // Compatibility fallback: preserve case-insensitive identifier-boundary
  // matching when no exact chunk or parent identity exists, but never promote
  // fallback hits to a parent range.
  const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundaryPattern = new RegExp(`(?:^|[^a-z0-9])${escapedName}(?:$|[^a-z0-9])`, 'i');
  return {
    matchingChunks: results.filter(
      (result) => result.name && boundaryPattern.test(result.name),
    ),
    parentRanges: [],
  };
}

function sliceStoredContent(result: RetrievalResult, startLine: number, endLine: number): string {
  const lines = result.content.split('\n');
  const start = Math.max(0, startLine - result.startLine);
  const end = Math.min(lines.length, endLine - result.startLine + 1);
  return start < end ? lines.slice(start, end).join('\n') : '';
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
  let usedSemanticFallback = false;

  try {
    validateRelativePath(filePath);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      structuredContent: { answered: false, invalidPath: true },
    };
  }

  const hasAnyRange = input.startLine !== undefined || input.endLine !== undefined;
  if (hasAnyRange && !isValidLineRange(input.startLine, input.endLine)) {
    return {
      content: [{ type: 'text', text: 'startLine and endLine must be positive integers with startLine <= endLine.' }],
      structuredContent: { answered: false, invalidRange: true },
    };
  }

  if (repo && options?.knownRepos && !options.knownRepos.includes(repo)) {
    const configured = options.knownRepos.length > 0 ? options.knownRepos.join(', ') : '(none)';
    return {
      content: [
        {
          type: 'text',
          text: `Unknown repo '${repo}' — configured repos: ${configured}`,
        },
      ],
      structuredContent: {
        answered: false,
        unknownRepo: repo,
        configuredRepos: options.knownRepos,
      },
    };
  }

  let results: RetrievalResult[];
  let fallbackNote: string | undefined;

  try {
    results = await engine.getFile(filePath, createEffectiveFilter({}, repo));
  } catch (error) {
    if (!engine.search) {
      throw error;
    }

    results = await engine.search({ text: filePath, limit: 5 });
    usedSemanticFallback = true;
    fallbackNote =
      `Note: direct file retrieval was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning indexed evidence matching the requested path.';
  }

  // Semantic search fallback when getFile returns empty (not throws)
  if (results.length === 0 && !readFileFn && engine.search) {
    results = await engine.search({ text: filePath, limit: 5 });
    usedSemanticFallback = true;
  }

  // Defense-in-depth: when a repo prefix was given, ensure only that repo's
  // chunks survive even if the engine ignored the repoId filter (e.g. search
  // fallback path, or old-schema collections without repoId).
  if (repo) {
    results = results.filter((r) => r.repoId === repo);
  }

  if (usedSemanticFallback) {
    const exactResults = results.filter((result) => result.relativePath === filePath);
    if (exactResults.length === 0 && results.length > 0) {
      const candidates = results.map((result) => ({
        repo: result.repoId,
        path: result.relativePath,
        name: result.name,
      }));
      return {
        content: [
          {
            type: 'text',
            text: `No exact indexed file matched ${input.path}. Candidate evidence was not rendered as the requested file:\n${candidates
              .map((candidate) => `- ${candidate.repo ? `${candidate.repo}:` : ''}${candidate.path}`)
              .join('\n')}`,
          },
        ],
        structuredContent: { answered: false, fallbackUsed: true, candidates },
      };
    }
    results = exactResults;
  }

  if (results.length === 0) {
    if (repo && readFileFn) {
      try {
        const hasRange = isValidLineRange(input.startLine, input.endLine);
        const content = await readFileFn(
          filePath,
          repo,
          hasRange ? input.startLine : undefined,
          hasRange ? input.endLine : undefined,
        );
        return {
          content: [
            {
              type: 'text',
              text: `## File: ${filePath} (resolved from repo: ${repo})\n\n\`\`\`\n${content}\n\`\`\``,
            },
          ],
          structuredContent: {
            answered: true,
            resolvedVia: 'filesystem-fallback',
            repo,
            path: filePath,
            content,
          },
        };
      } catch {
        // Continue to the explicit no-indexed-results response below.
      }
    }

    // ── Feature 017: cross-repo existence-check fallback ──────────────────────
    // When the index yields no chunk and no `repo:` prefix was supplied, try to
    // locate the file on disk under each configured repo (exact join, no scan)
    // before giving up. Skipped when a prefix was given (engine.getFile already
    // scoped/validated the repo) or the capability is unavailable.
    if (!repo && options?.resolveFileAcrossRepos) {
      return buildCrossRepoFallbackResponse(
        options.resolveFileAcrossRepos,
        filePath,
        input,
        options.disambiguationThreshold ?? DEFAULT_DISAMBIGUATION_THRESHOLD,
      );
    }

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
    ...(r.parentName !== undefined ? { parent_name: r.parentName } : {}),
    ...(isValidLineRange(r.parentStartLine, r.parentEndLine)
      ? { parent_start_line: r.parentStartLine, parent_end_line: r.parentEndLine }
      : {}),
    ...(r.partIndex !== undefined && Number.isInteger(r.partIndex) && r.partIndex >= 1
      ? { part_index: r.partIndex }
      : {}),
    ...(r.totalParts !== undefined && Number.isInteger(r.totalParts) && r.totalParts >= 1
      ? { total_parts: r.totalParts }
      : {}),
    ...(r.truncated !== undefined ? { truncated: r.truncated } : {}),
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
        const { matchingChunks, parentRanges } = resolveNameMatches(results, input.name);

        if (matchingChunks.length > 0) {
          const lang = matchingChunks[0]?.language ?? '';
          const filteredChunks = matchingChunks.map((r) => ({
            repo: r.repoId,
            path: r.relativePath,
            name: r.name,
            chunkType: r.chunkType,
            startLine: r.startLine,
            endLine: r.endLine,
            ...(r.parentName !== undefined ? { parent_name: r.parentName } : {}),
            ...(isValidLineRange(r.parentStartLine, r.parentEndLine)
              ? { parent_start_line: r.parentStartLine, parent_end_line: r.parentEndLine }
              : {}),
            ...(r.partIndex !== undefined && Number.isInteger(r.partIndex) && r.partIndex >= 1
              ? { part_index: r.partIndex }
              : {}),
            ...(r.totalParts !== undefined && Number.isInteger(r.totalParts) && r.totalParts >= 1
              ? { total_parts: r.totalParts }
              : {}),
            ...(r.truncated !== undefined ? { truncated: r.truncated } : {}),
          }));

          if (parentRanges.length > 0) {
            const constructSections: string[] = [];
            const constructContents: string[] = [];
            let totalLines = 0;
            for (const parentRange of parentRanges) {
              const content = await readFileFn(
                filePath,
                effectiveRepo,
                parentRange.startLine,
                parentRange.endLine,
              );
              const header = `### construct: ${parentRange.name} (lines ${parentRange.startLine}-${parentRange.endLine})`;
              constructSections.push(`${header}\n\`\`\`${parentRange.language}\n${content}\n\`\`\``);
              constructContents.push(content);
              totalLines += parentRange.endLine - parentRange.startLine + 1;
            }
            const title = `## File: ${filePath} (filtered by name: "${input.name}")`;
            const text = `${title}\n\n${constructSections.join('\n\n')}`;
            await storeInCache(text, totalLines);
            return {
              content: [{ type: 'text', text }],
              structuredContent: {
                answered: true,
                resolvedVia: 'index',
                content: constructContents.join('\n\n'),
                chunks: filteredChunks,
              },
            };
          }

          // Read only the matching chunk ranges from disk.
          const sections: string[] = [];

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
              resolvedVia: 'index',
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
            resolvedVia: 'index',
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
            resolvedVia: 'index',
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
          resolvedVia: 'index',
          content: fileContent,
          chunks,
        },
      };
    } catch {
      // readFileFn failed — fall through to stored-content rendering below,
      // but mark the response so callers know we used the fallback.
      return buildStoredContentResponse(results, filePath, input, fallbackNote, true);
    }
  }

  // ── Stored-content rendering (no readFileFn) ──────────────────────────────
  return buildStoredContentResponse(results, filePath, input, fallbackNote, false);
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
 * Feature 017: build the response for the cross-repo existence-check fallback.
 *
 * Invoked when the index yielded no chunk and no `repo:` prefix was supplied.
 * Tiers by on-disk match count:
 *  - 0 matches  → not-found diagnostic (repos searched, resolved path, causes).
 *  - 1 match    → return that repo's content, flagged `resolvedVia: filesystem-fallback`.
 *  - 2..threshold → grouped copies per repo (`multiRepo: true`).
 *  - > threshold → content-free candidate list of `repo:path` options.
 */
async function buildCrossRepoFallbackResponse(
  resolveFileAcrossRepos: NonNullable<GetFileOptions['resolveFileAcrossRepos']>,
  filePath: string,
  input: GetFileInput,
  threshold: number,
): Promise<ToolOutput> {
  const hasRange = input.startLine !== undefined && input.endLine !== undefined;
  const resolutions = await resolveFileAcrossRepos(
    filePath,
    hasRange ? { startLine: input.startLine!, endLine: input.endLine! } : undefined,
  );

  const matches = resolutions.filter((r) => r.found && r.content !== undefined);
  const reposSearched = resolutions.map((r) => r.repo);

  // ── 0 matches → not-found diagnostic ──────────────────────────────────────
  if (matches.length === 0) {
    const skipped = resolutions.filter((r) => r.skipped);
    const skippedNote =
      skipped.length > 0
        ? `\nSkipped (inaccessible): ${skipped.map((s) => `${s.repo} (${s.error ?? 'unknown'})`).join(', ')}.`
        : '';
    const text =
      `No file found for: ${filePath}\n\n` +
      `Repositories searched (exact path match): ${reposSearched.join(', ') || '(none configured)'}.${skippedNote}\n\n` +
      'Likely causes:\n' +
      '- The path differs from the indexed/actual path (leading segment, casing, or separator mismatch).\n' +
      '- The file was moved or deleted.\n' +
      '- A repository root is misconfigured in .ia-framework/project.json.\n\n' +
      `To target a specific repository, retry with a \`repo:\` prefix, e.g. get_file(path="${reposSearched[0] ?? 'repo'}:${filePath}").`;
    return {
      content: [{ type: 'text', text }],
      structuredContent: { answered: false, reposSearched },
    };
  }

  // ── 1 match → return content ──────────────────────────────────────────────
  if (matches.length === 1) {
    const m = matches[0]!;
    const rangeSuffix = hasRange ? ` (lines ${input.startLine}-${input.endLine})` : '';
    const title = `## File: ${filePath}${rangeSuffix} [${m.repo}]`;
    const text = `${title}\n\n\`\`\`\n${m.content}\n\`\`\``;
    return {
      content: [{ type: 'text', text }],
      structuredContent: {
        answered: true,
        resolvedVia: 'filesystem-fallback',
        content: m.content,
        repo: m.repo,
      },
    };
  }

  // ── > threshold → content-free candidate list ─────────────────────────────
  if (matches.length > threshold) {
    const candidates = matches.map((m) => `${m.repo}:${filePath}`);
    const text =
      `"${filePath}" exists in ${matches.length} repositories.\n\n` +
      'To avoid returning every copy, re-issue the call with a repo prefix to target one:\n' +
      candidates.map((c) => `- get_file(path="${c}")`).join('\n');
    return {
      content: [{ type: 'text', text }],
      structuredContent: { answered: false, resolvedVia: 'filesystem-fallback', candidates },
    };
  }

  // ── 2..threshold → grouped copies ─────────────────────────────────────────
  const sections: string[] = [];
  for (const m of matches) {
    sections.push(`## [${m.repo}]\n\`\`\`\n${m.content}\n\`\`\``);
  }
  const repoList = matches.map((m) => m.repo).join(', ');
  const note =
    `Note: "${filePath}" exists in ${matches.length} repos (${repoList}). ` +
    'Showing all matches grouped by repo — pass a `repo:` prefix ' +
    `(e.g. get_file(path="${matches[0]!.repo}:${filePath}")) to target one.`;
  const text = `${note}\n\n## File: ${filePath}\n\n${sections.join('\n\n')}`;
  return {
    content: [{ type: 'text', text }],
    structuredContent: { answered: true, multiRepo: true, resolvedVia: 'filesystem-fallback' },
  };
}

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

  const sections: string[] = [];

  for (const [repoKey, groupResults] of repoGroups) {
    const lang = groupResults[0]?.language ?? '';
    sections.push(`## [${repoKey}]`);

    try {
      if (input.name) {
        const { matchingChunks, parentRanges } = resolveNameMatches(groupResults, input.name);
        const toRead = matchingChunks.length > 0 ? matchingChunks : null;
        if (toRead) {
          if (parentRanges.length > 0) {
            for (const parentRange of parentRanges) {
              const content = await readFileFn(
                filePath,
                repoKey,
                parentRange.startLine,
                parentRange.endLine,
              );
              const header = `### construct: ${parentRange.name} (lines ${parentRange.startLine}-${parentRange.endLine})`;
              sections.push(`${header}\n\`\`\`${parentRange.language}\n${content}\n\`\`\``);
            }
            continue;
          }

          for (const chunk of toRead.sort((a, b) => a.startLine - b.startLine)) {
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
  input: GetFileInput,
  fallbackNote: string | undefined,
  fsReadFailed: boolean,
): ToolOutput {
  let scopedResults = results;
  let scopeNote: string | undefined;
  if (input.name) {
    const resolution = resolveNameMatches(results, input.name);
    scopedResults = resolution.matchingChunks;
    if (resolution.parentRanges.length > 0) {
      scopeNote =
        `Stored content fallback cannot reconstruct the complete parent range ` +
        `(${resolution.parentRanges.map((range) => `${range.startLine}-${range.endLine}`).join(', ')}) from split fragments.`;
    }
  } else if (isValidLineRange(input.startLine, input.endLine)) {
    scopedResults = scopedResults.filter(
      (result) => result.endLine >= input.startLine! && result.startLine <= input.endLine!,
    );
  }

  const chunks = scopedResults.map((r) => ({
    repo: r.repoId,
    path: r.relativePath,
    name: r.name,
    chunkType: r.chunkType,
    startLine: r.startLine,
    endLine: r.endLine,
    ...(r.parentName !== undefined ? { parent_name: r.parentName } : {}),
    ...(isValidLineRange(r.parentStartLine, r.parentEndLine)
      ? { parent_start_line: r.parentStartLine, parent_end_line: r.parentEndLine }
      : {}),
    ...(r.partIndex !== undefined && Number.isInteger(r.partIndex) && r.partIndex >= 1
      ? { part_index: r.partIndex }
      : {}),
    ...(r.totalParts !== undefined && Number.isInteger(r.totalParts) && r.totalParts >= 1
      ? { total_parts: r.totalParts }
      : {}),
    ...(r.truncated !== undefined ? { truncated: r.truncated } : {}),
  }));

  // Group results by repoId
  const repoGroups = new Map<string, RetrievalResult[]>();
  for (const r of scopedResults) {
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
      const storedContent =
        !input.name && isValidLineRange(input.startLine, input.endLine)
          ? sliceStoredContent(r, input.startLine, input.endLine!)
          : r.content;
      const header = r.name
        ? `### ${r.chunkType}: ${r.name} (lines ${r.startLine}-${r.endLine})${sourceTag}`
        : `### Lines ${r.startLine}-${r.endLine}${sourceTag}`;
      const contextLine = formatRetrievalContext(r);
      allSections.push(`${header}\n${contextLine}\n\`\`\`${r.language}\n${storedContent}\n\`\`\``);
    }
  }

  const title = fallbackNote ? `## Indexed evidence for: ${input.path}` : `## File: ${filePath}`;
  const conclusion = `Conclusion: returning ${scopedResults.length} indexed ${scopedResults.length === 1 ? 'section' : 'sections'} for ${input.path}.`;

  // Detect lean-payload case: filesystem read failed AND stored chunk content
  // is empty, so we have nothing useful to return. Give the caller actionable
  // diagnostics rather than a silent empty response.
  const allContentEmpty = scopedResults.every((r) => !r.content || r.content.trim() === '');
  const leanPayloadNote =
    fsReadFailed && allContentEmpty
      ? `\n\n> Warning: the file could not be read from the filesystem and the index holds no stored content for it (lean-payload schema). ` +
        `Likely causes: (a) the repo path is misconfigured in .ia-framework/project.json, (b) the file was moved or deleted, or ` +
        `(c) the working directory does not resolve to the project root. Verify the configured repo root and the file path.`
      : '';

  const text = `${conclusion}${leanPayloadNote}\n\n${fallbackNote ? `${fallbackNote}\n\n` : ''}${scopeNote ? `${scopeNote}\n\n` : ''}${title}\n\n${allSections.join('\n\n')}`;

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
        'A bare relative path is auto-resolved across all configured repositories (exact path match); pass a `repo:` prefix ' +
        '(e.g. "core:src/auth.ts") to target one repository when the same path exists in several. ' +
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
            'Filter to chunks by exact function/class or parent name first; when none matches, use a case-insensitive substring fallback. Returns only matching sections.',
          ),
      },
    },
    async (input) => {
      const result = await getFileHandler(engine, input, options);
      // Surface degradation (unavailable features) via structuredContent.
      const merged = withDegradation(
        result.structuredContent as Record<string, unknown> | undefined,
        options?.capabilities,
      );
      return merged ? { ...result, structuredContent: merged } : result;
    },
  );
}
