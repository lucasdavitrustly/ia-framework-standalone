import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  // Do not bundle dependencies from node_modules. Native/CJS addons such as
  // better-sqlite3 must be require()'d at runtime, not inlined into the ESM
  // bundle (inlining produces `Dynamic require of "fs" is not supported`).
  skipNodeModulesBundle: true,
  external: ['better-sqlite3'],
});
