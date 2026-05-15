import type {
  BenchmarkPreflightReport,
  BenchmarkToolCapability,
  BenchmarkToolProbe,
  BenchmarkToolRequirement,
} from './types.js';

export const DEFAULT_BENCHMARK_TOOL_REQUIREMENTS: BenchmarkToolRequirement[] = [
  {
    tool: 'search_codebase',
    required: true,
    fallbackTool: 'get_file',
    description: 'Primary semantic retrieval for repository evidence',
  },
  {
    tool: 'search_codebase_hybrid',
    required: true,
    fallbackTool: 'search_codebase',
    description: 'Identifier-aware retrieval for symbol lookups',
  },
  {
    tool: 'get_file',
    required: true,
    description: 'Direct indexed file evidence for fallback and citation',
  },
  {
    tool: 'get_module_dependencies',
    required: false,
    description: 'Dependency graph traversal for context expansion',
  },
  {
    tool: 'query_database',
    required: false,
    description: 'Database schema and metadata retrieval',
  },
];

function toCapability(
  requirement: BenchmarkToolRequirement,
  probes: Map<string, BenchmarkToolProbe>,
): BenchmarkToolCapability {
  const primary = probes.get(requirement.tool) ?? {
    tool: requirement.tool,
    available: false,
    callable: false,
    reason: 'probe missing',
  };
  const fallback = requirement.fallbackTool ? probes.get(requirement.fallbackTool) : undefined;
  const required = requirement.required ?? true;

  if (primary.available && primary.callable) {
    return {
      tool: requirement.tool,
      required,
      description: requirement.description,
      fallbackTool: requirement.fallbackTool,
      status: 'ready',
      primary,
      fallback,
    };
  }

  if (fallback && fallback.available && fallback.callable) {
    return {
      tool: requirement.tool,
      required,
      description: requirement.description,
      fallbackTool: requirement.fallbackTool,
      status: 'fallback',
      primary,
      fallback,
    };
  }

  return {
    tool: requirement.tool,
    required,
    description: requirement.description,
    fallbackTool: requirement.fallbackTool,
    status: required ? 'blocked' : 'fallback',
    primary,
    fallback,
  };
}

export function evaluateBenchmarkPreflight(
  probes: BenchmarkToolProbe[],
  requirements: BenchmarkToolRequirement[] = DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
): BenchmarkPreflightReport {
  const probeMap = new Map(probes.map((probe) => [probe.tool, probe]));
  const tools = requirements.map((requirement) => toCapability(requirement, probeMap));

  const readyCount = tools.filter((tool) => tool.status === 'ready').length;
  const fallbackCount = tools.filter((tool) => tool.status === 'fallback').length;
  const blockedCount = tools.filter((tool) => tool.status === 'blocked').length;
  const runnable = tools.every((tool) => !tool.required || tool.status !== 'blocked');
  const summary = `${readyCount} ready, ${fallbackCount} fallback, ${blockedCount} blocked`;

  return {
    runnable,
    readyCount,
    fallbackCount,
    blockedCount,
    summary,
    tools,
  };
}
