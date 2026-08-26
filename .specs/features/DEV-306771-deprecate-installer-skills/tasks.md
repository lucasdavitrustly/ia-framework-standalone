# DEV-306771 — Deprecate four skills: Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

> ⚠ **T1 is a survival prerequisite.** `~/.config/opencode/skills/tlc-spec-driven` is currently a
> symlink into `skills/tlc-spec-driven/`, which T13 deletes. If T1 has not completed, this skill
> stops resolving mid-feature. T1 runs first, always.

---

**Spec**: `.specs/features/DEV-306771-deprecate-installer-skills/spec.md`
**Design**: `.specs/features/DEV-306771-deprecate-installer-skills/design.md` — **Approved 2026-08-21**
**Context**: `.specs/features/DEV-306771-deprecate-installer-skills/CONTEXT.md` — **authoritative** where it contradicts the spec
**Status**: **Approved** — 2026-08-21. Ready for Execute.
**Scope**: Large — 16 tasks, 6 phases

### Design decisions this task list encodes

The design is **Approved**; all five of its former open items are decided (see design.md
§Approval record). They are settled — do not re-litigate them during Execute.

| Item | Decision | Effect on this task list |
| ---- | -------- | ------------------------ |
| **D-1** `uninstall.sh` aborts at `:63` (25 top-level `local`, zero functions, `set -euo pipefail`) — verified by execution, broken since `8ffd595` | **Strip the 25 `local` keywords** | **T10** exists. Without it T11/DEPR-13 is source-only and unevidenceable. |
| **D-2** `json_remove_hooks:500` re-stringifies unconditionally, so P1-4 AC 7's "byte-identical" is unachievable | **Reinterpret as entry-preserving**; detection is strictly read-only | T4 asserts read-only detection; T6 asserts *parsed* `{event,matcher,command}` triples, never file bytes. |
| **D-3** DEPR-N03's "precedence bug" premise is factually wrong — `A \|\| B && C` already parses as `(A\|\|B) && C` | **Comply as style** (explicit grouping / shellcheck `SC2015`), not as a bug fix | T6 uses the braced form. **No task asserts a behaviour change at `install-skills.sh:461,473`.** |
| **D-6** Architecture | **Approach C** — 4 helpers + thin orchestrator, detection separated from mutation | Phases 1–4 decompose along that seam; all `rm` is confined to T6. |
| **AD-006 / AD-007** | **Append both to `.specs/STATE.md`** | **T16** exists. |

**A-05 stays defaulted (undiscussed):** no `test:shell` runner. `pnpm test` = `turbo run test` and
never invokes `scripts/tests/*`; there is no CI. The new shell suite is **manual-only** and every
gate below therefore names its `bash …` command explicitly.

---

## Test Coverage Matrix

> **Confirmed 2026-08-21 — authoritative for Execute.** Generated from codebase, project guidelines,
> and spec.
> Guidelines found: `CLAUDE.md` (Vitest/TDD — **TypeScript only**, no shell guidance), `package.json`
> (`test` = `turbo run test`, does not reach `scripts/tests/*`), no `CONTRIBUTING.md`, no
> `.github/` (no CI), no `shellcheck` installed. **No guideline covers shell code** → the strong
> default applies, with `scripts/tests/*.test.sh` as the style/location floor.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Shell library function — pure (`_deprecated_assets_for`, `OFFICIAL_SKILLS` filter) | unit (shell) | All branches; 1:1 to spec ACs; every listed edge case has a test | `scripts/tests/*.test.sh` | `bash scripts/tests/remove-deprecated-skills.test.sh` |
| Shell library function — read-only query (`_deprecated_trace_in`, `_registry_has_deprecated_entry`) | unit (shell) | Every trace state in the lattice (`linked/broken/copied/files/registry/absent`) + malformed-registry + empty-`IDE_*_DIR` edge cases + a read-only assertion | `scripts/tests/*.test.sh` | `bash scripts/tests/remove-deprecated-skills.test.sh` |
| Shell library function — mutator (`_remove_deprecated_from`) | unit (shell) | All branches; every asset kind; `.toml` twin; hook-order; orphan purge; unrelated-entry preservation; empty-dir skips; source-absent | `scripts/tests/*.test.sh` | `bash scripts/tests/remove-deprecated-skills.test.sh` |
| Shell library function — prompt (`_prompt_deprecated_removal`) | unit (shell) | Interactive + non-interactive × `linked`/`copied`; decline path; stream discipline (stderr prose / stdout token) | `scripts/tests/*.test.sh` | `bash scripts/tests/remove-deprecated-skills.test.sh` |
| Shell library function — orchestrator (`remove_deprecated_skills`) | integration (shell) | Happy path + every listed edge case + failure paths; always-0; idempotency; one-line-per-changed-pair | `scripts/tests/*.test.sh` | `bash scripts/tests/remove-deprecated-skills.test.sh` |
| Shell entrypoint / wiring (`setup_skills`, `scripts/uninstall.sh`) | integration (shell) | Call is reached on every path the spec names (incl. no-IDE-selected); script exits 0 | `scripts/tests/*.test.sh` | `bash scripts/tests/uninstall-deprecated-skills.test.sh` |
| Repository content — docs, deleted dirs, deleted test files (`AGENTS.md`, `README.md`, `skills/*/`) | none | — (build gate + grep assertion in `Done when`) | — | build gate only |
| Local machine operation (materialization under `$HOME`) | none | — (`Done when` asserts observable machine state directly) | — | manual assertion only |

**Coverage Expectation provenance:** no project guideline governs shell code, so the strong default
is used. `scripts/tests/migrate-legacy-skills.test.sh` (4/0) and
`scripts/tests/install-skills-state.test.sh` (5/0) set the **floor** for harness style, not a
ceiling on thoroughness — the depth target comes from the spec's 45 ACs and 13 Edge Cases.

**Two test files, not one** — a justified refinement of design §9, which named only
`remove-deprecated-skills.test.sh`:

| File | Harness shape | Covers |
| ---- | ------------- | ------ |
| `scripts/tests/remove-deprecated-skills.test.sh` | `source`s `installer-helpers.sh` + `install-skills.sh` into a sandbox and calls functions directly (`migrate-legacy-skills.test.sh` precedent) | T2–T9 |
| `scripts/tests/uninstall-deprecated-skills.test.sh` | **exec**s `scripts/uninstall.sh` as a subprocess with a redirected `HOME` | T10–T11 |

`uninstall.sh` is a script with top-level statements, not a sourceable library — it cannot be tested
by the source-and-call harness. Splitting keeps each task atomic and each file coherent. Both satisfy
spec P2-2 AC 1 and AC 2 (standalone, non-zero exit on failure).

## Gate Check Commands

> **Confirmed 2026-08-21 — authoritative for Execute.** Generated from codebase.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks touching only the removal library (T2–T9) | `bash scripts/tests/remove-deprecated-skills.test.sh` |
| Full | After tasks touching `uninstall.sh` or spanning both suites (T10–T11) | `bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh` |
| Build | After phase completion, repo-cleanup and docs-only tasks (T12–T16) | `bash -n scripts/install-skills.sh && bash -n scripts/uninstall.sh && bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh` |

**Pre-feature baseline (verified by execution, 2026-08-21):**

