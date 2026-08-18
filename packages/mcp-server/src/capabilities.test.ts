import { describe, test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCapabilities,
  isDegraded,
  serverMode,
  withDegradation,
} from './capabilities.js';
import { validateRepoPaths } from './server.js';

describe('ServerCapabilities', () => {
  test('fresh capabilities are not degraded', () => {
    const caps = createCapabilities('26.0.0');
    expect(isDegraded(caps)).toBe(false);
    expect(serverMode(caps)).toBe('FULL');
    expect(caps.runtimeVersion).toBe('26.0.0');
  });

  test('adding a degraded feature flips mode to DEGRADED', () => {
    const caps = createCapabilities('26.0.0');
    caps.degradedFeatures.push('metrics_collection');
    caps.degradedReasons.push('Metrics disabled: no SQLite backend.');
    expect(isDegraded(caps)).toBe(true);
    expect(serverMode(caps)).toBe('DEGRADED');
  });

  test('withDegradation leaves structuredContent untouched when fully operational', () => {
    const caps = createCapabilities('26.0.0');
    const sc = { answered: true };
    expect(withDegradation(sc, caps)).toBe(sc);
  });

  test('withDegradation injects warnings and degraded_features when degraded', () => {
    const caps = createCapabilities('26.0.0');
    caps.degradedFeatures.push('dependency_graph_expansion');
    caps.degradedReasons.push('Graph expansion unavailable.');
    const merged = withDegradation({ answered: true }, caps);
    expect(merged).toMatchObject({
      answered: true,
      status: 'unavailable',
      warnings: ['Graph expansion unavailable.'],
      degraded_features: ['dependency_graph_expansion'],
    });
  });

  test('withDegradation handles undefined structuredContent', () => {
    const caps = createCapabilities('26.0.0');
    caps.degradedFeatures.push('metrics_collection');
    caps.degradedReasons.push('disabled');
    const merged = withDegradation(undefined, caps);
    expect(merged).toMatchObject({
      warnings: ['disabled'],
      degraded_features: ['metrics_collection'],
    });
  });
});

describe('validateRepoPaths', () => {
  test('marks an existing directory accessible and a missing one inaccessible', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repo-validate-'));
    try {
      const map = new Map<string, string>([
        ['good', dir],
        ['bad', join(dir, 'does-not-exist')],
      ]);
      const result = validateRepoPaths(map);
      expect(result.get('good')?.accessible).toBe(true);
      expect(result.get('bad')?.accessible).toBe(false);
      expect(result.get('bad')?.error).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
