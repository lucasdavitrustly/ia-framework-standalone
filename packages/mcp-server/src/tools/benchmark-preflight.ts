import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';

type PreflightEngine = {
  search(query: {
    text: string;
    limit?: number;
    scoreThreshold?: number | undefined;
  }): Promise<RetrievalResult[]>;
  searchWithExpansion(
    query: { text: string; limit?: number; scoreThreshold?: number | undefined },
    options?: { hops?: 0 | 1 | 2 },
  ): Promise<RetrievalResult[]>;
  searchHybrid?(query: { text: string; limit?: number }): Promise<RetrievalResult[]>;
  getFile(path: string): Promise<RetrievalResult[]>;
  getModuleDependencies?(modulePath: string): Promise<unknown>;
  queryDatabase?(query: string): Promise<unknown>;
};

export interface BenchmarkPreflightInput {
  probe_query?: string | undefined;
  probe_path?: string | undefined;
}

interface BenchmarkToolProbe {
  tool: string;
  available: boolean;
  callable: boolean;
  reason?: string | undefined;
}

interface BenchmarkToolRequirement {
  tool: string;
  required: boolean;
  fallbackTool?: string | undefined;
}

interface BenchmarkToolCapability extends BenchmarkToolRequirement {
  status: 'ready' | 'fallback' | 'blocked';
  primary: BenchmarkToolProbe;
  fallback?: BenchmarkToolProbe | undefined;
}

interface BenchmarkPreflightReport {
  runnable: boolean;
  readyCount: number;
  fallbackCount: number;
  blockedCount: number;
  summary: string;
  tools: BenchmarkToolCapability[];
}

export type ToolOutput = CallToolResult;

const DEFAULT_PROBE_QUERY = 'entry point architecture controller repository';
const DEFAULT_PROBE_PATH = 'package.json';
const DEFAULT_BENCHMARK_TOOL_REQUIREMENTS: BenchmarkToolRequirement[] = [
  { tool: 'search_codebase', required: true, fallbackTool: 'get_file' },
  { tool: 'search_codebase_hybrid', required: true, fallbackTool: 'search_codebase' },
  { tool: 'get_file', required: true },
  { tool: 'get_module_dependencies', required: false },
  { tool: 'query_database', required: false },
];

function evaluateBenchmarkPreflight(
  probes: BenchmarkToolProbe[],
  requirements: BenchmarkToolRequirement[],
): BenchmarkPreflightReport {
  const probeMap = new Map(probes.map((probe) => [probe.tool, probe]));
  const tools = requirements.map((requirement) => {
    const primary = probeMap.get(requirement.tool) ?? {
      tool: requirement.tool,
      available: false,
      callable: false,
      reason: 'probe missing',
    };
    const fallback = requirement.fallbackTool ? probeMap.get(requirement.fallbackTool) : undefined;

    if (primary.available && primary.callable) {
      return { ...requirement, status: 'ready' as const, primary, fallback };
    }

    if (fallback && fallback.available && fallback.callable) {
      return { ...requirement, status: 'fallback' as const, primary, fallback };
    }

    return {
      ...requirement,
      status: 'blocked' as const,
      primary,
      fallback,
    };
  });

  const readyCount = tools.filter((tool) => tool.status === 'ready').length;
  const fallbackCount = tools.filter((tool) => tool.status === 'fallback').length;
  const blockedCount = tools.filter((tool) => tool.status === 'blocked').length;

  return {
    runnable: blockedCount === 0,
    readyCount,
    fallbackCount,
    blockedCount,
    summary: `${readyCount} ready, ${fallbackCount} fallback, ${blockedCount} blocked`,
    tools,
  };
}

async function probeTool(tool: string, probe: () => Promise<unknown>): Promise<BenchmarkToolProbe> {
  try {
    await probe();
    return { tool, available: true, callable: true };
  } catch (error) {
    return {
      tool,
      available: true,
      callable: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatToolLine(tool: BenchmarkPreflightReport['tools'][number]): string {
  const fallback = tool.fallbackTool ? `, fallback: ${tool.fallbackTool}` : '';
  const reason = tool.primary.reason ? `, reason: ${tool.primary.reason}` : '';
  return `- ${tool.tool}: ${tool.status}${fallback}${reason}`;
}

export async function benchmarkPreflightHandler(
  engine: PreflightEngine,
  input: BenchmarkPreflightInput = {},
  requirements: BenchmarkToolRequirement[] = DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
): Promise<ToolOutput> {
  const probeQuery = input.probe_query ?? DEFAULT_PROBE_QUERY;
  const probePath = input.probe_path ?? DEFAULT_PROBE_PATH;

  const searchProbe = probeTool('search_codebase', () =>
    engine.searchWithExpansion(
      { text: probeQuery, limit: 1, scoreThreshold: undefined },
      { hops: 1 },
    ),
  );
  const hybridProbe = probeTool('search_codebase_hybrid', async () => {
    if (!engine.searchHybrid) {
      throw new Error('hybrid search not supported by engine');
    }
    await engine.searchHybrid({ text: probeQuery, limit: 1 });
  });
  const getFileProbe = probeTool('get_file', () => engine.getFile(probePath));
  const moduleDepsProbe = probeTool('get_module_dependencies', async () => {
    if (!engine.getModuleDependencies) {
      throw new Error('module dependencies not supported by engine');
    }
    await engine.getModuleDependencies(probePath);
  });
  const queryDbProbe = probeTool('query_database', async () => {
    if (!engine.queryDatabase) {
      throw new Error('database query not supported by engine');
    }
    await engine.queryDatabase('SELECT 1');
  });

  const report = evaluateBenchmarkPreflight(
    await Promise.all([searchProbe, hybridProbe, getFileProbe, moduleDepsProbe, queryDbProbe]),
    requirements,
  );

  const text = [`## Benchmark preflight`, '', `Summary: ${report.summary}`, '']
    .concat(
      report.tools.map((tool: BenchmarkPreflightReport['tools'][number]) => formatToolLine(tool)),
    )
    .join('\n');

  return {
    content: [{ type: 'text', text }],
    structuredContent: report as unknown as Record<string, unknown>,
  };
}

export function registerBenchmarkPreflightTool(
  server: McpServer,
  engine: PreflightEngine,
  requirements: BenchmarkToolRequirement[] = DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
): void {
  server.registerTool(
    'benchmark_preflight',
    {
      description:
        'Check whether benchmark-critical MCP retrieval tools are callable and whether indexed fallbacks are available before a benchmark run.',
      inputSchema: {
        probe_query: z.string().optional().describe('Query used to probe retrieval tools'),
        probe_path: z.string().optional().describe('Relative file path used to probe get_file'),
      },
    },
    async (input) => benchmarkPreflightHandler(engine, input, requirements),
  );
}