| Suite | Result | After this feature |
| ----- | ------ | ------------------ |
| `install-skills-state.test.sh` | 5 passed, 0 failed | must stay 5/0 |
| `migrate-legacy-skills.test.sh` | 4 passed, 0 failed | must stay 4/0 |
| `refuter-drift-detector.test.js` | 4 passed, 0 failed | **deleted by T12** (−4) |
| `refuter-orchestration-complete.test.js` | 5 passed, 0 failed | **deleted by T12** (−5) |
| `remove-deprecated-skills.test.sh` | — | **new, 36 tests** |
| `uninstall-deprecated-skills.test.sh` | — | **new, 4 tests** |

Net assertion delta: **−9 / +40**. `shellcheck` is **not installed** — no task may gate on it.

**Environment constraints (verified):** bash `3.2.57` — no `declare -A`; under `set -u`, iterating an
empty array is a fatal *unbound variable* while `${#a[@]}` is safe. Every new loop must count-guard
first or iterate a **string** with `for rel in $assets` (the `_legacy_assets_for` precedent).
`node` v26.7.0 is the only external tool on the write path.

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks
within a phase execute in order.

### Phase 0: Survive the deletion (1 task)

Local machine operation. Must complete before anything deletes `skills/tlc-spec-driven/`.

```
T1
```

### Phase 1: Closed data — allowlist + manifest (2 tasks)

Pure `case`/array data with no filesystem dependency. T2 creates the shared test harness.

```
T2 → T3
```

### Phase 2: Read-only detection (2 tasks)

```
T4 → T5
```

### Phase 3: Mutation + consent (2 tasks)

```
T6 → T7
```

### Phase 4: Orchestrator + wiring (4 tasks)

```
T8 → T9 → T10 → T11
```

### Phase 5: Repository cleanup (4 tasks)

Ordered so the suite is never red between tasks: the two orphaned JS tests die **before** the hooks
they execute.

```
T12 → T13 → T14 → T15
```

### Phase 6: Project memory (1 task)

```
T16
```

---

## Task Breakdown

### T1: Materialize `tlc-spec-driven` locally before it can be deleted

**What**: Replace the repo symlinks for `tlc-spec-driven`'s skill directory and its five `tlc-*` command links with real files under `$HOME`, so this skill keeps resolving after T13.
**Where**: `~/.config/opencode/skills/tlc-spec-driven/` (dir), `~/.config/opencode/command/tlc-{specify,design,tasks,execute,discuss}.md` — **no repo files change**
**Depends on**: None
**Reuses**: Nothing — one-off `cp -RL` / `cp -L` operation
**Requirement**: DEPR-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `readlink ~/.config/opencode/skills/tlc-spec-driven` prints **empty** and `test -f ~/.config/opencode/skills/tlc-spec-driven/SKILL.md` succeeds
- [X] `references/`, `scripts/`, `commands/`, `skill.json`, `README.md` are present as real files under that directory
- [X] All five of `tlc-specify.md`, `tlc-design.md`, `tlc-tasks.md`, `tlc-execute.md`, `tlc-discuss.md` in `~/.config/opencode/command/` are real files (`readlink` empty), with content identical to the pre-deletion originals
- [X] `delivery.md` and `start-work-on.md` are **left as symlinks** — they are deliberately not materialized so the shipped removal path deletes them (CONTEXT.md)
- [X] `readlink ~/.config/opencode/skills/mcp-bench` still points into this repo, and the three `mcp-bench-*.md` command links are untouched symlinks
- [X] The four `agents/` links, two non-`tlc` command links and nine `hooks/` links for `grill-with-docs`/`jira-feed`/`refuter` are **left in place** — the shipped removal path is what deletes them, making this machine a live test (CONTEXT.md)
- [X] `git status --porcelain` shows **no change** — this task touches only `$HOME`

**Tests**: none (Local machine operation layer — matrix says none; `Done when` asserts machine state directly)
**Gate**: none — no repo code changed, so no suite can observe this task

**Commit**: **NONE.** This task produces zero repo diff. Do not create an empty commit; record completion in the batch summary instead.

**Status: ✅ Complete** (2026-08-21). Verified via manual re-materialization after an unrelated incident; all Done-when checks re-confirmed. No commit, as designed.

---

### T2: Add `OFFICIAL_SKILLS` allowlist and filter `scan_skills`

**What**: Add the closed `OFFICIAL_SKILLS=("mcp-bench")` array and gate `AVAILABLE_SKILLS+=` on membership, so a non-allowlisted `skills/*/skill.json` is skipped silently.
**Where**: `scripts/install-skills.sh` (array near `:26` beside `LEGACY_SKILL_RENAMES`; guard replaces `:155`), `scripts/tests/remove-deprecated-skills.test.sh` (**new**)
**Depends on**: T1
**Reuses**: `scan_skills:135-157`'s existing glob and `node`-based `.name` read (already satisfies P1-1 AC 3 — do not re-implement); the `[[ " ${ARR[*]} " == *" $x "* ]]` membership idiom from `installer-helpers.sh:306`; harness copied wholesale from `scripts/tests/migrate-legacy-skills.test.sh`
**Requirement**: DEPR-01, DEPR-N05 (harness)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `OFFICIAL_SKILLS=("mcp-bench")` is a plain indexed array (no `declare -A` — bash 3.2)
- [X] `[ -n "$name" ] && AVAILABLE_SKILLS+=("$name")` at `:155` is replaced by a membership guard; a non-member is skipped with **no error and no warning** (P1-1 AC 2)
- [X] The missing-`skills/` warn-and-`return 0` path at `:139-142` is unchanged (Edge Case: must not regress)
- [X] New test file created with the full harness: `mktemp` sandbox + `trap`, exported `SCRIPT_DIR`/`HOME`, real IDE descriptors copied in, `NON_INTERACTIVE=1`, shadowed `source_ide_descriptor`, `tN()` functions, `PASS`/`FAIL` counters, `set -u` **only** (not `-e`), final `[ "$FAIL" -eq 0 ]` (spec P2-2 AC 1)
- [X] Tests assert: a fixture with `mcp-bench` + an unsanctioned skill yields `AVAILABLE_SKILLS` == exactly `mcp-bench`; the unsanctioned entry causes exit 0 with no output; an allowlisted skill whose directory name differs from its `skill.json` `.name` resolves by `.name`
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **3** tests pass, 0 fail (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(install-skills): gate distributable skills behind an OFFICIAL_SKILLS allowlist`

**Status: ✅ Complete** — commit `3a9ae9d`. 3/0.

---

### T3: Add `DEPRECATED_SKILLS` + `_deprecated_assets_for` manifest

**What**: Add the four-name array and a pure `case`/`echo` function returning each skill's history-derived asset manifest as one space-separated line, independent of the source tree T13 deletes.
**Where**: `scripts/install-skills.sh` (immediately after `_legacy_assets_for`, which ends at `:48`), `scripts/tests/remove-deprecated-skills.test.sh` (extend)
**Depends on**: T2
**Reuses**: `_legacy_assets_for:32-48`'s exact shape — `case`, one `echo` per name, `*) echo "" ;;` for unknown
**Requirement**: DEPR-03, DEPR-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `DEPRECATED_SKILLS=("grill-with-docs" "jira-feed" "refuter" "tlc-spec-driven")`
- [X] `_deprecated_assets_for NAME` writes one space-separated line of `agents/`-, `commands/`- or `hooks/`-prefixed relative paths to **stdout**; empty string for an unknown name **and** for `grill-with-docs` (P1-2 AC 1)
- [X] Contents are the **history-derived union** (`git log --all --diff-filter=A`), not the current tree: `grill-with-docs` → 0; `jira-feed` → 1 agent + 1 command + 2 hooks = 4; `refuter` → 3 agents + 1 command + 7 hooks = 11; `tlc-spec-driven` → `agents/tlc-specify-runner.md` + 13 commands = 14 (design §4 table is the literal source)
- [X] Function is pure: no filesystem access, no `node`, no subshell beyond `echo`
- [X] No manifest basename collides with `mcp-bench`'s `mcp-bench-{baseline,judge,run}.md` (Edge Case — assert in test)
- [X] Tests assert: `jira-feed` returns exactly its 4 paths; `grill-with-docs` returns empty; an unknown name returns empty; `refuter` word-count is 11 and `tlc-spec-driven` is 14; zero intersection with `mcp-bench`'s three command basenames
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **8** tests pass, 0 fail (3 from T2 + 5 new)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(install-skills): add hardcoded deprecated-skill asset manifest`

