/**
 * Loads few-shot prompt examples for LLM chunking.
 *
 * By default reads from the bundled `./default-examples/` directory.
 * If a `configDir` is provided (e.g. `.ia-framework/prompt-examples/`),
 * attempts to read `good-boundary.md` and `bad-boundary.md` from that path.
 * Falls back to built-in defaults if files are not found.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_EXAMPLES_DIR = join(__dirname, 'default-examples');

export interface PromptExamples {
  good: string;
  bad: string;
}

/**
 * Load prompt examples for few-shot chunking guidance.
 *
 * @param configDir - Optional path to a directory containing custom
 *   `good-boundary.md` and `bad-boundary.md` files.
 *   If omitted, not found, or the files are missing, built-in Java defaults are used.
 * @returns Object with `good` and `bad` example strings.
 */
export async function loadPromptExamples(configDir?: string): Promise<PromptExamples> {
  if (configDir) {
    try {
      const [good, bad] = await Promise.all([
        readFile(join(configDir, 'good-boundary.md'), 'utf-8'),
        readFile(join(configDir, 'bad-boundary.md'), 'utf-8'),
      ]);
      return { good, bad };
    } catch {
      // Falls through to defaults below
    }
  }

  // Load built-in defaults
  const [good, bad] = await Promise.all([
    readFile(join(DEFAULT_EXAMPLES_DIR, 'good-boundary.md'), 'utf-8'),
    readFile(join(DEFAULT_EXAMPLES_DIR, 'bad-boundary.md'), 'utf-8'),
  ]);
  return { good, bad };
}
