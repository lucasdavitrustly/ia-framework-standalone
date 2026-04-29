import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ModuleGraphJSON } from '@ia-framework/core';

/** Simplified chunk result for module dependency context */
export interface ModuleChunkResult {
  name?: string | undefined;
  relativePath: string;
  chunkType: string;
  content: string;
}

export interface ModuleDepsEngine {
  getModuleGraph(): ModuleGraphJSON | null;
  searchByModule(moduleName: string, limit: number): Promise<ModuleChunkResult[]>;
}

export interface GetModuleDependenciesInput {
  moduleName: string;
}

/**
 * Find a module ID from the graph. Exact match on full moduleId,
 * or partial case-insensitive match on artifactId when no colon present.
 */
function findModuleId(graph: ModuleGraphJSON, name: string): string | undefined {
  // Exact match
  if (graph.modules[name]) return name;

  // Partial match on artifactId (no colon in input)
  if (!name.includes(':')) {
    const lower = name.toLowerCase();
    for (const moduleId of Object.keys(graph.modules)) {
      const artifactId = moduleId.split(':')[1];
      if (artifactId && artifactId.toLowerCase() === lower) {
        return moduleId;
      }
    }
  }

  return undefined;
}

/**
 * BFS transitive dependency traversal from JSON graph, max N hops.
 */
function getTransitiveDepsFromJSON(
  graph: ModuleGraphJSON,
  startId: string,
  maxHops: number,
): string[] {
  const visited = new Set<string>([startId]);
  let frontier = [startId];

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      const info = graph.modules[id];
      if (!info) continue;
      for (const dep of info.dependencies) {
        if (!visited.has(dep)) {
          visited.add(dep);
          nextFrontier.push(dep);
        }
      }
    }
    frontier = nextFrontier;
  }

  visited.delete(startId);
  return Array.from(visited);
}

/**
 * Format module dependency information as structured text.
 */
function formatModuleDeps(
  moduleId: string,
  info: ModuleGraphJSON['modules'][string],
  directDeps: string[],
  transitiveDeps: string[],
  interfaceChunks: ModuleChunkResult[],
): string {
  const lines: string[] = [];

  lines.push(`## Module: ${moduleId}`);
  lines.push(
    `Coordinates: ${info.coordinate.groupId}:${info.coordinate.artifactId}:${info.coordinate.version}`,
  );
  lines.push('');

  lines.push('### Direct Dependencies');
  if (directDeps.length === 0) {
    lines.push('(none)');
  } else {
    for (const dep of directDeps) {
      lines.push(`- ${dep}`);
    }
  }
  lines.push('');

  // Transitive = all reachable minus direct
  const transitiveOnly = transitiveDeps.filter((d) => !directDeps.includes(d));
  lines.push('### Transitive Dependencies (2 hops)');
  if (transitiveOnly.length === 0) {
    lines.push('(none beyond direct)');
  } else {
    for (const dep of transitiveOnly) {
      lines.push(`- ${dep}`);
    }
  }
  lines.push('');

  if (interfaceChunks.length > 0) {
    lines.push('### Key Interface/DTO Chunks');
    for (const chunk of interfaceChunks) {
      lines.push(`#### ${chunk.name ?? chunk.relativePath} (${chunk.chunkType})`);
      lines.push('```');
      lines.push(chunk.content.slice(0, 500));
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Handle the get_module_dependencies tool call.
 */
export async function getModuleDependenciesHandler(
  engine: ModuleDepsEngine,
  input: GetModuleDependenciesInput,
): Promise<CallToolResult> {
  const graph = engine.getModuleGraph();
  if (!graph) {
    return {
      content: [
        {
          type: 'text',
          text: 'No Maven module graph available. Run indexing on a Maven project first.',
        },
      ],
    };
  }

  const moduleId = findModuleId(graph, input.moduleName);
  if (!moduleId) {
    const available = Object.keys(graph.modules).join(', ');
    return {
      content: [
        { type: 'text', text: `Module "${input.moduleName}" not found. Available: ${available}` },
      ],
    };
  }

  const info = graph.modules[moduleId]!;
  const directDeps = info.dependencies;
  const transitiveDeps = getTransitiveDepsFromJSON(graph, moduleId, 2);

  // Fetch top-5 interface/DTO chunks from Qdrant filtered by maven_module
  const interfaceChunks = await engine.searchByModule(moduleId, 5);

  return {
    content: [
      {
        type: 'text',
        text: formatModuleDeps(moduleId, info, directDeps, transitiveDeps, interfaceChunks),
      },
    ],
  };
}

/**
 * Register the get_module_dependencies tool on an MCP server.
 */
export function registerGetModuleDependenciesTool(
  server: McpServer,
  engine: ModuleDepsEngine,
): void {
  server.registerTool(
    'get_module_dependencies',
    {
      description:
        'Get Maven module dependency graph: direct deps, transitive deps (2 hops), and key interface/DTO code chunks that cross module boundaries',
      inputSchema: {
        moduleName: z.string().describe('Module name (artifactId or groupId:artifactId)'),
      },
    },
    async (input) => getModuleDependenciesHandler(engine, input),
  );
}