**Status: ✅ Complete** — commit `8cb9f0c`. 8/0. Counts (0/4/11/14) verified independently against `git log --all --diff-filter=A`.

---

### T4: Add `_registry_has_deprecated_entry` read-only registry probe

**What**: Add a helper that answers "does this IDE's hook registry contain any of these command paths?" with a single `node` read and **zero writes**.
**Where**: `scripts/install-skills.sh` (after `_deprecated_assets_for`), `scripts/tests/remove-deprecated-skills.test.sh` (extend)
**Depends on**: T3
**Reuses**: `json_remove_hooks:474-481`'s `case` for the two registry paths (`claude-code` → `~/.claude/settings.json`, `codex` → `~/.codex/hooks.json`) and its `[ -f ] || return 0` guard. **Must NOT call `json_remove_hooks`** — it rewrites the file even on a no-op match (`:500`, D-2)
**Requirement**: DEPR-06 (A-06), DEPR-N01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `_registry_has_deprecated_entry IDE_ID PATHS…` → exit `0` when any path matches an `h.command` by exact string equality, `1` otherwise
- [X] Returns `1` immediately for any IDE other than `claude-code`/`codex`, and for a missing registry file — **without creating it** (Edge Case)
- [X] Malformed JSON / `node` failure → `catch` → reads as **no trace** (`1`), never aborts (DEPR-N01)
- [X] **Strictly read-only**: no `writeFileSync`, no `json_remove_hooks` call
- [X] Tests assert: a seeded `settings.json` containing a manifest hook path → trace; one containing only unrelated paths → no trace; malformed JSON → no trace and exit code is 1 not an abort; **the registry file's bytes are unchanged after a probe** (`cmp` before/after) — this is the D-2 read-only guarantee
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **12** tests pass, 0 fail (8 + 4 new)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(install-skills): add read-only hook-registry probe for deprecated skills`

**Status: ✅ Complete** — commit `b4122f2`. 12/0. Non-hook-IDE + missing-registry-file behavior verified by manual execution during implementation (not separately persisted as a test; noted as a spec-precision gap in the batch's adequacy review).

---

### T5: Add `_deprecated_trace_in` detection

**What**: Add the read-only per-(skill, IDE) detector that reports whether a trace exists and which state it is, covering skill dir, manifest assets and registry-only orphans.
**Where**: `scripts/install-skills.sh` (after `_registry_has_deprecated_entry`), `scripts/tests/remove-deprecated-skills.test.sh` (extend)
**Depends on**: T4
**Reuses**: `detect_link_state` (`installer-helpers.sh:359-370`) verbatim for the skill dir — do **not** re-implement the `-L`/`-e` logic; `source_ide_descriptor` (`:344-353`) always with `|| continue` **and** the 12-var `unset` block, per `migrate_legacy_skills:68-77`; `migrate_legacy_skills:91-121`'s asset-kind `case` shape for the per-file checks
**Requirement**: DEPR-06 (P1-2 AC 3,4,5; A-06, A-10)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `_deprecated_trace_in NAME IDE_ID` → exit `0` = trace, `1` = none; sets global `TRACE_STATE` ∈ `linked|broken|copied|files|registry`
- [X] Detection order is: (1) non-empty `IDE_SKILLS_DIR` → `detect_link_state`, where `linked|broken|copied` are a trace and `absent` is not (P1-2 AC 4); (2) any manifest asset present under `-L` **or** `-e`, **including the `.toml` twin**, → `files`; (3) `claude-code`/`codex` only → `_registry_has_deprecated_entry` → `registry`
- [X] A `copied` skill directory **dominates** the returned state — it alone drives the CI carve-out in T7
- [X] Empty `IDE_SKILLS_DIR` skips step 1 without error and still reaches step 2 (P1-2 AC 5 — `vscode-copilot`, verified `IDE_SKILLS_DIR=""` + real `IDE_AGENTS_DIR="${HOME}/.github/agents"`)
- [X] Iterates the manifest as a **string** (`for rel in $assets`), never an array — bash 3.2 `set -u` fatal on empty-array iteration
- [X] **Writes nothing** on any path
- [X] Tests assert: `linked` skill-dir symlink → trace with `TRACE_STATE=linked`; nothing anywhere → no trace; empty `IDE_SKILLS_DIR` + a manifest agent file present → trace with `TRACE_STATE=files`; registry entry only, no link and no directory → trace with `TRACE_STATE=registry` (the live `claude-code` case); a real directory → `TRACE_STATE=copied`
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **17** tests pass, 0 fail (12 + 5 new)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(install-skills): detect deprecated-skill traces across every detected IDE`

**Status: ✅ Complete** — commit `0d0e019`. 17/0.

---

### T6: Add `_remove_deprecated_from` — the only mutator

