import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
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
});
