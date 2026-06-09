import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';
import { formatRetrievalContext } from './result-formatting.js';

type Engine = {
  getFile(path: string): Promise<RetrievalResult[]>;
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
}

export type ToolOutput = CallToolResult;

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
    results = await engine.getFile(filePath);
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

  // Filter by repo if prefix was specified
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

  // ── Filesystem-read path ──────────────────────────────────────────────────
  if (readFileFn) {
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
            const chunkContent = await readFileFn(filePath, repo, chunk.startLine, chunk.endLine);
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
        const fileContent = await readFileFn(filePath, repo);
        const lang = results[0]?.language ?? '';
        const note = `Note: No chunks matching name "${input.name}" found. Returning full file.`;
        const title = `## File: ${filePath}`;
        const text = `${note}\n\n${title}\n\n\`\`\`${lang}\n${fileContent}\n\`\`\``;
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
        const fileContent = await readFileFn(filePath, repo);
        const lines = fileContent.split('\n');
        // Convert to 0-indexed, inclusive of endLine
        const start = Math.max(0, input.startLine - 1);
        const end = Math.min(lines.length, input.endLine);
        const slicedContent = lines.slice(start, end).join('\n');

        const lang = results[0]?.language ?? '';
        const title = `## File: ${filePath} (lines ${input.startLine}-${input.endLine})`;
        const text = `${title}\n\n\`\`\`${lang}\n${slicedContent}\n\`\`\``;
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
      const fileContent = await readFileFn(filePath, repo);
      const lang = results[0]?.language ?? '';
      const title = `## File: ${filePath}`;
      const text = `${title}\n\n\`\`\`${lang}\n${fileContent}\n\`\`\``;
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
        startLine: z
          .number()
          .optional()
          .describe(
            'Start line (1-indexed). When provided with endLine, returns only that range from the file.',
          ),
        endLine: z
          .number()
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