**What**: Add the single function that deletes one skill's traces from one IDE and reports counts plus removed basenames.
**Where**: `scripts/install-skills.sh` (after `_deprecated_trace_in`), `scripts/tests/remove-deprecated-skills.test.sh` (extend)
**Depends on**: T5
**Reuses**: `migrate_legacy_skills:81-121` almost verbatim — the skill-dir `rm -rf` guard, the `agents/` `.md` + `.toml` twin block (`:96-99`), the hook `json_remove_hooks`-then-`rm -f` ordering with its link-absent `else` branch that still deregisters (`:110-118`); `json_remove_hooks` (`installer-helpers.sh:470-502`) for deregistration — no new JSON writer
**Requirement**: DEPR-08, DEPR-09, DEPR-10, DEPR-N03, DEPR-N04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `_remove_deprecated_from NAME IDE_ID` → **always returns 0**; sets `RM_LINKS` (int), `RM_HOOKS` (int), `RM_NAMES` (space-separated removed basenames)
- [X] Removal order is exactly: skill-dir symlink → agents (`.md` + `.toml`) → `json_remove_hooks` → `rm -f` hook → commands
- [X] `json_remove_hooks "$ide_id" "${hooks_dir}/<basename>"` is called with that **absolute path** and **before** `rm -f`, because it matches on exact string equality of `h.command` (P1-2 AC 7)
- [X] `json_remove_hooks` is called **even when the hook link is already absent**, purging the orphan (P1-2 AC 9 — the live `claude-code` case)
- [X] Agents remove **both** `<base>.md` and the transformed `<base>.toml` twin — verified real files, not symlinks, under `codex` `IDE_AGENT_FORMAT=toml` (P1-2 AC 8)
- [X] Skill dir uses `rm -rf` under the **braced** `{ [ -L "$p" ] || [ -e "$p" ]; } && rm …` form (DEPR-N03 per D-3 — adopted as explicit-grouping style; **do not claim a bug fix at `:461,:473`**, there is none)
- [X] Empty `IDE_SKILLS_DIR`/`IDE_COMMANDS_DIR`/`IDE_HOOKS_DIR` → that asset kind is skipped with no error (Edge Cases: `codex`/`vscode-copilot` commands; the four hook-less IDEs)
- [X] Writes only under the four `IDE_*_DIR` of the seven known descriptors, and only for manifest basenames — the manifest is a closed `case` literal, so no developer-supplied path reaches `rm` (DEPR-N04)
- [X] Iterates `for rel in $assets` (string, not array)
- [X] Tests assert: skill-dir symlink removed; agent `.md` **and** `.toml` twin both removed; a registered hook is both deregistered and unlinked; a hook with **no link file** still has its registry entry purged; **unrelated registry entries survive as parsed `{event,matcher,command}` triples** (D-2 — compare parsed sets via `node`, never file bytes); empty `IDE_COMMANDS_DIR` is skipped with exit 0; removal succeeds with the skill's source directory **absent** from the sandbox `SCRIPT_DIR` (P1-4 AC 4)
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **24** tests pass, 0 fail (17 + 7 new)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(install-skills): remove deprecated-skill assets and hook registrations per IDE`

**Status: ✅ Complete** — commit `c5a59e0`. 24/0. `RM_NAMES` content verified manually during dev but not independently asserted in a persisted test (deferred to T8's summary-line coverage, out of this batch's scope).

---

### T7: Add `_prompt_deprecated_removal` consent

**What**: Add the one-prompt-per-skill consent function, with the non-interactive `copied` carve-out and the decline warning.
**Where**: `scripts/install-skills.sh` (after `_remove_deprecated_from`), `scripts/tests/remove-deprecated-skills.test.sh` (extend)
**Depends on**: T6
**Reuses**: `prompt_skill_action:667-730`'s idiom exactly — prose via `echo -e … >&2`, `read -rp` with the default in parentheses, decision token to **stdout**, `tr '[:upper:]' '[:lower:]'` normalisation; `is_noninteractive` (`installer-helpers.sh:30-32`)
**Requirement**: DEPR-07, DEPR-11, DEPR-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `_prompt_deprecated_removal NAME STATE IDE_NAMES_LABEL` → **stdout** is exactly `remove` or `keep`; **all** prose goes to stderr (P1-3 AC 2)
- [X] Exactly **one** prompt per skill covering all affected IDEs at once — all-or-nothing, no per-IDE opt-out (P1-3 AC 1, A-07)
- [X] The **entire asserted payload lives in the explicit `echo … >&2` line** — skill name, the word `deprecated`, and every affected `IDE_NAME`. `read -rp` carries only `  [remove/keep] (remove): ` and is never asserted, because bash suppresses a `read -p` prompt when stdin is not a terminal (D-4, verified)
- [X] Shape: `• refuter — deprecated, found in OpenCode, Claude Code, Codex`
- [X] Interactive empty line → **`remove` uniformly, including `copied`** (CONTEXT.md overrides spec P1-3 AC 8 / A-08)
- [X] The `copied` prompt additionally states the **absolute path**, that it is a **real directory, not a link**, and that removal is permanent because the content is **not in this repo's git history** — the wording is the safeguard, not the default
- [X] `is_noninteractive` true → no prompt; `remove` for `linked|broken|files|registry`; **`keep` + warning for `copied`**, never removed (A-01 CI carve-out)
- [X] Decline → warning naming **both** causes: the source is gone from the repo so its links are dead, **and** it will be offered again on the next run. **Nothing is written to disk** — no state file is created (DEPR-14)
- [X] Tests assert: non-interactive `linked` → `remove`; non-interactive `copied` → `keep` plus a warning on stderr; interactive (via a **shadowed `is_noninteractive` returning 1**, the `migrate-legacy-skills.test.sh:50-54` precedent) with an empty line → `remove`; interactive `keep` → `keep`, warning names both causes, and no new file appears anywhere under `$HOME`; the stderr line contains the skill name, `deprecated` and **all** affected `IDE_NAME`s while stdout holds only the token
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **29** tests pass, 0 fail (24 + 5 new)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(install-skills): prompt once per deprecated skill before removing it`

