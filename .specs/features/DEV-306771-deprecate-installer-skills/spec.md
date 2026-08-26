# DEV-306771 — Deprecate four skills and auto-remove them from every detected IDE

**Ticket**: [DEV-306771](https://trustly.atlassian.net/browse/DEV-306771) (Story, epic DEV-306553 "AI Frameworks")
**Scope**: Large — multi-component (installer, uninstaller, tests, docs), 16 stated requirements, deliberate architectural departure from the file's dominant iteration pattern.

> **Ticket summary is stale.** The JIRA summary reads "install mcps and link official skills"; the description describes deprecation. This spec follows the description. MCP configuration (`install.sh` Step 5.1 / `configure_mcps`) is out of scope and must remain untouched.

---

## Problem Statement

`install.sh` Step 5.2 distributes five skills, enumerated by globbing `skills/*/skill.json` (`scripts/install-skills.sh:135-157`). The team has decided only `mcp-bench` ships going forward. Deleting the other four directories alone is not merely incomplete — it is actively harmful: every developer who already installed them keeps a stale skill-directory symlink, stale per-file `agents/`/`commands/`/`hooks/` links, and (on Claude Code and Codex) live hook registrations whose `command` paths point into a source tree that no longer exists.

The existing cleanup path cannot fix this. `unlink_skill()` discovers assets by globbing the **live source tree** — each block is guarded by `[ -d "${skill_dir}/agents" ]`, `[ -d "${skill_dir}/commands" ]`, `[ -d "${skill_dir}/hooks" ]` (`scripts/install-skills.sh:454, :466, :478`). Once the source directory is gone, every guard is false, so it degrades to removing only the skill-directory symlink and can no longer deregister a single hook. Compounding this, all cleanup today iterates `SELECTED_IDES`, so a skill installed in an IDE the developer does not select for a given run is never even inspected.

## Goals

- [ ] Only `mcp-bench` is ever presented as an installable skill, and a future directory dropped into `skills/` is not silently distributed.
- [ ] Every trace of the four deprecated skills is removable from **every detected IDE**, using a manifest that does not depend on the deleted source tree.
- [ ] Hook registries (`~/.claude/settings.json`, `~/.codex/hooks.json`) contain zero entries referencing a deprecated skill after removal — including entries whose link file was already deleted.
- [ ] `./install.sh` and `./scripts/uninstall.sh` both reach a clean machine state, and doing so never aborts the run.
- [ ] Repository documentation and the repo's own test suite no longer reference a removed skill as active.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| MCP configuration (`install.sh:205-216`, `configure_mcps`) | The stale ticket summary implies it; the description does not. Untouched. |
| Refactoring `migrate_legacy_skills` and the new routine into a shared `_purge_skill_assets()` | The guard at `install-skills.sh:57` was already fixed once in production (commit `70cb8b8`, "bad substitution in migrate_legacy_skills guard"). Duplication now; refactor is a logged follow-up. |
| Collapsing the `tab-*` entries of `LEGACY_SKILL_RENAMES` into the new deprecated registry | The two registries operate on disjoint basenames (`tab-refuter-*` vs `refuter-*`) and compose without conflict. See A-03. |
| Persisting a "developer declined" flag across runs | FR-14 mandates re-prompting; no state file is introduced. |
| Removing `unlink_skill()`'s glob-based implementation | Still correct for `mcp-bench`, whose source directory exists. Left as-is. |
| Adding CI (`.github/` does not exist) | Out of scope; test invocation stays manual. See A-05. |
| Deleting `skills/*/` content for `mcp-bench`, or altering `fetch-skill.sh` behaviour beyond what FR-01 implies | Not requested. |
| Migrating the developer's four local materialized copies onto a supported footing long-term | AC-16/A-02 resolves only the immediate breakage. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| **A-01** `copied` state (developer re-created a deprecated skill as a real directory) | Treat as needs-removal **but require explicit confirmation naming it as a real directory, not a link**, and never auto-remove a `copied` directory under `is_noninteractive()` — skip it with a warning instead | The ticket says treat `copied` as needs-removal, which would `rm -rf` unversioned local work. Silent destruction of a real directory in CI is unrecoverable; a link is not. This preserves the ticket's intent for the interactive path while making the non-interactive path non-destructive. Diverges from `migrate_legacy_skills`, which is unconditional — justified because that routine only ever removed *renamed* assets no developer would have authored. | n — **needs user confirmation** |
| **A-02** FR-16 local materialization: copies land in `~/.config/opencode/` and will be flagged by this very feature on the next run | Materialize under the **same names**; A-01's `copied` handling means the developer is prompted and can decline. Do **not** rename to `-local` | Renaming breaks `/tlc-specify` and the other slash commands, which resolve the skill by name. Re-declining is a known, bounded annoyance; a broken command surface is not. | n — **needs user confirmation** |
| **A-03** `LEGACY_SKILL_RENAMES` maps `tab-refuter=refuter` and `tab-ticket-reader=jira-feed`, both now deprecated | Keep both registries independently | Verified: `_legacy_assets_for()` returns only `tab-`-prefixed basenames; the new manifest returns only un-prefixed ones. Zero overlap, so both can run in sequence. | y (verified in code) |
| **A-04** External consumers of `skills/refuter/` or `skills/tlc-spec-driven/` paths | None outside this repo | `scripts/fetch-skill.sh` reads only the local tree (`:34`, `:58` glob `${SCRIPT_DIR}/skills/*/skill.json`). **However** two in-repo consumers DO exist — see FR-17. | y (verified; corrected) |
| **A-05** No CI exists; should a `test:shell` runner be added? | No runner. Manual `bash scripts/tests/<name>.test.sh`, matching current practice | `package.json` `test` is `turbo run test`; the existing `scripts/tests/*.test.sh` are already manual-only. Adding a runner is a separate concern. | n — **low risk, defaulted** |
| **A-06** Should `remove_deprecated_skills()` prompt when the *only* trace is an orphaned hook-registry entry (no files at all)? | Yes — count a registry-only trace as "present" and include that IDE in the prompt | Otherwise AC-11 is unreachable via the normal flow: with no link and no directory, nothing would mark the IDE affected and `json_remove_hooks` would never be called. Makes the orphan-purge requirement actually testable. | n — **derived, needs confirmation** |
| **A-07** Removal granularity of the confirmation prompt | One prompt per **skill**, covering all affected IDEs at once (all-or-nothing per skill). No per-IDE opt-out | FR-07 states this explicitly and it matches `prompt_skill_action`'s one-prompt-per-skill contract. | y (from ticket) |
| **A-08** Default answer when the developer presses Enter at the removal prompt | Default **yes** (remove) | Consistent with the file's other destructive-but-corrective defaults (`broken` → default `re-link`, `copied` → default `upgrade-to-link`); the whole point of the feature is to reach a clean machine. Exception: `copied` state defaults to **no** per A-01. | n — **defaulted** |
| **A-09** Where the four repo `skills/*/` directories' `SKILL.md`/`references/` content goes | Deleted with the directory; no archival copy in-repo | FR-01 says delete. Git history retains everything. | y (from ticket) |
| **A-10** `vscode-copilot` has `IDE_SKILLS_DIR=""` but a real `IDE_AGENTS_DIR` (`~/.github/agents`) | Detection must treat manifest-asset presence as a trace even when `IDE_SKILLS_DIR` is empty | Verified in `scripts/ide-descriptors/vscode-copilot.sh:13-14`. Skill-dir-only detection would miss `jira-feed-formatter.md` / the three `refuter-*` agents there. | y (verified in code) |

**Open questions:** A-01, A-02, A-06 (and, lower-risk, A-05/A-08) are recorded above with a chosen default and rationale, but each changes observable behaviour and should be confirmed before design. They are the reason `/tlc-discuss` is the recommended next step.

### Seed corrections (verified against the live tree)

These deviate from the input seed. Each was checked, not assumed.

| Seed claim | Verified reality | Consequence |
| ---------- | ---------------- | ----------- |
| `AGENTS.md:321-359` block is hand-maintained | **Correct** — no generator exists (`grep -rn 'pipeline-guide'` finds no `.ts`/`.sh` producer; corroborated by `.specs/.../tasks.md:2356`). The *adjacent* `ia-framework:rag` block **is** generated by `packages/cli/src/commands/agents.command.ts:366-387` | FR-15 edits `AGENTS.md` by hand and must not disturb the marker-delimited generated block that follows it. |
| Only `AGENTS.md` + `README.md:733` reference the skills | **Incomplete.** `scripts/tests/refuter-drift-detector.test.js:17` and `scripts/tests/refuter-orchestration-complete.test.js:24` resolve `../../skills/refuter/hooks/*.js`. FR-01 breaks both. | New **FR-17**. Without it the repo ships two permanently-failing test files. |
| `install-skills.sh:461,473` use an unbraced `[ A ] \|\| [ B ] && rm` idiom | **Correct** — present at `:461` (`target_md`) and `:473` (command link). The braced form is at `:98`, `:104`. | NFR-03 stands as written. |
| FR-04 manifest is the union of all assets ever shipped | **Correct and exactly reproduced.** `git log --all --diff-filter=A` over each skill's `agents/`,`commands/`,`hooks/` yields precisely the seed's 4 / 11 / 14 / 0 lists. Current tree is *smaller*: `tlc-spec-driven` has 7 commands and **0 agents** today vs 13 commands + 1 agent historically; `commands/tlc-quick.md`, `tlc-map-codebase.md`, `tlc-project-init.md`, `tlc-roadmap.md`, `tlc-session.md`, `tlc-state.md` and `agents/tlc-specify-runner.md` exist only in history. | Confirms the manifest must be history-based (AC-09). |
| `setup_skills()` insertion point ~`:764` | **Correct**, but `migrate_legacy_skills` at `:764` sits *after* the `prompt_ide_select` early-return at `:757-760`. Inserting the new call at the same place would make it unreachable when the developer selects no IDE. | FR-12 must place the call **between `:752` and `:754`** — after the `DETECTED_IDES` empty check, before `prompt_ide_select`. |
| Live pre-state: 4 skill-dir symlinks, 4 agents, 8 commands, 9 hooks | **Confirmed exactly**: `~/.config/opencode/skills/{grill-with-docs,jira-feed,refuter,tlc-spec-driven}` are symlinks into this repo; `agents/` holds 4; `command/` holds 8 deprecated (+3 `mcp-bench`); `hooks/` holds 9. `mcp-bench` is also symlinked and must survive. | FR-16 confirmed necessary and correctly scoped. |

---

## User Stories

### P1: Only sanctioned skills are offered ⭐ MVP

**User Story**: As a developer running `./install.sh`, I want the installer to offer only the skills the team actually supports, so that I do not install or keep unsupported tooling.

**Why P1**: This is the ticket's headline outcome. Without it the four skills keep spreading.

**Acceptance Criteria**:

1. WHEN `scan_skills()` runs THEN the system SHALL populate `AVAILABLE_SKILLS` with only names present in an explicit official-skill allowlist whose sole current member is `mcp-bench`.
2. WHEN a `skills/<dir>/skill.json` exists whose `.name` is not in the allowlist THEN the system SHALL exclude it from `AVAILABLE_SKILLS` and SHALL NOT error.
3. WHEN resolving an allowlisted skill's name THEN the system SHALL read it from `skill.json`'s `.name` field, not from the directory name.
4. WHEN the repository is checked out after this change THEN `skills/` SHALL contain exactly one entry, `mcp-bench/`, and `skills/grill-with-docs/`, `skills/jira-feed/`, `skills/refuter/` and `skills/tlc-spec-driven/` SHALL NOT exist.
5. WHEN a developer with no previously installed skills runs Step 5.2 THEN `mcp-bench` SHALL be the only selectable skill AND no removal prompt SHALL appear.

**Independent Test**: `bash -c 'source scripts/install-skills.sh; SCRIPT_DIR=$PWD scan_skills; printf "%s\n" "${AVAILABLE_SKILLS[@]}"'` prints exactly `mcp-bench`, including after a throwaway `skills/unsanctioned/skill.json` is added.

---

### P1: Deprecated skills are removed from every detected IDE ⭐ MVP

**User Story**: As a developer whose machine already has the four deprecated skills linked, I want the installer to find and remove every trace of them from all my IDEs — not just the ones I selected this run — so that my machine reaches a genuinely clean state.

**Why P1**: This is the harm-prevention half of the ticket. Deleting the directories without it leaves broken links and live hooks firing at missing files.

**Acceptance Criteria**:

1. WHEN `remove_deprecated_skills()` needs a deprecated skill's asset list THEN it SHALL obtain it from a hardcoded registry via a `_deprecated_assets_for NAME` function that writes a single space-separated line of `agents/`-, `commands/`- or `hooks/`-prefixed relative paths to stdout, and SHALL write an empty string for an unknown name.
2. WHEN `_deprecated_assets_for` is called THEN the returned manifest SHALL be exactly the union of every asset basename ever shipped by that skill (per `git log --all --diff-filter=A`), specifically: `grill-with-docs` → empty; `jira-feed` → 1 agent, 1 command, 2 hooks; `refuter` → 3 agents, 1 command, 7 hooks; `tlc-spec-driven` → 1 agent (`agents/tlc-specify-runner.md`), 13 commands.
3. WHEN detecting which IDEs hold a trace of a deprecated skill THEN the system SHALL iterate every entry of `DETECTED_IDES` and SHALL NOT consult `SELECTED_IDES`.
4. WHEN determining the skill-directory state for an IDE THEN the system SHALL use `detect_link_state` and SHALL treat `linked`, `broken` and `copied` as a trace and `absent` as no trace.
5. WHEN an IDE has an empty `IDE_SKILLS_DIR` (e.g. `vscode-copilot`) THEN the system SHALL still count the presence of any manifest asset in that IDE's `IDE_AGENTS_DIR`/`IDE_COMMANDS_DIR`/`IDE_HOOKS_DIR` as a trace.
6. WHEN removal is confirmed for a skill THEN for **every** detected IDE holding a trace the system SHALL remove the skill-directory symlink (via `rm -rf`, applied when the path satisfies `-L` or `-e`), remove each manifest asset, and deregister each manifest hook.
7. WHEN removing a manifest hook THEN the system SHALL call `json_remove_hooks "$ide_id" "${IDE_HOOKS_DIR}/<basename>"` **before** `rm -f`, passing that exact absolute path, because `json_remove_hooks` matches on exact string equality of `h.command`.
8. WHEN removing a manifest agent THEN the system SHALL remove both `<basename>.md` and the transformed `<basename>.toml` twin, because `IDE_AGENT_FORMAT=toml` (codex) installs a transformed copy rather than a symlink.
9. WHEN a manifest hook's link file is already absent but its registry entry may remain THEN the system SHALL still call `json_remove_hooks` for that path, purging the orphaned entry.
10. WHEN `remove_deprecated_skills()` returns THEN its exit status SHALL be 0 on every code path.

**Independent Test**: In an isolated sandbox (`HOME` and `SCRIPT_DIR` redirected), seed `jira-feed` links + a `~/.claude/settings.json` hook entry for two IDEs, run `remove_deprecated_skills` with `NON_INTERACTIVE=1`, then assert every seeded path is gone and `grep -c 'jira-feed' settings.json` is 0.

---

### P1: The removal decision is the developer's, asked once per skill ⭐ MVP

**User Story**: As a developer, I want one clear prompt per deprecated skill that names every IDE it will touch, so that I understand and consent to changes the installer makes in IDEs I did not select for this run.

**Why P1**: FR-06 deliberately reaches outside `SELECTED_IDES` — every other flow in the file does not. Informed consent is what makes that departure acceptable rather than surprising.

**Acceptance Criteria**:

1. WHEN one or more detected IDEs hold a trace of a deprecated skill THEN the system SHALL prompt exactly once for that skill, regardless of how many IDEs are affected.
2. WHEN prompting THEN the system SHALL list the `IDE_NAME` display name of every affected IDE, SHALL write all prose to stderr, and SHALL write only the resulting decision token to stdout.
3. WHEN the developer confirms THEN the system SHALL remove the skill from all listed IDEs.
4. WHEN the developer declines THEN the system SHALL leave every asset of that skill in place, SHALL print a warning stating it will be flagged again on the next run, and SHALL NOT persist any "declined" state to disk.
5. WHEN the developer declines and `./install.sh` is run again THEN the identical prompt SHALL reappear.
6. WHEN `is_noninteractive()` is true (no TTY, or `CI` or `NON_INTERACTIVE` set) THEN the system SHALL skip the prompt and remove the skill from every detected IDE holding a trace — except a skill whose state is `copied`, which SHALL be skipped with a warning (A-01).
7. WHEN no detected IDE holds a trace of any deprecated skill THEN no removal prompt SHALL be shown and no removal output SHALL be printed.
8. WHEN the developer answers a `linked`- or `broken`-state removal prompt with an empty line THEN the system SHALL default to removing; WHEN the state is `copied` THEN the empty-line default SHALL be to keep (A-01, A-08).

**Independent Test**: With two IDEs seeded and a scripted `printf 'n\n'` on stdin, assert exactly one prompt is emitted on stderr, it names both IDE display names, stdout carries only the decision token, and all assets survive.

---

### P1: Both installer and uninstaller reach a clean state, and neither can abort the run ⭐ MVP

**User Story**: As a developer, I want removal wired into both `install.sh` and `./scripts/uninstall.sh`, and I want a broken symlink or unreadable registry to never take down my install, so that cleanup is reliable rather than another failure mode.

**Why P1**: Wiring is what makes the routine reachable; soft-failure is what makes it safe to reach. `uninstall.sh:195` uses the same doomed glob, so without this it silently leaves everything behind.

**Acceptance Criteria**:

1. WHEN `setup_skills()` runs THEN it SHALL call `remove_deprecated_skills` after the `DETECTED_IDES`-empty early return and **before** `prompt_ide_select`, so the call is reached even when the developer selects no IDE.
2. WHEN `remove_deprecated_skills` executes THEN it SHALL NOT read or depend on `SELECTED_IDES` being set or non-empty.
3. WHEN `scripts/uninstall.sh` runs THEN it SHALL call `remove_deprecated_skills` alongside its existing `migrate_legacy_skills || true`, such that deprecated assets are removed rather than skipped by the `skills/*/skill.json` glob at `:195`.
4. WHEN a deprecated skill's source directory is absent from the repo AND an IDE still holds its links THEN the system SHALL detect and remove those links from the hardcoded manifest, SHALL NOT glob the missing directory, and SHALL NOT emit an error.
5. WHEN a skill-directory symlink is broken, a source directory is missing, a hook registry is unreadable or malformed, or an IDE's `IDE_SKILLS_DIR` is empty THEN the run SHALL continue and the enclosing function SHALL return 0.
6. WHEN `./install.sh` is run a second time immediately after a successful removal THEN no trace SHALL be found, no prompt SHALL be shown, and no removal output SHALL be printed.
7. WHEN removal runs THEN it SHALL write only to paths under the seven known IDE directories, SHALL modify only manifest-listed assets, and SHALL leave every hook-registry entry not matching a manifest hook path byte-identical.
8. WHEN a (skill, IDE) pair results in at least one removed link or deregistered hook THEN the system SHALL print exactly one summary line for that pair; WHEN nothing changed for that pair THEN it SHALL print nothing.
9. WHEN implemented THEN all new shell code SHALL run under bash 3.2 with `set -euo pipefail`, and SHALL use the braced `{ [ A ] || [ B ]; } && rm …` form rather than the unbraced precedence-bug idiom at `install-skills.sh:461,473`.

**Independent Test**: Sandbox run of `setup_skills` with `NON_INTERACTIVE=1` and a deliberately corrupt `~/.claude/settings.json` — assert exit status 0, seeded links removed, and an unrelated pre-existing hook entry still present verbatim.

---

### P2: Repository references stop presenting removed skills as active

**User Story**: As a developer reading this repo, I want its documentation and its own test suite to reflect that these four skills are gone, so that I am not pointed at tooling that does not exist and the suite is not permanently red.

**Why P2**: Not required for the removal mechanism to work, but the change is incomplete and misleading without it. FR-17 in particular is a correctness issue the ticket missed.

**Acceptance Criteria**:

1. WHEN `AGENTS.md` is read after the change THEN the hand-maintained `<!-- pipeline-guide-start -->`…`<!-- pipeline-guide-end -->` block SHALL NOT present `grill-with-docs`, `jira-feed`, `refuter` or `tlc-spec-driven` as installable or active pipeline steps.
2. WHEN `AGENTS.md` is edited THEN the adjacent generated `<!-- ia-framework:rag-start -->`…`<!-- ia-framework:rag-end -->` block SHALL remain byte-identical, since it is regenerated by `packages/cli/src/commands/agents.command.ts` and hand edits would be overwritten.
3. WHEN `README.md` is read after the change THEN its `jira-feed` reference at `:733` SHALL no longer describe `jira-feed` as a current skill.
4. WHEN the repository is checked out after the change THEN no file outside `.specs/`, `specs/` and `.git/` SHALL reference a deleted skill's `skills/<name>/` path as an existing file.
5. **FR-17** — WHEN `scripts/tests/refuter-drift-detector.test.js` and `scripts/tests/refuter-orchestration-complete.test.js` are considered THEN they SHALL be deleted (or otherwise made not to resolve `../../skills/refuter/hooks/*.js`), because FR-01 removes the hook files they execute at `:17` and `:24` respectively.

**Independent Test**: `grep -rn -E 'grill-with-docs|jira-feed|refuter|tlc-spec-driven' --include='*.md' --include='*.sh' --include='*.js' . | grep -v -e '^\./\.specs/' -e '^\./specs/' -e node_modules` returns only intentional historical mentions (`LEGACY_SKILL_RENAMES`' `tab-*` entries, the new deprecated registry, and retired-script comments).

---

### P2: New behaviour is covered by tests following the repo's shell-test conventions

**User Story**: As a maintainer, I want the removal logic covered by shell tests in the established style, so that its many branches (per-IDE, per-asset-kind, toml twin, orphan purge) are verified rather than assumed.

**Why P2**: The mechanism can ship without tests, but ten-plus branches over a destructive `rm` path is exactly where the repo's existing test precedent exists for a reason.

**Acceptance Criteria**:

1. WHEN new tests are added THEN they SHALL follow `scripts/tests/*.test.sh` conventions: `mktemp` sandbox, exported `SCRIPT_DIR`, real IDE descriptors copied into the sandbox, `NON_INTERACTIVE=1`, a shadowed `source_ide_descriptor`, `tN()` test functions, `PASS`/`FAIL` counters, and `set -u` only (not `-e`).
2. WHEN a new test file is invoked as `bash scripts/tests/<name>.test.sh` THEN it SHALL run standalone and exit non-zero if any assertion fails.
3. WHEN the test suite runs THEN it SHALL cover at minimum: allowlist filtering (P1-story-1), the toml-agent twin, the orphaned-registry purge with no link present, an IDE with a trace vs an IDE without, removal driven by the manifest with the source directory absent, the decline path, and idempotency of a second run.

**Independent Test**: `bash scripts/tests/remove-deprecated-skills.test.sh` exits 0 with a `PASS`/`FAIL` summary and leaves the real `$HOME` untouched (verify by checksumming `~/.claude/settings.json` before and after).

---

### P3: Local developer tooling survives the deletion

**User Story**: As the developer executing this very feature, I want my locally linked copies of the four skills materialized before the repo directories are deleted, so that `/tlc-specify`, `/tlc-design`, `/tlc-tasks`, `/tlc-execute` and `jira-feed` keep working while I finish the work.

**Why P3**: A one-off local operation, not shipped behaviour — but it must be **sequenced first** in the task list, or the tooling used to execute this feature disappears mid-flight.

**Acceptance Criteria**:

1. WHEN the four repo directories are deleted THEN `~/.config/opencode/skills/{grill-with-docs,jira-feed,refuter,tlc-spec-driven}` SHALL already be real directories containing the pre-deletion content, not symlinks into this repo.
2. WHEN materialization runs THEN the 4 agent links, 8 deprecated command links and 9 hook links under `~/.config/opencode/{agents,command,hooks}` that currently resolve into this repo SHALL be replaced by real files with the same content, and `mcp-bench`'s links (1 skill dir + 3 commands) SHALL remain untouched symlinks.
3. WHEN materialization completes THEN invoking `/tlc-specify` SHALL still resolve its skill content successfully.

**Independent Test**: After the step, `readlink ~/.config/opencode/skills/tlc-spec-driven` is empty and `test -f ~/.config/opencode/skills/tlc-spec-driven/SKILL.md` succeeds, while `readlink ~/.config/opencode/skills/mcp-bench` still points into the repo.

---

## Edge Cases

- WHEN `DETECTED_IDES` is empty THEN `remove_deprecated_skills` SHALL return 0 without prompting or printing.
- WHEN `source_ide_descriptor` fails for a detected IDE THEN that IDE SHALL be skipped (`|| continue`) and the loop SHALL proceed.
- WHEN a deprecated skill's manifest is empty (`grill-with-docs`) THEN only the skill-directory symlink SHALL be considered, and an IDE with no skill-directory trace SHALL yield no prompt for it.
- WHEN a manifest hook was never registered because `_register_hook_for_ide()` could not infer an event from its filename THEN `json_remove_hooks` SHALL be a harmless no-op.
- WHEN an IDE does not support hooks (`IDE_HOOKS_DIR=""`: cursor, gemini, windsurf, vscode-copilot) THEN hook handling SHALL be skipped for it without error.
- WHEN an IDE does not support commands (`IDE_COMMANDS_DIR=""`: codex, vscode-copilot) THEN command handling SHALL be skipped for it without error.
- WHEN `json_remove_hooks` is called for an IDE other than `claude-code` or `codex` THEN it SHALL return 0 immediately (existing behaviour).
- WHEN a hook-registry file does not exist THEN `json_remove_hooks` SHALL return 0 without creating it.
- WHEN a registry group becomes empty after removal THEN it SHALL be pruned, and unrelated groups SHALL be preserved (existing `json_remove_hooks` behaviour, must not regress).
- WHEN the same basename is shared by a deprecated skill and `mcp-bench` THEN removal SHALL NOT occur — verified: no overlap exists between the manifest and `mcp-bench`'s three `mcp-bench-*.md` commands.
- WHEN a manifest asset path is a real file rather than a symlink (a copy, e.g. a codex `.toml` agent) THEN it SHALL still be removed.
- WHEN `skills/` itself is missing THEN `scan_skills()` SHALL warn and return 0 (existing behaviour, must not regress).
- WHEN the developer's `HOME` contains an IDE directory tree but no registry file THEN detection SHALL treat file presence alone as a trace.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| DEPR-01 | P1: Only sanctioned skills offered (allowlist in `scan_skills`) | Tasks (T2, T16) | In Tasks |
| DEPR-02 | P1: Only sanctioned skills offered (delete four `skills/` dirs) | Tasks (T13) | In Tasks |
| DEPR-03 | P1: Removal from every IDE (registry + `_deprecated_assets_for`) | Tasks (T3, T16) | In Tasks |
| DEPR-04 | P1: Removal from every IDE (history-based manifest content) | Tasks (T3) | In Tasks |
| DEPR-05 | P1: Removal from every IDE (`remove_deprecated_skills`, always 0) | Tasks (T8) | In Tasks |
| DEPR-06 | P1: Removal from every IDE (iterate `DETECTED_IDES`) | Tasks (T4, T5, T8) | In Tasks |
| DEPR-07 | P1: Decision is developer's (one aggregated prompt per skill) | Tasks (T7) | In Tasks |
| DEPR-08 | P1: Removal from every IDE (apply: symlink + assets + hooks, order) | Tasks (T6) | In Tasks |
| DEPR-09 | P1: Removal from every IDE (`.md` + `.toml` agent twin) | Tasks (T6) | In Tasks |
| DEPR-10 | P1: Removal from every IDE (orphaned registry purge) | Tasks (T6) | In Tasks |
| DEPR-11 | P1: Decision is developer's (non-interactive auto-remove) | Tasks (T7) | In Tasks |
| DEPR-12 | P1: Both installer and uninstaller (`setup_skills` wiring) | Tasks (T9) | In Tasks |
| DEPR-13 | P1: Both installer and uninstaller (`uninstall.sh` wiring) | Tasks (T10 enabler, T11) | In Tasks |
| DEPR-14 | P1: Decision is developer's (decline → warn, no state) | Tasks (T7) | In Tasks |
| DEPR-15 | P2: Repository references (AGENTS.md + README.md) | Tasks (T14, T15) | In Tasks |
| DEPR-16 | P3: Local tooling survives (materialize before delete) | Tasks (T1) | In Tasks |
| DEPR-17 | P2: Repository references (delete two orphaned `refuter` JS tests) | Tasks (T12) | In Tasks |
| DEPR-N01 | P1: Both installer and uninstaller (reliability, all paths return 0) | Tasks (T4, T6, T7, T8) | In Tasks |
| DEPR-N02 | P1: Both installer and uninstaller (idempotency) | Tasks (T8) | In Tasks |
| DEPR-N03 | P1: Both installer and uninstaller (bash 3.2, braced idiom) | Tasks (T6) | In Tasks |
| DEPR-N04 | P1: Both installer and uninstaller (safety: manifest-only writes) | Tasks (T6) | In Tasks |
| DEPR-N05 | P2: Tests follow repo conventions | Tasks (T2 harness, T3–T11) | In Tasks |
| DEPR-N06 | P1: Both installer and uninstaller (one line per changed pair) | Tasks (T8) | In Tasks |

**ID format:** `DEPR-NN` for functional, `DEPR-NNN` for non-functional.
**Status values:** Pending → In Design → In Tasks → Implementing → Verified
**Coverage:** 23 total, **23 mapped to tasks, 0 unmapped ✅** (`tasks.md` approved 2026-08-21)

> **Spec ACs deliberately reinterpreted during Design/Tasks.** Five ACs are implemented differently
> from their literal text; each was verified by execution, and the Verifier must read this table
> rather than scoring them as failures. Full rationale in `tasks.md` → Requirement Traceability and
> `design.md` §0 / §Approval record.
>
> | AC | Literal text | Implemented as |
> | -- | ------------ | -------------- |
> | P1-4 AC 7 | registry entries "byte-identical" | **entry-preserving** (parsed `{event,matcher,command}` triples) — `json_remove_hooks:500` re-stringifies unconditionally |
> | P1-3 AC 8 | `copied` empty-line default is **keep** | **remove**, uniformly; protection moves to prompt wording + the CI skip |
> | P1-4 AC 9 | braced form fixes a "precedence bug" | braced form as **style** — `A \|\| B && C` already parses as `(A\|\|B) && C`; no defect exists at `:461,:473` |
> | P2-1 AC 2 | generated block "follows" the hand block | generated block **precedes** it (`:9-319` vs `:321-359`) |
> | P3 AC 1, 2 | all **four** skills materialized locally | only **`tlc-spec-driven`** + its 5 `tlc-*` commands (CONTEXT.md) |

### Requirement → acceptance-criteria map

| Req | Covered by |
| --- | ---------- |
| DEPR-01 | P1-1 AC 1,2,3,5 |
| DEPR-02 | P1-1 AC 4 |
| DEPR-03 | P1-2 AC 1 |
| DEPR-04 | P1-2 AC 2 |
| DEPR-05 | P1-2 AC 10 |
| DEPR-06 | P1-2 AC 3,4,5 |
| DEPR-07 | P1-3 AC 1,2,3 |
| DEPR-08 | P1-2 AC 6,7 |
| DEPR-09 | P1-2 AC 8 |
| DEPR-10 | P1-2 AC 9 |
| DEPR-11 | P1-3 AC 6 |
| DEPR-12 | P1-4 AC 1,2 |
| DEPR-13 | P1-4 AC 3 |
| DEPR-14 | P1-3 AC 4,5 |
| DEPR-15 | P2-1 AC 1,2,3,4 |
| DEPR-16 | P3 AC 1,2,3 |
| DEPR-17 | P2-1 AC 5 |
| DEPR-N01 | P1-4 AC 4,5 |
| DEPR-N02 | P1-4 AC 6; P1-3 AC 7 |
| DEPR-N03 | P1-4 AC 9 |
| DEPR-N04 | P1-4 AC 7 |
| DEPR-N05 | P2-2 AC 1,2,3 |
| DEPR-N06 | P1-4 AC 8 |

### Ticket FR/AC → spec ID map

Every seed FR and AC is accounted for; nothing was dropped.

| Seed | Spec |
| ---- | ---- |
| FR-01 … FR-16 | DEPR-01 … DEPR-16 (same ordering) |
| NFR-01 … NFR-06 | DEPR-N01 … DEPR-N06 |
| AC-01 | P1-1 AC 5 |
| AC-02 | P1-2 AC 6,7 |
| AC-03 | P1-2 AC 3; P1-4 AC 1,2 |
| AC-04 | P1-3 AC 4,5 |
| AC-05 | P1-4 AC 4 |
| AC-06 | P1-3 AC 6 |
| AC-07 | P1-3 AC 7 |
| AC-08 | P1-2 AC 4; Edge Cases |
| AC-09 | P1-2 AC 2 |
| AC-10 | P1-2 AC 8; P1-2 AC 7 |
| AC-11 | P1-2 AC 9 |
| AC-12 | P1-4 AC 3 |
| AC-13 | P2-1 AC 1,3 |
| — (new) | P2-1 AC 5 = DEPR-17, from verification |

---

## Implicit-Requirement Dimensions Sweep

Large scope → every dimension resolves to a requirement or an explicit `N/A because …`.

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | **Covered.** `_deprecated_assets_for` returns empty for an unknown name (P1-2 AC 1). Manifest paths are a closed hardcoded set (DEPR-N04) — no developer-supplied path ever reaches `rm`. |
| Failure / partial-failure states | **Covered.** DEPR-N01 / P1-4 AC 5: a broken symlink, missing source dir, unreadable registry or empty `IDE_SKILLS_DIR` must not abort. Partial removal (IDE 1 succeeds, IDE 2 fails) leaves IDE 1 clean and continues — acceptable because DEPR-N02 makes a re-run finish the job. |
| Idempotency / retry / duplicate handling | **Covered.** DEPR-N02 / P1-4 AC 6: second run finds nothing, prompts nothing. `json_remove_hooks` is a filter, so repeat calls are no-ops. |
| Auth boundaries & rate limits | **N/A** because this is a local shell installer with no network calls, no multi-user surface, and no service to throttle. The only privilege boundary is the developer's own `$HOME`, constrained by DEPR-N04. |
| Concurrency / ordering | **Partially covered; one ordering requirement is explicit.** P1-2 AC 7 mandates `json_remove_hooks` **before** `rm -f`. Concurrent `install.sh` invocations are **N/A because** the installer is an interactive foreground script with no lock today and adding one is out of scope; the operation is idempotent so an interleaving degrades to a repeat, not corruption. |
| Data lifecycle / expiry | **Covered by explicit decision.** DEPR-14: no persisted "declined" state, therefore nothing to expire. A-09: deleted skill content is retained only in git history, no in-repo archive. |
| Observability | **Covered.** DEPR-N06 / P1-4 AC 8: exactly one summary line per changed (skill, IDE) pair, none when unchanged. DEPR-07: prose to stderr, decision to stdout. |
| External-dependency failure | **Covered.** `node` is the only external tool on the write path (`json_remove_hooks`, `skill.json` parsing). P1-4 AC 5 requires the run to survive a `node` failure or malformed JSON; existing `catch { process.exit(0) }` in `json_remove_hooks` already fails closed without writing. |
| State-transition integrity | **Covered.** The `detect_link_state` lattice `linked \| broken \| copied \| absent` drives the decision (P1-2 AC 4), with `copied` given distinct interactive/non-interactive handling per A-01. Valid transitions are trace→removed and trace→retained(declined); there is no other state. |

---

## Success Criteria

- [ ] `skills/` contains exactly `mcp-bench/`, and `scan_skills` yields exactly `mcp-bench` even with an extra unsanctioned `skill.json` present.
- [ ] On a machine seeded with all four skills across OpenCode + Claude Code + Codex, one `./install.sh` run (interactive, all confirmed) leaves zero deprecated files under `~/.config/opencode/`, `~/.claude/`, `~/.codex/`, `~/.agents/skills/`, `~/.github/agents/` and zero deprecated entries in `~/.claude/settings.json` / `~/.codex/hooks.json`.
- [ ] The same run leaves `mcp-bench`'s links and every unrelated hook-registry entry byte-identical.
- [ ] An immediate second `./install.sh` prints no removal line and asks no removal question.
- [ ] `./scripts/uninstall.sh` on a seeded machine removes the deprecated assets rather than skipping them.
- [ ] `bash scripts/tests/<new>.test.sh` passes with 0 FAIL, and no existing test regresses; no test file references a deleted `skills/` path.
- [ ] `./install.sh` exits 0 with a deliberately corrupted `~/.claude/settings.json` and a broken deprecated symlink present.
- [ ] `/tlc-specify` still works on this machine after the four directories are deleted.
