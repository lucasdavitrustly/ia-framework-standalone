# CLI Contract: `ia-framework agents inject` (and `check`)

Package: `@ia-framework/cli` — `packages/cli/src/commands/agents.command.ts`.

## `agents inject`

Injects (or refreshes) the marker-delimited agent guidance block into the agent
documentation file of each designated injection target.

### Options

| Option | Type | Default | Behavior |
|--------|------|---------|----------|
| `-c, --config <path>` | string | resolved default | Path to `project.json`. |
| `--file <path>` | string | — | Explicit single target file; **overrides** target resolution and injects only into this file. |

The command is **non-interactive** — it never prompts (FR-010a).

### Target resolution (when `--file` is not given)

1. Load + validate config (Zod). On invalid config → error and non-zero exit (FR-009).
2. Resolve targets via `RepoRegistry.getInjectionTargets()`:
   - Legacy `targetProjectPath` config → the single legacy target (implicitly opted-in).
   - `repos[]` config → entries where `injectAgents === true`.
   - De-duplicate by absolute path.
3. If **zero** targets → print `No injection target configured. Set "injectAgents": true on a repo in project.json, or run the installer to choose.` and exit 0 **without modifying any file** (FR-004).

### Per-target behavior

For each resolved target:
1. Pick the agent doc file: existing `AGENTS.md` → else existing `CLAUDE.md` → else create `AGENTS.md` (FR-007, documented precedence).
2. Call `injectIntoFile()` (idempotent via markers): create / inject / refresh (FR-006).
3. If the target path is missing/inaccessible or the write fails → record `failed` and **continue** with remaining targets (FR-012).

### Output (per-target summary — FR-011)

Prints one line per target, then a summary. Example:

```
backend    AGENTS.md    refreshed
frontend   AGENTS.md    created
mobile     —            failed (path not accessible)

Injected: 0  Refreshed: 1  Created: 1  Skipped: 0  Failed: 1
```

### Exit codes

- `0` — all resolved targets processed (including the zero-target no-op).
- non-zero — config load/validation failure, or (optionally) when one or more targets `failed` (surface failure to callers/installer).

## `agents check`

Reports whether the guidance block is present. Extended to check **all** injection
targets (was: single resolved project root). Prints per-target found/not-found.
Remains non-interactive and read-only.

## Injected block content contract

Single block between `<!-- ia-framework:rag-start -->` and
`<!-- ia-framework:rag-end -->` containing, in order:

1. Codebase RAG Tools (`search_codebase`, `get_file`, `get_dependencies`) — existing.
2. Context7 usage guidance — when to use / not use (FR-013).
3. Sequential Thinking usage guidance — when to use / not use (FR-014).

A refresh replaces the whole block; the three sections always update together
with no duplication (FR-015, SC-008).

## Installer contract (`install.sh` Step 6.5)

- If ≥1 repo has `injectAgents: true` (or config is legacy) → run `agents inject` non-interactively.
- If **zero** repos flagged (new `repos[]` config) → present a checkbox multi-select
  (`prompt_toggle_select`) of repos; write chosen `injectAgents: true` back to
  `project.json`; then run `agents inject`. If the user selects none → skip injection,
  complete successfully, and point to how to enable later (US2 scenario 2).
