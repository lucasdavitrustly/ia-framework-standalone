import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
  evaluateBenchmarkPreflight,
} from './mcp-preflight.js';
import type { BenchmarkToolProbe } from './types.js';

function makeProbe(overrides: Partial<BenchmarkToolProbe>): BenchmarkToolProbe {
  return {
    tool: 'search_codebase',
    available: true,
    callable: true,
    ...overrides,
  };
}

describe('evaluateBenchmarkPreflight', () => {
  it('has 5 tools in DEFAULT_BENCHMARK_TOOL_REQUIREMENTS', () => {
    expect(DEFAULT_BENCHMARK_TOOL_REQUIREMENTS).toHaveLength(5);
    expect(DEFAULT_BENCHMARK_TOOL_REQUIREMENTS.filter((r) => r.required === false)).toHaveLength(2);
  });

  it('marks the report runnable when all required tools are callable', () => {
    const report = evaluateBenchmarkPreflight(
      [
        makeProbe({ tool: 'search_codebase' }),
        makeProbe({ tool: 'search_codebase_hybrid' }),
        makeProbe({ tool: 'get_file' }),
        makeProbe({ tool: 'get_module_dependencies' }),
        makeProbe({ tool: 'query_database' }),
      ],
      DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
    );

    expect(report.runnable).toBe(true);
    expect(report.readyCount).toBe(5);
    expect(report.fallbackCount).toBe(0);
    expect(report.blockedCount).toBe(0);
  });

  it('marks the report runnable when only optional tools are blocked', () => {
    const report = evaluateBenchmarkPreflight(
      [
        makeProbe({ tool: 'search_codebase' }),
        makeProbe({ tool: 'search_codebase_hybrid' }),
        makeProbe({ tool: 'get_file' }),
        makeProbe({ tool: 'get_module_dependencies', callable: false, reason: 'not supported' }),
        makeProbe({ tool: 'query_database', callable: false, reason: 'not supported' }),
      ],
      DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
    );

    expect(report.runnable).toBe(true);
    expect(report.readyCount).toBe(3);
    // Optional blocked tools get status 'fallback' (non-blocking)
    expect(report.blockedCount).toBe(0);
  });

  it('marks a tool as fallback when the primary probe is blocked but fallback is callable', () => {
    const report = evaluateBenchmarkPreflight(
      [
        makeProbe({ tool: 'search_codebase', callable: false, reason: 'permission denied' }),
        makeProbe({ tool: 'search_codebase_hybrid' }),
        makeProbe({ tool: 'get_file' }),
        makeProbe({ tool: 'get_module_dependencies' }),
        makeProbe({ tool: 'query_database' }),
      ],
      DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
    );

    const semanticSearch = report.tools.find((tool) => tool.tool === 'search_codebase');
    expect(report.runnable).toBe(true);
    expect(report.readyCount).toBe(4);
    expect(report.fallbackCount).toBe(1);
    expect(report.blockedCount).toBe(0);
    expect(semanticSearch?.status).toBe('fallback');
    expect(semanticSearch?.fallbackTool).toBe('get_file');
  });

  it('marks the report blocked when a required tool and its fallback are both unavailable', () => {
    const report = evaluateBenchmarkPreflight(
      [
        makeProbe({ tool: 'search_codebase', callable: false, reason: 'blocked' }),
        makeProbe({ tool: 'search_codebase_hybrid' }),
        makeProbe({ tool: 'get_file', callable: false, reason: 'index unavailable' }),
        makeProbe({ tool: 'get_module_dependencies' }),
        makeProbe({ tool: 'query_database' }),
      ],
      DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
    );

    const semanticSearch = report.tools.find((tool) => tool.tool === 'search_codebase');
    expect(report.runnable).toBe(false);
    expect(report.blockedCount).toBe(2);
    expect(semanticSearch?.status).toBe('blocked');
    expect(report.summary).toContain('2 blocked');
  });

  it('treats optional tools as non-blocking when unavailable', () => {
    const report = evaluateBenchmarkPreflight(
      [
        makeProbe({ tool: 'search_codebase' }),
        makeProbe({ tool: 'search_codebase_hybrid', available: false, callable: false }),
        makeProbe({ tool: 'get_file' }),
      ],
      [
        ...DEFAULT_BENCHMARK_TOOL_REQUIREMENTS,
        {
          tool: 'get_dependencies',
          required: false,
          fallbackTool: 'get_file',
          description: 'Dependency summaries',
        },
      ],
    );

    const hybridSearch = report.tools.find((tool) => tool.tool === 'search_codebase_hybrid');
    expect(report.runnable).toBe(true);
    expect(hybridSearch?.status).toBe('fallback');
  });
});
