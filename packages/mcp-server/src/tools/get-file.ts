import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';

type Engine = {
  getFile(path: string): Promise<RetrievalResult[]>;
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
  const results = await engine.getFile(input.path);

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No indexed chunks found for: ${input.path}`,
        },
      ],
    };
  }

  // Sort by start line for natural reading order
  const sorted = [...results].sort((a, b) => a.startLine - b.startLine);

  const sections = sorted.map((r) => {
    const sourceTag = r.source ? ` [${r.source}]` : '';
    const header = r.name
      ? `### ${r.chunkType}: ${r.name} (lines ${r.startLine}-${r.endLine})${sourceTag}`
      : `### Lines ${r.startLine}-${r.endLine}${sourceTag}`;
    return `${header}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
  });

  const text = `## File: ${input.path}\n\n${sections.join('\n\n')}`;

  return {
    content: [{ type: 'text', text }],
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
