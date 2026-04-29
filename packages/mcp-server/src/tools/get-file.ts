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
 * Handle the get_file tool call.
 * Returns all chunks for a file formatted as sequential code blocks.
 */
export async function getFileHandler(engine: Engine, input: GetFileInput): Promise<ToolOutput> {
  let results: RetrievalResult[];
  let fallbackNote: string | undefined;

  try {
    results = await engine.getFile(input.path);
  } catch (error) {
    if (!engine.search) {
      throw error;
    }

    results = await engine.search({ text: input.path, limit: 5 });
    fallbackNote =
      `Note: direct file retrieval was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning indexed evidence matching the requested path.';
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

  // Sort by start line for natural reading order
  const sorted = [...results].sort((a, b) => a.startLine - b.startLine);

  const sections = sorted.map((r) => {
    const sourceTag = r.source ? ` [${r.source}]` : '';
    const header = r.name
      ? `### ${r.chunkType}: ${r.name} (lines ${r.startLine}-${r.endLine})${sourceTag}`
      : `### Lines ${r.startLine}-${r.endLine}${sourceTag}`;
    const contextLine = formatRetrievalContext(r);
    return `${header}\n${contextLine}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
  });

  const title = fallbackNote ? `## Indexed evidence for: ${input.path}` : `## File: ${input.path}`;
  const conclusion = `Conclusion: returning ${results.length} indexed ${results.length === 1 ? 'section' : 'sections'} for ${input.path}.`;
  const text = `${conclusion}\n\n${fallbackNote ? `${fallbackNote}\n\n` : ''}${title}\n\n${sections.join('\n\n')}`;

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      ...(fallbackNote ? { fallbackUsed: true } : {}),
      answered: true,
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
