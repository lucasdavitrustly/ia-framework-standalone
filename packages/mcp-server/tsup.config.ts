import { defineConfig } from 'tsup';

// esbuild plugin that forces workspace packages to stay external in the JS
// bundle. This runs during module resolution and wins over the tsconfig
// `paths` map (@ia-framework/* -> src), which exists only so the DTS pass can
// resolve sibling types without depending on sibling dist/*.d.ts. Without this,
// esbuild would follow `paths` and inline sibling SOURCE, dragging transitive
// deps like `pino` in as unresolved runtime externals.
const externalWorkspacePackages = {
  name: 'external-workspace-packages',
  setup(build: { onResolve: (o: { filter: RegExp }, cb: (a: { path: string }) => { path: string; external: true }) => void }) {
    build.onResolve({ filter: /^@ia-framework\// }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
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
  esbuildPlugins: [externalWorkspacePackages],
});