**Status: ✅ Complete** — commit `46e3691`. 29/0 (matches tasks.md's cumulative target exactly).

---

### T8: Add `remove_deprecated_skills` orchestrator

**What**: Add the single public entry point running detect → prompt → apply per deprecated skill, with one summary line per changed pair.
**Where**: `scripts/install-skills.sh` (before `scan_skills` at `:135`), `scripts/tests/remove-deprecated-skills.test.sh` (extend)
**Depends on**: T7
**Reuses**: `migrate_legacy_skills:56-129`'s loop skeleton and its one-summary-line-per-pair guard (`:123-125`); the production-hardened array guard shape at `:57` (already fixed once by commit `70cb8b8`)
**Requirement**: DEPR-05, DEPR-12 (function), DEPR-N01, DEPR-N02, DEPR-N06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `remove_deprecated_skills` takes no args and **returns 0 on every code path** (DEPR-05 / P1-2 AC 10)
- [X] Opens with `{ [ "${DETECTED_IDES+set}" = set ] && [ "${#DETECTED_IDES[@]}" -gt 0 ]; } || return 0` — the `:57` guard shape, required for bash 3.2 `set -u`
- [X] Iterates **`DETECTED_IDES`** and **never names `SELECTED_IDES`** anywhere in the function body (DEPR-06 / P1-4 AC 2 — enforced by absence of the identifier)
- [X] Three passes per skill: pass 1 detect (read-only) → pass 2 exactly one prompt → pass 3 apply per affected IDE
- [X] No trace ⇒ **no prompt and no output whatsoever** (P1-3 AC 7, P1-4 AC 6)
- [X] Exactly **one summary line per changed (skill, IDE) pair**, carrying counts **and** removed basenames; **nothing** printed for an unchanged pair (DEPR-N06 as tightened by CONTEXT.md). Extends the `↻ migrated …` precedent at `:124`, e.g. `✓ removed refuter from Claude Code (4 link(s), 7 hook registration(s): refuter-analyst.md, …)`
- [X] `source_ide_descriptor … || continue` and the 12-var `unset` block on every iteration (Edge Case)
- [X] Tests assert: `DETECTED_IDES` empty/unset → exit 0, zero output; no trace anywhere → no prompt, no output, exit 0; two IDEs where only one holds a trace → only that IDE is named and only its assets change; a changed pair emits exactly one line containing both counts and basenames; an **immediate second run prints nothing and exits 0** (DEPR-N02 / P1-4 AC 6); with `SELECTED_IDES` **unset** the function still works (P1-4 AC 2); a deliberately corrupt `settings.json` still yields exit 0 with the seeded links removed (P1-4 AC 5)
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **36** tests pass, 0 fail (29 + 7 new)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(install-skills): orchestrate deprecated-skill removal across detected IDEs`

**Status: ✅ Complete** — commit `387b69e`. 36/0 (matches tasks.md's cumulative target exactly).

---

### T9: Wire `remove_deprecated_skills` into `setup_skills`

**What**: Insert the call after the `DETECTED_IDES`-empty early return and before `prompt_ide_select`, so it is reached even when the developer selects no IDE.
**Where**: `scripts/install-skills.sh` — between `:752` (`fi`) and `:754` (`echo … Select which IDE(s)`), `scripts/tests/remove-deprecated-skills.test.sh` (extend)
**Depends on**: T8
**Reuses**: Nothing — one call site. `install.sh:222`'s `setup_skills "${SCRIPT_DIR}" || echo warn` guard is unchanged
**Requirement**: DEPR-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] The call sits **strictly between `:752` and `:754`** — after `if [ "${#DETECTED_IDES[@]}" -eq 0 ]; then … return 0; fi`, before `prompt_ide_select`. Verified: `migrate_legacy_skills` at `:764` is *after* the `SELECTED_IDES`-empty return at `:757-760`, so that spot would be unreachable when no IDE is selected
- [X] Nothing else in `setup_skills` changes — `migrate_legacy_skills` at `:764` stays exactly where it is
- [X] `install.sh` Step 5.2 is **not** modified; MCP configuration (`install.sh:205-216`) is untouched (Out of Scope)
- [X] Test asserts: with a sandbox where `prompt_ide_select` is shadowed to select **nothing**, `setup_skills` still removes a seeded deprecated link — proving the call is reached on the no-IDE-selected path (P1-4 AC 1)
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh`
- [X] Test count: **37** tests pass, 0 fail (36 + 1 new)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(install-skills): call remove_deprecated_skills before IDE selection`

**Status: ✅ Complete** — commit `2e7c417`. 37/0 (matches tasks.md's cumulative target exactly).

---

### T10: Repair `scripts/uninstall.sh` — strip 25 top-level `local` keywords

**What**: Delete the `local` keyword from all 25 top-level statements so the script stops aborting at line 63 under `set -euo pipefail`. Mechanical; no logic change.
**Where**: `scripts/uninstall.sh` lines `63,64,65,71,77,83,84,96,102,124,125,129,161,176,177,183,184,185,186,187,197,203,204,217,223`; `scripts/tests/uninstall-deprecated-skills.test.sh` (**new**)
**Depends on**: T9
**Reuses**: Harness pattern from `scripts/tests/migrate-legacy-skills.test.sh`, adapted to **exec** the script as a subprocess rather than source it
**Requirement**: DEPR-13 (enabler — design D-1, approved at Tasks)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `rg -c '^\s*local ' scripts/uninstall.sh` returns **0** — the file defines zero functions, verified, so every `local` was invalid
- [X] Each edit is exactly `local x=…` → `x=…`; **no** variable renamed, no line reordered, no logic touched (**SPEC_DEVIATION**: 10 of the 25 lines were bare `local x` predeclarations with no `=`, immediately followed by an assignment on the next line — stripping only the keyword there would leave a bareword bash executes as a command, aborting under `set -u`. Those 10 lines are deleted outright instead, which is behaviorally identical since bash auto-creates a variable on first assignment. See commit `0739247`'s message for the full line-by-line accounting)
- [X] `bash -n scripts/uninstall.sh` succeeds
- [X] `bash scripts/uninstall.sh --dry-run </dev/null; echo $?` prints the dry-run report and **exit 0** (before this task it printed `line 63: local: can only be used in a function` and exited 1)
- [X] `--help` still exits 0; `--dry-run` still removes nothing
- [X] New test file created with the exec-based harness and a **redirected `HOME`**, so the real `$HOME` is never touched (assert by checksumming `~/.claude/settings.json` before and after — spec P2-2's Independent Test)
- [X] Tests assert: `bash -n` clean; `--dry-run` with a redirected `HOME` exits 0 and reaches the report (grep its output for the removal-plan header)
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh`
- [X] Test count: **37** + **2** = 39 pass, 0 fail; `install-skills-state` still 5/0 and `migrate-legacy-skills` still 4/0

**Tests**: integration
**Gate**: full

**Commit**: `fix(uninstall): remove invalid top-level local keywords that aborted the script`

**Status: ✅ Complete** — commit `0739247`. 39/0 (37+2). `--help` exit-0 verified manually, not persisted as an automated test (spec-precision gap, noted in the batch's adequacy review).

---

### T11: Wire `remove_deprecated_skills` into `scripts/uninstall.sh`

**What**: Call `detect_ides` then `remove_deprecated_skills || true` once, before the per-descriptor removal loop, so deprecated assets are purged rather than skipped by the `skills/*/skill.json` glob.
**Where**: `scripts/uninstall.sh` — immediately before the `for descriptor in "${descriptor_dir}"/*.sh` loop at `:179`; `scripts/tests/uninstall-deprecated-skills.test.sh` (extend)
**Depends on**: T10
**Reuses**: The existing `migrate_legacy_skills || true` soft-failure idiom at `:191`; `detect_ides` (`installer-helpers.sh:244`)
**Requirement**: DEPR-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `detect_ides` runs (populating `DETECTED_IDES`) and then `remove_deprecated_skills || true` is called **once, before** the loop at `:179` — **not inside it**. Inside, the loop sets `SELECTED_IDES=("$ide_id")` per IDE, so a `DETECTED_IDES`-wide routine would run 7× and emit 7× the output (D-5)
- [X] The existing per-IDE `migrate_legacy_skills || true` at `:191` is left untouched
- [X] The existing `skills/*/skill.json` glob at `:195` is left untouched — it is still correct for `mcp-bench`, whose source exists (Out of Scope: `unlink_skill`'s glob implementation stays)
- [X] Tests assert: with a redirected `HOME` seeded with a deprecated skill-dir symlink plus a `~/.claude/settings.json` hook entry, `bash scripts/uninstall.sh --yes` exits 0, the seeded link is gone, and `grep -c 'refuter' settings.json` is 0; and `--dry-run` still changes nothing
- [X] The real `$HOME` is untouched — checksum `~/.claude/settings.json` before and after
- [X] Gate check passes: `bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh`
- [X] Test count: **41** pass, 0 fail (39 + 2 new)

**Tests**: integration
**Gate**: full

**Commit**: `feat(uninstall): purge deprecated skills from every detected IDE`

**Status: ✅ Complete** — commit `b404b31`. 41/0 (37+4 shell tests). **SPEC_DEVIATION discovered by T13's build gate and fixed in a follow-up commit `e1cd825`**: the pre-existing glob-based "nothing to remove" early-exit (unrelated to this task's own edit) can never see a deprecated skill once its source directory is deleted, so on a machine whose only affected asset was a deprecated trace, the script exited before `remove_deprecated_skills` was ever reached. Fixed with a read-only pre-check that surfaces deprecated traces into the dry-run report so the early-exit no longer swallows them; the mutating call stays exactly where this task placed it.

---

### T12: Delete the two orphaned `refuter` JS test files

**What**: Delete both test files that resolve `../../skills/refuter/hooks/*.js`, which T13 removes.
**Where**: `scripts/tests/refuter-drift-detector.test.js`, `scripts/tests/refuter-orchestration-complete.test.js`
**Depends on**: T11
**Reuses**: Nothing — deletion
**Requirement**: DEPR-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] Both files no longer exist. They are **deleted outright**, not converted to skipped stubs (CONTEXT.md)
- [X] Ordered **before** T13 deliberately: they currently pass 4/0 and 5/0, and would turn red the instant `skills/refuter/hooks/` disappears. Deleting them first means the suite is never red between tasks
- [X] `ls scripts/tests/*.test.js` returns no matches
- [X] Accepted loss of 9 passing assertions is offset by the 41 new shell assertions from T2–T11 (documented in the Gate Check Commands baseline table)
- [X] Gate check passes (build): `bash -n scripts/install-skills.sh && bash -n scripts/uninstall.sh && bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh`
- [X] Test count: **41** shell tests pass, 0 fail; 0 JS test files remain

**Tests**: none (Repository content layer — matrix says none; build gate only)
**Gate**: build

**Commit**: `test: delete refuter JS tests for hooks removed by skill deprecation`

**Status: ✅ Complete** — commit `8fdfc85`. `ls scripts/tests/*.test.js` returns no matches; 41/0 shell tests unaffected.

---

### T13: Delete the four deprecated skill directories

**What**: Delete `skills/grill-with-docs/`, `skills/jira-feed/`, `skills/refuter/` and `skills/tlc-spec-driven/`, leaving `skills/` with only `mcp-bench/`.
**Where**: `skills/grill-with-docs/`, `skills/jira-feed/`, `skills/refuter/`, `skills/tlc-spec-driven/`
**Depends on**: T12
**Reuses**: Nothing — deletion. Content is retained in git history only; no in-repo archive (A-09)
**Requirement**: DEPR-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] **T1 verified first**: `readlink ~/.config/opencode/skills/tlc-spec-driven` is empty and its `SKILL.md` is a real file. Do not proceed otherwise — this task deletes the symlink target that `tlc-spec-driven` resolves through
- [X] `ls skills/` returns exactly `mcp-bench` (P1-1 AC 4)
- [X] None of the four directories exists
- [X] `skills/mcp-bench/` is byte-identical to before (`git status` shows no change under it)
- [X] The build gate **still passes with the source directories absent** — this is the direct evidence that the manifest is history-based rather than globbed (P1-4 AC 4)
- [X] `bash -c 'source scripts/installer-helpers.sh; source scripts/install-skills.sh; SCRIPT_DIR=$PWD scan_skills; printf "%s\n" "${AVAILABLE_SKILLS[@]}"'` prints exactly `mcp-bench`
- [X] Gate check passes (build): `bash -n scripts/install-skills.sh && bash -n scripts/uninstall.sh && bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh`
- [X] Test count: **41** pass, 0 fail — unchanged by the deletion, because every suite builds its own sandbox fixture

