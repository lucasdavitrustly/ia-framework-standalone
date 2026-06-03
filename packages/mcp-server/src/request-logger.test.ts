import { describe, it, expect, vi } from 'vitest';
import { withRequestLogging, truncateResponse } from './request-logger.js';
import type { McpRequest } from '@ia-framework/observability';

describe('request-logger', () => {
  function makeDeps() {
    const logged: McpRequest[] = [];
    return {
      metricsStore: { logRequest: (r: McpRequest) => logged.push(r) },
      tokenCounter: { count: (text: string) => Math.ceil(text.length / 4) },
      sessionId: 'test-session',
      logged,
    };
  }

  describe('withRequestLogging()', () => {
    it('captures tool name, input params, and response', async () => {
      const deps = makeDeps();
      const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });
      const wrapped = withRequestLogging('search_codebase', handler, deps);

      await wrapped({ query: 'auth' });

      expect(deps.logged).toHaveLength(1);
      expect(deps.logged[0]!.toolName).toBe('search_codebase');
      expect(deps.logged[0]!.inputParams).toEqual({ query: 'auth' });
      expect(deps.logged[0]!.responseContent).toBe('result');
    });

    it('measures duration in milliseconds', async () => {
      const deps = makeDeps();
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { content: [{ type: 'text', text: 'ok' }] };
      });
      const wrapped = withRequestLogging('get_file', handler, deps);

      await wrapped({ path: 'src/index.ts' });

      expect(deps.logged[0]!.durationMs).toBeGreaterThanOrEqual(15);
    });

    it('still returns the original response to caller', async () => {
      const deps = makeDeps();
      const response = { content: [{ type: 'text', text: 'hello' }] };
      const handler = vi.fn().mockResolvedValue(response);
      const wrapped = withRequestLogging('get_file', handler, deps);

      const result = await wrapped({ path: 'x' });

      expect(result).toBe(response);
    });

    it('does not throw if logging fails (silent degradation)', async () => {
      const deps = makeDeps();
      deps.metricsStore.logRequest = () => {
        throw new Error('DB full');
      };
      const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const wrapped = withRequestLogging('search_codebase', handler, deps);

      const result = await wrapped({ query: 'test' });

      expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    });

    it('calculates input tokens from serialized params', async () => {
      const deps = makeDeps();
      const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'r' }] });
      const wrapped = withRequestLogging('search_codebase', handler, deps);

      await wrapped({ query: 'a long query string for testing' });

      expect(deps.logged[0]!.inputTokens).toBeGreaterThan(0);
    });

    it('calculates output tokens from response content', async () => {
      const deps = makeDeps();
      const longResponse = 'x'.repeat(400);
      const handler = vi
        .fn()
        .mockResolvedValue({ content: [{ type: 'text', text: longResponse }] });
      const wrapped = withRequestLogging('search_codebase', handler, deps);

      await wrapped({ query: 'test' });

      expect(deps.logged[0]!.outputTokens).toBe(100); // 400 chars / 4
    });

    it('handles multiple content blocks', async () => {
      const deps = makeDeps();
      const handler = vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'block1' },
          { type: 'text', text: 'block2' },
        ],
      });
      const wrapped = withRequestLogging('search_codebase', handler, deps);

      await wrapped({ query: 'test' });

      expect(deps.logged[0]!.responseContent).toBe('block1\nblock2');
    });
  });

  describe('truncateResponse()', () => {
    it('returns content as-is when under limit', () => {
      const result = truncateResponse('short', 1024);
      expect(result).toEqual({ content: 'short', isTruncated: false });
    });

    it('truncates with marker when over limit', () => {
      const long = 'x'.repeat(100);
      const result = truncateResponse(long, 50);
      expect(result.isTruncated).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(50 + 30); // some marker overhead
      expect(result.content).toContain('[TRUNCATED]');
    });
  });
});
