# Contract: `new-feature-branch.sh` (self-contained branch helper)

Location: `skills/tlc-spec-driven/scripts/new-feature-branch.sh`. No `.specify/` / SpecKit dependency (FR-007).

## Invocation

```
new-feature-branch.sh --json [--short-name "<name>"] [--kind feature|quick] "<description>"
```

- `--short-name` (optional): explicit slug source; if absent, slug is derived from `<description>`.
- `--kind` (optional, default `feature`): selects the artifact namespace only (`feature` → `.specs/features/`, `quick` → `.specs/quick/`); numbering pool is shared across both.
- `--json` (required here): emit machine-readable output.

## Inputs it reads

- `.specs/features/` directory entries matching `^[0-9]{3,}-`.
- `.specs/quick/` directory entries matching `^[0-9]{3,}-`.
- Local branches (`git branch`) and remote refs (`git ls-remote --heads`, skip-able / best-effort).

## Behavior

1. **Number**: `FEATURE_NUM = max(highest across all four sources) + 1`, formatted `printf '%03d'` with base-10 forced (`$((10#$n))`) to avoid octal (FR-008, SC-003).
2. **Slug**: lowercase → non-alnum to `-` → collapse `--` → trim leading/trailing `-`. For description-derived slugs, apply stop-word filtering and keep the first 3 meaningful words (4 if exactly 4).
3. **Branch name**: `BRANCH_NAME = "${FEATURE_NUM}-${SLUG}"`, truncated to a 244-byte git limit if needed.
4. **Create/switch** (FR-012/FR-017):
   - If `BRANCH_NAME` exists (local or remote-tracking): `git checkout` it (no reset/overwrite).
   - Else: `git checkout -b "$BRANCH_NAME"` **from current HEAD** (no prior switch to main).
5. **Output**: JSON `{"BRANCH_NAME":"...","FEATURE_NUM":"...","KIND":"..."}` on success.

## Error / edge behavior

| Condition | Required behavior |
|---|---|
| Not a git repo | Exit non-zero with a clear message (no silent failure) — edge case in spec |
| No commits yet (unborn HEAD) | Create branch on unborn HEAD or emit actionable message; MUST NOT crash silently |
| Branch already exists | Switch to it; do not overwrite (FR-012) |
| Remote unreachable | Skip remote scan (best-effort); still compute from local sources |
| Empty description AND no `--short-name` | Exit non-zero prompting for input (supports FR-014 at the command layer) |

## Test contract (TDD — Principle I)

Tests in `scripts/tests/new-feature-branch.test.sh` MUST be written first and cover:

- **T1**: number = max+1 when highest lives in `.specs/features/`.
- **T2**: number = max+1 when highest lives in `.specs/quick/`.
- **T3**: number considers existing git branches (local).
- **T4**: no collision when the same number exists in a dir and a branch.
- **T5**: base-10 padding (e.g. `008` → next `009`, never octal error).
- **T6**: existing target branch → switch, not overwrite (HEAD unchanged content, branch reused).
- **T7**: new branch is created from current HEAD (parent commit == prior HEAD).
- **T8**: non-git dir → non-zero exit + message.
- **T9**: slug derivation (stop-words, dash collapse, casing).
- **T10**: JSON output shape is parseable and contains `BRANCH_NAME` + `FEATURE_NUM`.