**Tests**: none (Repository content layer — matrix says none; build gate only, and it is the load-bearing evidence here)
**Gate**: build

**Commit**: `feat!: delete grill-with-docs, jira-feed, refuter and tlc-spec-driven skills`

**Status: ✅ Complete** — commit `384b35f`. T1 prerequisite re-verified immediately before this task (readlink empty, SKILL.md real). `ls skills/` == `mcp-bench` exactly; build gate 41/0 with source dirs absent — this gate run is what caught and drove the fix in the T11 SPEC_DEVIATION above (commit `e1cd825`, committed just before this one).

---

### T14: Remove the `pipeline-guide` block from `AGENTS.md`

**What**: Delete the hand-maintained `<!-- pipeline-guide-start -->` … `<!-- pipeline-guide-end -->` block including both markers, leaving the generated block byte-identical.
**Where**: `AGENTS.md:321-359`
**Depends on**: T13
**Reuses**: Nothing — hand edit. No generator exists for this block (verified: no `.ts`/`.sh` producer)
**Requirement**: DEPR-15 (P2-1 AC 1, 2)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] Lines `321-359` are deleted **including both markers** — the block is wholly about the four deprecated skills and would otherwise describe nothing installable (CONTEXT.md)
- [X] `rg -c 'pipeline-guide' AGENTS.md` returns 0
- [X] The generated `<!-- ia-framework:rag-start -->` … `<!-- ia-framework:rag-end -->` block at `:9-319` is **byte-identical** — verify with `git diff AGENTS.md` showing changes only at/after line 320. It is regenerated by `packages/cli/src/commands/agents.command.ts:366-387`, so any hand edit there is silently overwritten (P2-1 AC 2). **Note:** the generated block **precedes** the pipeline-guide block; spec P2-1 AC 2 calls it "adjacent … follows" — CONTEXT.md's correction is right, and only the edit's location changes, not the requirement
- [X] `AGENTS.md:5` (`specs/018-tlc-spec-driven-commands/plan.md`) is **left alone** — it is a `specs/` path, which P2-1 AC 4 exempts, and it sits inside the SPECKIT block, not the pipeline-guide block
- [X] `packages/cli/src/commands/agents.command.ts` is **not** modified
- [X] Gate check passes (build): `bash -n scripts/install-skills.sh && bash -n scripts/uninstall.sh && bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh`
- [X] Test count: **41** pass, 0 fail

**Tests**: none (Repository content layer — matrix says none; build gate + the `git diff` assertion above)
**Gate**: build

**Commit**: `docs(agents): drop the pipeline guide for deprecated skills`

**Status: ✅ Complete** — commit `44ef986`. `rg -c 'pipeline-guide' AGENTS.md` → 0; generated block md5-verified byte-identical; `AGENTS.md:5` untouched; build gate 41/0.

---

### T15: Remove the `jira-feed` reference from `README.md` and sweep remaining references

