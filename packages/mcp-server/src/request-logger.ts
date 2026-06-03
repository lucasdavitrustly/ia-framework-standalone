import type { McpRequest } from '@ia-framework/observability';

/** Maximum response content size in bytes (default 512KB) */
const DEFAULT_MAX_RESPONSE_SIZE = 512 * 1024;

export interface RequestLoggerDeps {
  metricsStore: { logRequest(request: McpRequest): void };
  tokenCounter: { count(text: string): number };
  sessionId: string;
  maxResponseSize?: number;
}

interface McpToolResponse {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Truncate response content if it exceeds the size limit.
 */
export function truncateResponse(
  content: string,
  maxSize: number,
): { content: string; isTruncated: boolean } {
  if (content.length <= maxSize) {
    return { content, isTruncated: false };
  }
  const truncated = content.slice(0, maxSize) + '\n[TRUNCATED]';
  return { content: truncated, isTruncated: true };
}

/**
 * Wrap an MCP tool handler to log request/response with timing and token usage.
 * Logging failures are silently caught — they must never break the tool response.
 *
 * The handler signature matches the MCP SDK: (args, extra?) => Promise<CallToolResult>
 * We only care about args for logging; extra is passed through transparently.
 */
export function withRequestLogging<TInput extends Record<string, unknown>>(
  toolName: string,
  handler: (input: TInput, ...rest: unknown[]) => Promise<McpToolResponse>,
  deps: RequestLoggerDeps,
): (input: TInput, ...rest: unknown[]) => Promise<McpToolResponse> {
  const maxSize = deps.maxResponseSize ?? DEFAULT_MAX_RESPONSE_SIZE;

  return async (input: TInput, ...rest: unknown[]): Promise<McpToolResponse> => {
    const startTime = Date.now();
    const response = await handler(input, ...rest);
    const durationMs = Date.now() - startTime;

    try {
      // Extract text from response content blocks
      const responseText = response.content
        .map((block) => block.text ?? '')
        .filter((t) => t.length > 0)
        .join('\n');

      const { content: storedContent, isTruncated } = truncateResponse(responseText, maxSize);

      // Calculate tokens
      const inputText = JSON.stringify(input);
      const inputTokens = deps.tokenCounter.count(inputText);
      const outputTokens = deps.tokenCounter.count(responseText);

      const request: McpRequest = {
        id: crypto.randomUUID(),
        sessionId: deps.sessionId,
        toolName,
        inputParams: input as Record<string, unknown>,
        responseContent: storedContent,
        inputTokens,
        outputTokens,
        durationMs,
        timestamp: new Date().toISOString(),
        isTruncated,
      };

      deps.metricsStore.logRequest(request);
    } catch {
      // Silent degradation — observability must never break tool responses
    }

    return response;
  };
}
