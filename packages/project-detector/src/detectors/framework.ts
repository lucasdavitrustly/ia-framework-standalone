import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Maps dependency name (or prefix) to framework label
const FRAMEWORK_MAP: Array<{ dep: string; framework: string }> = [
  { dep: 'next', framework: 'next.js' },
  { dep: 'nuxt', framework: 'nuxt' },
  { dep: '@nuxt/core', framework: 'nuxt' },
  { dep: 'react', framework: 'react' },
  { dep: 'vue', framework: 'vue' },
  { dep: 'svelte', framework: 'svelte' },
  { dep: '@angular/core', framework: 'angular' },
  { dep: 'express', framework: 'express' },
  { dep: 'fastify', framework: 'fastify' },
  { dep: 'hono', framework: 'hono' },
  { dep: '@nestjs/core', framework: 'nestjs' },
  { dep: 'koa', framework: 'koa' },
  { dep: 'remix', framework: 'remix' },
  { dep: '@remix-run/node', framework: 'remix' },
  { dep: 'astro', framework: 'astro' },
  { dep: 'vite', framework: 'vite' },
  { dep: 'electron', framework: 'electron' },
];

export async function detectFrameworks(projectPath: string): Promise<string[]> {
  let pkgJson: PackageJson;
  try {
    const raw = await readFile(join(projectPath, 'package.json'), 'utf-8');
    pkgJson = JSON.parse(raw) as PackageJson;
  } catch {
    return [];
  }

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };

  const frameworks = new Set<string>();
  for (const { dep, framework } of FRAMEWORK_MAP) {
    if (dep in allDeps) {
      frameworks.add(framework);
    }
  }
  return [...frameworks];
}