**What**: Delete the `jira-feed` sentence at `README.md:733` and verify no file outside `.specs/`, `specs/` and `.git/` presents a deleted skill's `skills/<name>/` path as existing.
**Where**: `README.md:733`
**Depends on**: T14
**Reuses**: Nothing — hand edit
**Requirement**: DEPR-15 (P2-1 AC 3, 4)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] `README.md:733` (`> This replaces the previous standalone Jira MCP. The \`jira-feed\` skill now depends on the \`atlassian\` MCP.`) has its `jira-feed` mention **deleted**, not softened into a deprecation note (CONTEXT.md)
- [X] The surrounding "replaces the previous standalone Jira MCP" meaning is preserved or the whole blockquote removed — the `atlassian` MCP itself is Out of Scope and must stay documented
- [X] `rg -c 'jira-feed' README.md` returns 0
- [X] Reference sweep run: `rg -n --hidden -g '!.git/**' -g '!node_modules/**' -g '!.specs/**' -g '!specs/**' -g '!*.html' -g '!.turbo/**' 'grill-with-docs|jira-feed|refuter|tlc-spec-driven' .` returns **only** these intentional mentions (P2-1 AC 4 / its Independent Test):
  - `scripts/install-skills.sh:26-47` — `LEGACY_SKILL_RENAMES` + `_legacy_assets_for` `tab-*` entries (disjoint basenames, A-03 verified)
  - `scripts/install-skills.sh` — the new `DEPRECATED_SKILLS` / `_deprecated_assets_for` registry (required by DEPR-03)
  - `scripts/install-speckit.sh:7` — retired-script comment
  - `scripts/install-gh.sh:5` — comment naming the `/delivery` command
  - `scripts/install-opencode.sh:278,409` — worktree path comments (the directory layout is real and outlives the skill)
  - `.gitignore:54-56` — `.refuter/` and `.jira-feed/` runtime-artifact patterns
  - `scripts/tests/migrate-legacy-skills.test.sh` — self-contained `refuter` fixture built inside its own sandbox, no repo path
  - (also present, same class as the above: `scripts/tests/remove-deprecated-skills.test.sh` and `scripts/tests/uninstall-deprecated-skills.test.sh` — the two new test files added by this batch, using `refuter`/`jira-feed` as self-contained sandbox fixture names, no repo path)
- [X] **No** hit resolves a `skills/<deleted-name>/` path as an existing file
- [X] Gate check passes (build): `bash -n scripts/install-skills.sh && bash -n scripts/uninstall.sh && bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh`
- [X] Test count: **41** pass, 0 fail

**Tests**: none (Repository content layer — matrix says none; build gate + the grep sweep above)
**Gate**: build

**Commit**: `docs(readme): drop the deprecated jira-feed skill reference`

**Status: ✅ Complete** — commit `04762ed`. `rg -c 'jira-feed' README.md` → 0; sweep confirms no hit resolves an existing `skills/<deleted-name>/` path; build gate 41/0.

---

### T16: Record AD-006 and AD-007 in `.specs/STATE.md`

**What**: Append the two project-level decisions that constrain every future skill and deprecation.
**Where**: `.specs/STATE.md` — `## Decisions` section, after `AD-005`
**Depends on**: T15
**Reuses**: The `AD-001`…`AD-005` entry format verbatim (Status / Decided / Decision / Rationale / Consequence)
**Requirement**: DEPR-01, DEPR-03 (project-level constraints derived from them)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [X] **AD-006 — Distributable skills are governed by a closed allowlist.** A directory in `skills/` is not distributed unless its `skill.json` `.name` appears in `OFFICIAL_SKILLS`. Adding a skill is a deliberate two-place edit.
- [X] **AD-007 — Removing a shipped asset requires a permanent hardcoded manifest entry.** Cleanup must never glob the source tree for assets whose source is being deleted, and unattended (`is_noninteractive`) runs must never delete a `copied`/real directory.
- [X] Both entries carry `Status: active`, `Decided: 2026-08-21 (DEV-306771, Tasks)`, plus Rationale and Consequence, matching the `AD-001`…`AD-005` shape
- [X] Entries are **appended**; no existing `AD-` entry is edited (the file is append-only — supersede rather than edit)
- [X] Gate check passes (build): `bash -n scripts/install-skills.sh && bash -n scripts/uninstall.sh && bash scripts/tests/remove-deprecated-skills.test.sh && bash scripts/tests/uninstall-deprecated-skills.test.sh && bash scripts/tests/install-skills-state.test.sh && bash scripts/tests/migrate-legacy-skills.test.sh`
- [X] Test count: **41** pass, 0 fail

**Tests**: none (Repository content layer — matrix says none; build gate only)
**Gate**: build

**Commit**: `docs(specs): record AD-006 skill allowlist and AD-007 deprecation manifest`

**Status: ✅ Complete** — commit `9b3d48a`. AD-006/AD-007 appended after AD-005; `git diff` confirms append-only (no existing AD- entry touched); build gate 41/0.

---

## Phase Execution Map

Phases run in sequence, and tasks within a phase run in order:

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 0:  T1
Phase 1:  T2 ──→ T3
Phase 2:  T4 ──→ T5
Phase 3:  T6 ──→ T7
Phase 4:  T8 ──→ T9 ──→ T10 ──→ T11
Phase 5:  T12 ──→ T13 ──→ T14 ──→ T15
Phase 6:  T16

Full chain: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14 → T15 → T16
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch
worker) works one task at a time, in order.

**Why the chain is fully linear.** Two hard constraints collapse what looks like a parallelizable
tree into one line:

1. **A shared test file.** T2 creates `scripts/tests/remove-deprecated-skills.test.sh` and T3–T9
   each append to it, with a cumulative expected test count in every `Done when`. Concurrent edits
   would corrupt the counts.
2. **A shared source file.** T2–T9 all edit `scripts/install-skills.sh`, and T10–T11 both edit
   `scripts/uninstall.sh`.

**Suggested batch packing for Execute** (~7 tasks per worker, whole phases, cut only on a phase
boundary):

| Batch | Phases | Tasks | Count |
| ----- | ------ | ----- | ----- |
| 1 | 0, 1, 2 | T1–T5 | 5 |
| 2 | 3, 4 | T6–T11 | 6 |
| 3 | 5, 6 | T12–T16 | 5 |

16 tasks → 3 batches, so the sub-agent offer applies at Execute (> ~8 tasks). Batches run
sequentially; each reports a compact summary before the next starts. After T16 the **Verifier runs
automatically** — it is never prompted.

**The orchestrating agent's role during Execute:**
1. Count total tasks and pack phases into ~7-task batches — offer batch sub-agents if that yields more than one batch and the user accepts
2. Dispatch the next batch (to a worker, or execute inline)
3. Receive the compact batch summary
4. Update tasks.md with results
5. If the batch summary shows all tasks complete: proceed to the next batch
6. If a task failed: decide fix/escalate before dispatching the next batch

---

## Pre-Approval Validation

All three checks were run before presenting. All pass.

### Check 1: Task Granularity

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Materialize `tlc-spec-driven` locally | 1 local operation, 0 repo files | ✅ Granular |
| T2: `OFFICIAL_SKILLS` + `scan_skills` filter | 1 array + 1 guard, same file | ✅ Granular (cohesive — the array exists only for the guard) |
| T3: `DEPRECATED_SKILLS` + `_deprecated_assets_for` | 1 array + 1 pure function, same file | ✅ Granular (cohesive — same pairing) |
| T4: `_registry_has_deprecated_entry` | 1 function | ✅ Granular |
| T5: `_deprecated_trace_in` | 1 function | ✅ Granular |
| T6: `_remove_deprecated_from` | 1 function | ✅ Granular |
| T7: `_prompt_deprecated_removal` | 1 function | ✅ Granular |
| T8: `remove_deprecated_skills` | 1 function | ✅ Granular |
| T9: `setup_skills` wiring | 1 call site | ✅ Granular |
| T10: strip 25 `local` in `uninstall.sh` | 1 file, 1 mechanical transform | ✅ Granular |
| T11: `uninstall.sh` wiring | 1 call site | ✅ Granular |
| T12: delete 2 JS test files | 2 deletions, 1 concern (orphaned by DEPR-02) | ✅ Granular (cohesive) |
| T13: delete 4 skill directories | 4 deletions, 1 atomic requirement (DEPR-02) | ✅ Granular (cohesive — one revertable commit; splitting would leave `skills/` in a state no AC describes) |
| T14: `AGENTS.md` block removal | 1 file | ✅ Granular |
| T15: `README.md` + sweep | 1 file + verification | ✅ Granular |
| T16: `STATE.md` decisions | 1 file | ✅ Granular |

