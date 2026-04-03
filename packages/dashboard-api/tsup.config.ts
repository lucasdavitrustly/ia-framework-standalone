import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry (index.ts) — separate bundle for imports
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node22',
    external: [
      'node:fs',
      'node:path',
      'node:events',
      'node:http',
      'node:url',
      'node:child_process',
      'node:util',
      'node:crypto',
      'node:stream',
      'node:buffer',
      'node:os',
    ],
  },
  // Server entry — standalone bundle (no code splitting) so import.meta.url guard works
  {
    entry: ['src/server.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    splitting: false,
    target: 'node22',
    external: [
      'node:fs',
      'node:path',
      'node:events',
      'node:http',
      'node:url',
      'node:child_process',
      'node:util',
      'node:crypto',
      'node:stream',
      'node:buffer',
      'node:os',
    ],
  },
]);
