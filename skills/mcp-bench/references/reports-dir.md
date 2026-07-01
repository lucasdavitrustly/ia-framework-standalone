# Reports Directory — resolution rule

All mcp-bench artifacts (capture reports and judgment outputs) are written under
the **ia-framework runtime data directory**, NOT the current working directory of
the project being benchmarked. This keeps benchmark artifacts out of arbitrary
project repos and in one place that is already git-ignored by ia-framework.

## Canonical location

```
<ia-framework-root>/.ia-framework/mcp-bench-reports/
```

This is already covered by ia-framework's `.gitignore` (the whole
`.ia-framework/` runtime dir is ignored), so reports are never committed — no
per-project `.gitignore` edit is required.

## How to resolve `REPORTS_DIR` (in order of preference)

1. **Env var (preferred).** If `IA_FRAMEWORK_DIR` is set in the environment, use:

   ```bash
   REPORTS_DIR="${IA_FRAMEWORK_DIR}/mcp-bench-reports"
   ```

   (`IA_FRAMEWORK_DIR` already points at `<ia-framework-root>/.ia-framework`.)

2. **Derive from the skill location (fallback).** This skill is installed via a
   symlink, so its directory always resolves to the real repo path
   `<ia-framework-root>/skills/mcp-bench`. The runtime dir is therefore two
   levels up plus `.ia-framework`:

   ```bash
   # SKILL_DIR = .../skills/mcp-bench  (resolve symlinks: realpath / readlink -f)
   REPORTS_DIR="$(cd "$SKILL_DIR/../../.ia-framework" && pwd)/mcp-bench-reports"
   ```

   Resolve the skill dir from the references path you already use to read
   `model-pricing.json` / `report-template.md` (its parent is `references/`,
   whose parent is the skill dir). Use `realpath`/`readlink -f` so the symlink is
   followed to the real ia-framework checkout.

3. **Last resort.** If neither the env var nor the skill path can be resolved,
   warn the user and fall back to `./mcp-bench-reports/` in the cwd so the run
   still completes; note the fallback in the summary line.

## Usage

- Always `mkdir -p "$REPORTS_DIR"` before writing.
- Capture filename:
  `$REPORTS_DIR/<model-slug>__<prompt-slug>__<mcp|baseline>__<UTC-ISO with : as ->.md`
- Judgment outputs:
  `$REPORTS_DIR/_judgment__<prompt-slug>__<UTC-ISO with : as ->.{md,html}`
- The judge globs `"$REPORTS_DIR"/*.md` (excluding `_judgment__*`) — there is no
  cached state; always glob live.
- Because the target lives under ia-framework's already-ignored `.ia-framework/`,
  do NOT create or edit a `.gitignore` in the benchmarked project.