No task exceeds one file plus its co-located tests, except T12/T13 where the multi-path deletion **is**
the single requirement.

### Check 2: Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (phase 0 entry, no inbound arrow) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |

Every `Depends on` has a matching arrow and every arrow has a matching `Depends on`. No task depends
on a later phase — all dependencies point strictly backward.

### Check 3: Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Local machine operation | none | none | ✅ OK |
| T2 | Shell library — pure | unit | unit | ✅ OK |
| T3 | Shell library — pure | unit | unit | ✅ OK |
| T4 | Shell library — read-only query | unit | unit | ✅ OK |
| T5 | Shell library — read-only query | unit | unit | ✅ OK |
| T6 | Shell library — mutator | unit | unit | ✅ OK |
| T7 | Shell library — prompt | unit | unit | ✅ OK |
| T8 | Shell library — orchestrator | integration | integration | ✅ OK |
| T9 | Shell entrypoint / wiring | integration | integration | ✅ OK |
| T10 | Shell entrypoint / wiring | integration | integration | ✅ OK |
| T11 | Shell entrypoint / wiring | integration | integration | ✅ OK |
| T12 | Repository content | none | none | ✅ OK |
| T13 | Repository content | none | none | ✅ OK |
| T14 | Repository content | none | none | ✅ OK |
| T15 | Repository content | none | none | ✅ OK |
| T16 | Repository content | none | none | ✅ OK |

**No test deferral.** Every task that creates testable shell code writes its tests in the same task,
with a cumulative expected count. No task carries `Tests: none` on the grounds that a later task
tests it.

**Compilation-dependency resolution applied at T2.** `scan_skills`'s allowlist tests need the shared
harness, which did not exist. Rather than deferring them to a later "add tests" task, T2 **merges
backward**: it creates the harness itself. T3–T11 then extend an existing file.

**No task produces unverified code.** T12–T16 change repository content only (deletions and prose);
their verification is the build gate plus explicit `git diff` / `rg` assertions in `Done when`. T13's
build gate is load-bearing: passing it with the four source directories absent **is** the evidence
that the manifest is history-based (P1-4 AC 4).

---

## Requirement Traceability

| Requirement | Task(s) | Verified by |
| ----------- | ------- | ----------- |
| DEPR-01 | T2, T16 | 3 allowlist tests + `scan_skills` sandbox assertion in T13 |
| DEPR-02 | T13 | `ls skills/` == `mcp-bench`; build gate green with sources absent |
| DEPR-03 | T3, T16 | manifest shape tests |
| DEPR-04 | T3 | per-skill asset-count tests (0 / 4 / 11 / 14) |
| DEPR-05 | T8 | always-return-0 tests incl. corrupt registry |
| DEPR-06 | T4, T5, T8 | `TRACE_STATE` lattice tests; `SELECTED_IDES`-unset test |
| DEPR-07 | T7 | one-prompt + stream-discipline tests |
| DEPR-08 | T6 | removal-order + `json_remove_hooks`-before-`rm` tests |
| DEPR-09 | T6 | `.md` + `.toml` twin test |
| DEPR-10 | T6 | orphan-purge-with-no-link test |
| DEPR-11 | T7 | non-interactive `linked` → remove; `copied` → keep |
| DEPR-12 | T9 | no-IDE-selected path reaches the call |
| DEPR-13 | T10 (enabler), T11 | `--dry-run` exits 0; sandboxed `--yes` removes seeded assets |
| DEPR-14 | T7 | decline warns both causes; no file written under `$HOME` |
| DEPR-15 | T14, T15 | `git diff` scoped to ≥ line 320; `rg` sweep |
| DEPR-16 | T1 | `readlink` empty + `SKILL.md` present; `mcp-bench` still linked |
| DEPR-17 | T12 | both files absent; `ls scripts/tests/*.test.js` empty |
| DEPR-N01 | T4, T6, T7, T8 | malformed-registry, missing-file, empty-`IDE_*_DIR`, corrupt-`settings.json` tests |
| DEPR-N02 | T8 | second-run-prints-nothing test |
| DEPR-N03 | T6 | braced form present (style per D-3; **no** behaviour claim at `:461,:473`) |
| DEPR-N04 | T6 | writes confined to one function; closed-manifest `case` literal |
| DEPR-N05 | T2 (harness), T3–T11 | 41 tests across two standalone files |
| DEPR-N06 | T8 | one-line-per-changed-pair test with counts + basenames |

**Coverage: 23/23 requirements mapped to tasks.** 0 unmapped.

**Spec ACs deliberately reinterpreted** (approved at Tasks, carried from design):

| Spec AC | Literal text | Implemented as | Why |
| ------- | ------------ | -------------- | --- |
| P1-4 AC 7 | registry entries "byte-identical" | **entry-preserving** — parsed `{event,matcher,command}` triples | `json_remove_hooks:500` re-stringifies unconditionally (verified). Detection is read-only so no-trace IDEs are genuinely untouched (D-2) |
| P1-3 AC 8 | `copied` empty-line default is **keep** | **remove**, uniformly | CONTEXT.md overrides; protection moves to prompt wording + the CI skip (A-01/A-08) |
| P1-4 AC 9 | braced form fixes a "precedence bug" | braced form as **style** | `A \|\| B && C` already parses as `(A\|\|B) && C` (verified). No defect exists at `:461,:473` (D-3) |
| P2-1 AC 2 | generated block "follows" the hand block | generated block **precedes** it (`:9-319` vs `:321-359`) | Verified; changes only the edit location, not the requirement |
| P3 AC 1, 2 | all **four** skills materialized locally | only **`tlc-spec-driven`** + its 5 `tlc-*` commands | CONTEXT.md narrows it; the other three are removed by the shipped path, making this machine a live test |

---

## Notes

- **Tools per task — confirmed 2026-08-21: `MCP: NONE`, `Skill: NONE` on all 16 tasks.** This is a
  deliberate decision, not an omission. The work is pure bash 3.2 plus `node` one-liners with no
  third-party library API in play, so `context7` has nothing to resolve; the design already pinned
  every file, function and line number, so `ia-framework` RAG would re-derive what is already
  written down; `atlassian` is irrelevant post-spec. The `tlc-spec-driven` skill itself is of course
  active throughout (see Execution Protocol above) — that is the flow, not a per-task tool.
- **Every task names concrete paths and line numbers**, all verified against the live tree on
  2026-08-21 (`install-skills.sh` is 862 lines; `setup_skills` starts at `:738`; the insertion window
  is `:752`–`:754`; `migrate_legacy_skills` is `:56-129`; `_legacy_assets_for` ends at `:48`).
- **`shellcheck` is not installed** — no gate may depend on it. `bash -n` is the syntax gate.
- **bash 3.2**: no `declare -A`; count-guard before iterating any array, or iterate a string.
- **T1 has no commit** by design (zero repo diff). Every other task is exactly one atomic commit.
