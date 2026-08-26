# DEV-306771 — Deprecate four skills: Context

**Gathered:** 2026-08-20
**Spec:** `.specs/features/DEV-306771-deprecate-installer-skills/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Ship only `mcp-bench` as an installable skill. Delete `skills/grill-with-docs/`,
`skills/jira-feed/`, `skills/refuter/` and `skills/tlc-spec-driven/` from the repo.
Add a hardcoded, history-based asset manifest plus `remove_deprecated_skills()` that
purges every trace of those four from **every detected IDE** — skill-directory
symlinks, per-file `agents`/`commands`/`hooks` links, `.toml` agent twins, and hook
registry entries — behind one consent prompt per skill. Wire it into `install.sh`
(before `prompt_ide_select`) and `scripts/uninstall.sh`. Never abort the run. Update
`AGENTS.md` / `README.md`, delete the two orphaned `refuter` JS tests, and materialize
local tooling before the deletion.

Unchanged: MCP configuration, `unlink_skill()`'s glob implementation, the
`LEGACY_SKILL_RENAMES` (`tab-*`) registry, `mcp-bench` itself.

---

## Implementation Decisions

### `copied` state — a deprecated skill that is a real directory (resolves A-01, A-08)

- **Interactive:** prompt, and a bare Enter **removes** — the default is uniform
  `remove` across `linked`, `broken` and `copied`. No per-state default table.
- **Prompt wording is the safeguard, not the default.** For `copied` the prompt must
  state (a) the absolute path, (b) that it is a **real directory, not a link**, and
  (c) that removal is permanent because the content is **not in this repo's git
  history**. Only then `[remove/keep] (remove):`.
- **Non-interactive (`is_noninteractive()` true — no TTY, `CI`, or `NON_INTERACTIVE`):**
  a `copied` skill is **skipped with a warning, never removed**. `linked` and `broken`
  are removed automatically as normal.
- Rationale: uniform interactive default keeps one code path and matches the file's
  other corrective defaults; the CI carve-out is where irreversible unattended
  destruction actually happens, so that is where the block belongs.
- Deliberate divergence from `migrate_legacy_skills`, which removes `copied`
  unconditionally — justified: that routine only ever removed *renamed* assets no
  developer would have authored.

### Local materialization — only `tlc-spec-driven` survives (resolves A-02; **narrows spec P3**)

- **Materialize:** `~/.config/opencode/skills/tlc-spec-driven/` becomes a **real
  directory** (`SKILL.md`, `README.md`, `skill.json`, `references/`, `scripts/`,
  `commands/`) with the pre-deletion content, under the **same name** — renaming would
  break every slash command that resolves the skill by name.
- **Materialize exactly 5 command links**, the `tlc-*`-prefixed ones, as real files in
  `~/.config/opencode/command/`: `tlc-specify.md`, `tlc-design.md`, `tlc-tasks.md`,
  `tlc-execute.md`, `tlc-discuss.md`. `/tlc-discuss` must keep working.
- **Delete, do not materialize:** `command/delivery.md` and `command/start-work-on.md`
  (also shipped by `tlc-spec-driven`, but not `tlc-*`-prefixed).
- **`grill-with-docs`, `jira-feed`, `refuter` get no local copy and no backup.** Their
  skill-directory symlinks, 4 agent links (`jira-feed-formatter.md`,
  `refuter-analyst.md`, `refuter-orchestrator.md`, `refuter-report-writer.md`),
  2 command links (`jira-feed.md`, `refuter.md`) and 9 hook links are removed and their
  hook registrations deregistered — exactly as the shipped feature does for any
  developer. This makes the developer's own machine a live test of the removal path.
- `mcp-bench`'s links (1 skill dir + 3 `mcp-bench-*.md` commands) remain untouched
  symlinks.
- **Accepted consequence:** the materialized `tlc-spec-driven` directory is `copied`
  state, so `remove_deprecated_skills()` prompts for it on every future `install.sh`
  run and the developer must answer `keep`. No marker file, no exemption, no persisted
  state — FR-14 forbids persistence and the recurring prompt is a bounded annoyance.

### Registry-only orphans count as a trace (resolves A-06)

- An IDE with **no deprecated files at all** but a surviving `h.command` entry in
  `~/.claude/settings.json` / `~/.codex/hooks.json` **is** treated as holding a trace:
  it is named in the prompt, and confirming calls `json_remove_hooks` for every
  manifest hook path even when no link file exists.
- Rationale: without this, P1-2 AC 9 (orphan purge) is unreachable through the normal
  flow — with no link and no directory nothing would mark the IDE affected.
- Accepted cost: registry inspection during detection, one `node` invocation per
  (IDE, skill) on hook-capable IDEs.

### Removal prompt (resolves A-07, A-08)

- **One prompt per skill**, covering all affected IDEs at once. All-or-nothing per
  skill; no per-IDE opt-out.
- **Compact two-line shape**, matching `prompt_skill_action`'s existing idiom:
  a single line naming the skill and the `IDE_NAME` display names of every affected
  IDE, then `[remove/keep] (remove): `. Not a per-IDE breakdown — 4 skills × 3 IDEs
  would flood the installer.
  - Example: `• refuter — deprecated, found in OpenCode, Claude Code, Codex`
  - The `copied` variant carries the extra real-directory / permanence warning above.
- All prose to **stderr**; only the decision token to **stdout**.
- **Decline path:** warning states both *why the skill is broken* (its source is gone
  from the repo, so its links are dead) *and* that it will be offered again on the next
  run. Nothing is persisted to disk.
  - Wording (agent's discretion, per this shape):
    `⚠ refuter kept — its source no longer exists in the repo, so its links are dead; it will be offered for removal again on the next run.`

### Summary output (resolves DEPR-N06)

- Exactly **one line per changed (skill, IDE) pair**; nothing printed when that pair
  changed nothing.
- The line carries **counts *and* the removed asset basenames** — not counts alone.
  Debuggability of a destructive `rm` path outweighs output volume; no verbose flag,
  no second branch to test.

### Documentation and orphaned tests (resolves DEPR-15, DEPR-17)

- **`AGENTS.md`:** delete the hand-maintained `<!-- pipeline-guide-start -->` …
  `<!-- pipeline-guide-end -->` block **entirely, markers included**. It is wholly about
  the four deprecated skills and would describe nothing installable.
- The generated `<!-- ia-framework:rag-start -->` … `<!-- ia-framework:rag-end -->`
  block must remain **byte-identical**. **Correction to spec P2-1 AC 2:** that block is
  at `AGENTS.md:9`, i.e. it **precedes** the pipeline-guide block (321–359); the spec
  describes it as "adjacent … follows". Order does not change the requirement, only the
  edit's location.
- **`README.md:733`** (`> This replaces the previous standalone Jira MCP. The
  `jira-feed` skill now depends on the `atlassian` MCP.`) — the `jira-feed` mention is
  **deleted**, not softened into a deprecation note.
- **`scripts/tests/refuter-drift-detector.test.js` and
  `scripts/tests/refuter-orchestration-complete.test.js` are deleted outright** — not
  converted to skipped stubs. They `require`/exec `../../skills/refuter/hooks/*.js`
  (`:17`, `:24`), which FR-01 removes.

### Agent's Discretion

- Exact decline-warning and `copied`-prompt strings, within the content requirements
  fixed above.
- Exact format of the summary line (ordering of counts vs. names, colour/glyph choice),
  provided it stays one line per changed pair and includes both counts and basenames.
- Whether registry inspection during detection is a helper or inlined.

### Declined / Undiscussed Gray Areas → Assumptions

None. All six presented gray areas (G1–G6) were discussed. A-01, A-02, A-06, A-07 and
A-08 are now resolved above and are no longer open questions. A-03, A-04, A-09 and A-10
were already verified in code. **A-05 remains defaulted, undiscussed** (no `test:shell`
runner; manual `bash scripts/tests/<name>.test.sh`) — it stays recorded in the spec's
Assumptions table as-is.

---

## Specific References

- **`migrate_legacy_skills` (`scripts/install-skills.sh:55-129`) is the structural
  precedent** for `remove_deprecated_skills()`: same per-IDE descriptor
  source/unset dance, same `agents/` → `.md` + `.toml` twin handling, same
  `json_remove_hooks` before `rm -f` ordering, same "link gone but registration may
  remain" else-branch, same one-summary-line-per-pair reporting. Follow it, with three
  deliberate departures: iterate `DETECTED_IDES` (not `SELECTED_IDES`), gate on consent,
  and treat `copied` non-destructively under CI.
- Summary-line precedent to extend: `↻ migrated tab-refuter → refuter in OpenCode
  (removed N stale link(s), M hook registration(s))`.
- `prompt_skill_action` (`:667`) is the prompt-idiom precedent: prose to stderr via
  `>&2`, `read -rp` with the default in parentheses, token to stdout.
- Verified live pre-state on this machine (2026-08-20): `~/.config/opencode/skills/`
  holds 5 symlinks into the repo (4 deprecated + `mcp-bench`); `agents/` holds 4
  deprecated links; `command/` holds **9** deprecated-skill-owned links + 3
  `mcp-bench`; `hooks/` holds 9. **The spec's "8 deprecated commands" (line 71) is now
  stale — `tlc-discuss.md` was added since.** `tlc-spec-driven` currently ships 7
  commands and **0** agents/hooks.

---

## Deferred Ideas

- Refactoring `migrate_legacy_skills` and `remove_deprecated_skills` into a shared
  `_purge_skill_assets()` — already deferred by the spec's Out of Scope table; the
  decisions above (consent gate, CI carve-out, `DETECTED_IDES`) widen the behavioural
  gap, reinforcing that deferral.
- A `test:shell` runner / CI workflow for `scripts/tests/*.test.sh` (A-05).
- Putting the materialized `tlc-spec-driven` copy on a supported long-term footing
  (personal skills directory, or a published skill) so it stops tripping the `copied`
  prompt. Out of scope; the recurring prompt is accepted for now.
- Preserving `grill-with-docs` / `jira-feed` / `refuter` anywhere outside git history.
  Explicitly declined.

---

## Spec Amendments Required Before Design

These decisions contradict the spec as written; Design must treat **this document** as
authoritative, or the spec should be amended first.

| Spec location | Says | Decision |
| ------------- | ---- | -------- |
| P3 story + AC 1, 2; A-02; DEPR-16 | All **four** skills materialized locally, same names | Only **`tlc-spec-driven`** (skill dir + the 5 `tlc-*` commands). The other three are deleted with no copy; `delivery.md` / `start-work-on.md` deleted. |
| P1-3 AC 8; A-08 | `copied` empty-line default is **keep** | Uniform default **remove** in interactive runs; protection moves entirely to prompt wording + the CI skip. |
| A-01 | Prompt default no for `copied` | Prompt default **yes/remove**; `copied` still never auto-removed under `is_noninteractive()`. |
| P2-1 AC 2 | Generated rag block is "adjacent … follows" the pipeline-guide block | It **precedes** it (`AGENTS.md:9` vs `321-359`). |
| Seed-corrections table, line 71 | `command/` holds 8 deprecated links | Holds **9** as of 2026-08-20 (`tlc-discuss.md` added since). |
| DEPR-N06 / P1-4 AC 8 | "exactly one summary line" (content unspecified) | Line includes counts **and** removed asset basenames. |
