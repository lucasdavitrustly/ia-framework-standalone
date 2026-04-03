import { describe, it, expect, vi } from 'vitest';
import { dbRouter } from './db.js';
import { DbConfigNotFoundError } from '@ia-framework/db-context';
import type { PostgresSource } from '@ia-framework/db-context';

function makeDbRouter(options: {
  connected?: boolean;
  tableCount?: number;
  configMissing?: boolean;
  connectionThrows?: Error;
} = {}) {
  const { connected = true, tableCount = 0, configMissing = false, connectionThrows } = options;

  const mockLoadDbConfig = configMissing
    ? vi.fn().mockRejectedValue(new DbConfigNotFoundError('/test/db.json'))
    : vi.fn().mockResolvedValue({ host: 'localhost', port: 5432, database: 'test', user: 'u', password: 'p' });

  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockTestConnection = connectionThrows
    ? vi.fn().mockRejectedValue(connectionThrows)
    : vi.fn().mockResolvedValue({ connected, tableCount });

  // Must use class pattern — vi.fn().mockReturnValue() does NOT work with `new`
  class MockPostgresSource {
    testConnection = mockTestConnection;
    close = mockClose;
  }

  return {
    router: dbRouter({
      frameworkDir: '/test',
      loadDbConfigFn: mockLoadDbConfig,
      PostgresSourceCtor: MockPostgresSource as unknown as typeof PostgresSource,
    }),
    mockClose,
    mockTestConnection,
  };
}

describe('GET /status', () => {
  // Test 1: Returns { configured: false, ... } when db.json missing
  it('returns { configured: false, connected: false, tableCount: null } when db.json missing', async () => {
    const { router } = makeDbRouter({ configMissing: true });
    const res = await router.request('/status');
    expect(res.status).toBe(200);
    const body = await res.json() as { configured: boolean; connected: boolean; tableCount: null };
    expect(body.configured).toBe(false);
    expect(body.connected).toBe(false);
    expect(body.tableCount).toBeNull();
  });

  // Test 2: Returns { configured: true, connected: true, tableCount: 42 } when configured and connected
  it('returns { configured: true, connected: true, tableCount: 42 } when configured and connected', async () => {
    const { router } = makeDbRouter({ connected: true, tableCount: 42 });
    const res = await router.request('/status');
    expect(res.status).toBe(200);
    const body = await res.json() as { configured: boolean; connected: boolean; tableCount: number };
    expect(body.configured).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.tableCount).toBe(42);
  });

  // Test 3: Returns { configured: true, connected: false, tableCount: null, error: ... } when connection fails
  it('returns { configured: true, connected: false, ... } when connection fails', async () => {
    const { router } = makeDbRouter({ connectionThrows: new Error('ECONNREFUSED') });
    const res = await router.request('/status');
    expect(res.status).toBe(200);
    const body = await res.json() as { configured: boolean; connected: boolean; tableCount: null; error: string };
    expect(body.configured).toBe(true);
    expect(body.connected).toBe(false);
    expect(body.tableCount).toBeNull();
    expect(body.error).toContain('ECONNREFUSED');
  });

  // Test 4: Calls close() after testConnection succeeds
  it('calls close() after testConnection succeeds', async () => {
    const { router, mockClose } = makeDbRouter({ connected: true, tableCount: 5 });
    await router.request('/status');
    expect(mockClose).toHaveBeenCalledOnce();
  });

  // Test 5: Calls close() after testConnection fails (try/finally)
  it('calls close() after testConnection fails (try/finally)', async () => {
    const { router, mockClose } = makeDbRouter({ connectionThrows: new Error('timeout') });
    await router.request('/status');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
