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
 */
export async function getFileHandler(engine: Engine, input: GetFileInput): Promise<ToolOutput> {
  const { repo, path: filePath } = parseRepoPath(input.path);

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

  const title = fallbackNote ? `## Indexed evidence for: ${input.path}` : `## File: ${filePath}`;
  const conclusion = `Conclusion: returning ${results.length} indexed ${results.length === 1 ? 'section' : 'sections'} for ${input.path}.`;
  const text = `${conclusion}\n\n${fallbackNote ? `${fallbackNote}\n\n` : ''}${title}\n\n${allSections.join('\n\n')}`;

  // Build structured chunks with repo attribution
  const chunks = results.map((r) => ({
    repo: r.repoId,
    path: r.relativePath,
    name: r.name,
    startLine: r.startLine,
    endLine: r.endLine,
  }));

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      ...(fallbackNote ? { fallbackUsed: true } : {}),
      answered: true,
      chunks,
    },
  };
}

/**
 * Register the get_file tool on an MCP server.
 */
export function registerGetFileTool(server: McpServer, engine: Engine): void {
  server.registerTool(
    'get_file',
    {
      description:
        'Get all indexed code chunks for a specific file by its relative path. Returns the complete file context.',
      inputSchema: {
        path: z.string().describe('Relative file path (e.g., "src/auth/middleware.ts")'),
      },
    },
    async (input) => {
      return getFileHandler(engine, input);
    },
  );
}
