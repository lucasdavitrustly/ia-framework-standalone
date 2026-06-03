import { describe, it, expect, vi } from 'vitest';
import { logsRouter } from './logs.js';

interface LogsBody {
  entries: Array<{
    msg: string;
    level: number;
    levelLabel: string;
    component: string;
    timestamp: string;
  }>;
  total: number;
  file: string;
}

interface ErrorBody {
  error: string;
}

function makeRouter(fileContent?: string | null, readError?: Error) {
  const readFileFn = readError
    ? vi.fn().mockRejectedValue(readError)
    : fileContent === null
      ? vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      : vi.fn().mockResolvedValue(fileContent ?? '');

  return logsRouter({ frameworkDir: '/test/.ia-framework', readFileFn });
}

const validLine = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    level: 30,
    time: 1717401600000,
    msg: 'test message',
    name: 'mcp-server',
    ...overrides,
  });

describe('GET /api/logs (via logsRouter)', () => {
  it('returns empty entries when log file does not exist', async () => {
    const router = makeRouter(null);
    const res = await router.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogsBody;
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns empty entries when log file is empty', async () => {
    const router = makeRouter('');
    const res = await router.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogsBody;
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('parses valid log entries', async () => {
    const content = [validLine(), validLine({ level: 50, msg: 'error occurred' })].join('\n');
    const router = makeRouter(content);
    const res = await router.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogsBody;
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]!.msg).toBe('error occurred'); // newest first
    expect(body.entries[1]!.msg).toBe('test message');
  });

  it('filters by level', async () => {
    const content = [
      validLine({ level: 20, msg: 'debug' }),
      validLine({ level: 30, msg: 'info' }),
      validLine({ level: 50, msg: 'error' }),
    ].join('\n');
    const router = makeRouter(content);
    const res = await router.request('/?level=error');
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogsBody;
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.msg).toBe('error');
    expect(body.total).toBe(1);
  });

  it('respects limit parameter', async () => {
    const content = Array.from({ length: 10 }, (_, i) => validLine({ msg: `msg-${i}` })).join('\n');
    const router = makeRouter(content);
    const res = await router.request('/?limit=3');
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogsBody;
    expect(body.entries).toHaveLength(3);
    expect(body.total).toBe(10);
  });

  it('skips malformed lines', async () => {
    const content = ['not-json', '{"level": "string", "msg": "bad"}', validLine()].join('\n');
    const router = makeRouter(content);
    const res = await router.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as LogsBody;
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.msg).toBe('test message');
  });

  it('returns 400 for invalid level filter', async () => {
    const router = makeRouter('');
    const res = await router.request('/?level=invalid');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toContain('Invalid level filter');
  });

  it('returns 500 when file read fails with non-ENOENT error', async () => {
    const router = makeRouter(undefined, new Error('Permission denied'));
    const res = await router.request('/');
    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toContain('Permission denied');
  });
});
