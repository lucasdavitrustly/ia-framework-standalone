# Spec Quality Checklist — DEV-306771

Reviewed against `references/specify.md` closure gate. Scope tier: **Large** → full gate.

## 1. Unambiguity + precision (hard)

Every AC must have a single interpretation AND a precise, spec-defined expected outcome.

| Check | Status | Note |
| ----- | ------ | ---- |
| Each AC in WHEN/THEN/SHALL form | PASS | All 45 ACs across 7 stories. |
| Each AC has exactly one reading | PASS | Ambiguous seed phrasings were split: seed FR-08 became P1-2 AC 6+7 (apply vs. hook ordering); seed AC-10 became P1-2 AC 7+8 (toml twin vs. registry). |
| Each AC asserts a concrete, checkable value | PASS | Counts are literal (1 agent / 13 commands for `tlc-spec-driven`); "byte-identical" replaces "not disturbed"; "exactly one summary line" replaces "one line". |
| No AC depends on implementation shape | PASS | ACs name observable outcomes (files gone, registry entries absent, exit status 0), not internal structure. The two exceptions are deliberate: DEPR-06 (`DETECTED_IDES` not `SELECTED_IDES`) and DEPR-12 (call-site placement) are themselves the requirement — the ticket specifies them as behaviour-visible contracts. |
| Vague terms eliminated | PASS | "clean state" → enumerated directories + registry files in Success Criteria; "safe to run twice" → P1-4 AC 6; "never abort" → "SHALL return 0" with the four named failure modes. |

**Precision gaps deliberately left as assumptions, not silently:** A-01, A-02, A-06, A-08 — each names its chosen default and rationale. See section 2.

## 2. Open-questions / assumptions closure

| Seed open question | Disposition |
| ------------------ | ----------- |
| `copied` state — remove or preserve local work? | **A-01**, defaulted with a divergence from the ticket: confirm interactively, skip in CI. Flagged `n` — needs confirmation, it changes destructive behaviour. |
| FR-16 local copies get re-flagged next run — rename to `-local`? | **A-02**, defaulted to same-name (renaming breaks slash-command resolution). Flagged `n`. |
| Keep both `LEGACY_SKILL_RENAMES` and the new registry? | **A-03**, resolved to `y` — verified in code that the basename sets are disjoint (`tab-*` vs un-prefixed), so they compose. |
| External consumers of the deleted `skills/` paths? | **A-04**, resolved `y` and **corrected**: no external consumer, but two in-repo ones exist → new requirement DEPR-17. |
| Add a `test:shell` runner? | **A-05**, defaulted to no runner (matches current manual practice; `package.json test` is `turbo run test`). Low risk. |

**Assumptions surfaced during verification that the seed did not raise:**

| New | Why it matters |
| --- | -------------- |
| A-06 | Without counting a registry-only trace as "present", seed AC-11 (orphan purge) is unreachable through the normal flow — nothing would mark the IDE affected. Makes a stated AC testable. |
| A-07 | Confirms all-or-nothing per skill (no per-IDE opt-out), removing a plausible second reading of FR-07. |
| A-08 | The seed never states the prompt's default answer; an unspecified default on a destructive prompt is a real ambiguity. |
| A-09 | Whether deleted skill content needs an in-repo archive. Resolved: no, git history suffices. |
| A-10 | `vscode-copilot` (`IDE_SKILLS_DIR=""`, real `IDE_AGENTS_DIR`) would be missed by skill-dir-only detection. Verified in the descriptor. |

**Open questions:** none unmarked. All resolved or logged with default + rationale.

## 3. Declined / undiscussed gray areas → assumptions

PASS — no gray area was dropped. The four seed questions and the five newly-surfaced ones are all in the Assumptions table with a chosen default. Four are flagged `Confirmed? = n` and are the stated reason `/tlc-discuss` is recommended over `/tlc-design`.

## 4. Traceability

| Check | Status | Note |
| ----- | ------ | ---- |
| Every requirement has an ID | PASS | 23 IDs: DEPR-01…17 functional, DEPR-N01…N06 non-functional. |
| Every seed FR/NFR/AC maps to a spec ID | PASS | Explicit "Ticket FR/AC → spec ID" table. FR-01…16 map 1:1 to DEPR-01…16; NFR-01…06 to DEPR-N01…N06; all 13 seed ACs mapped. |
| Every requirement maps to at least one AC | PASS | Explicit "Requirement → acceptance-criteria" table; no requirement is unbacked. |
| Every story is independently testable | PASS | Each has an **Independent Test** naming the concrete command and assertion. |

## 5. Scope discipline

| Check | Status | Note |
| ----- | ------ | ---- |
| Out of Scope table populated | PASS | 8 exclusions, each with a reason; MCP config and the shared-helper refactor called out explicitly. |
| No invented requirements | PASS with one addition | DEPR-17 is the only requirement not traceable to the seed. It is not invention — it is a defect the change *creates*: `scripts/tests/refuter-*.test.js:17,:24` resolve `../../skills/refuter/hooks/*.js`, which FR-01 deletes. Verified by reading both files. |
| Dimensions sweep bounded to this feature | PASS | 9/9 resolved; 1 full `N/A because` (auth), 1 partial `N/A because` (concurrent invocations). No requirement invented to fill a row. |

## 6. Verification quality (Knowledge Verification Chain Step 1)

Every seed codebase claim was checked against the live tree rather than trusted. Six findings:

| # | Finding | Impact |
| - | ------- | ------ |
| 1 | Two `refuter` JS test files resolve into `skills/refuter/hooks/` | **New DEPR-17.** Without it the repo ships permanently-failing tests. |
| 2 | `migrate_legacy_skills` at `:764` sits *after* the `prompt_ide_select` early return at `:757-760` | Placing the new call there would make it unreachable when no IDE is selected — contradicting FR-12's own "must not depend on `SELECTED_IDES`". Corrected to between `:752` and `:754`. |
| 3 | `AGENTS.md` has a *generated* `ia-framework:rag` block adjacent to the hand-maintained `pipeline-guide` block | **New P2-1 AC 2:** the generated block must stay byte-identical or `agents.command.ts:366-387` will overwrite the edit. |
| 4 | FR-04 manifest reproduced exactly via `git log --all --diff-filter=A` | Confirmed; also confirmed the current tree is strictly smaller (7 vs 13 commands, 0 vs 1 agent for `tlc-spec-driven`), which is precisely why the manifest must be history-based. |
| 5 | Live pre-state matches the seed exactly (4 skill symlinks, 4 agents, 8 deprecated commands, 9 hooks; `mcp-bench` also linked) | FR-16 confirmed necessary; added the requirement that `mcp-bench`'s 4 links survive materialization. |
| 6 | `vscode-copilot` `IDE_SKILLS_DIR=""` + real `IDE_AGENTS_DIR`; `codex`/`vscode-copilot` `IDE_COMMANDS_DIR=""`; only `claude-code`/`codex` have registries | Drove P1-2 AC 5 and four Edge Cases. |

Also verified: bash 3.2.57 and node v26.7.0 on this machine; the unbraced-idiom bug genuinely present at `install-skills.sh:461,473`; braced form at `:98,:104`; no basename collision between the manifest and `mcp-bench`'s three commands.

## Gate result

**PASS** — presentable for confirmation.

Four assumptions carry `Confirmed? = n` and change observable behaviour (A-01 and A-02 most materially: A-01 diverges from the ticket's literal instruction to protect unversioned work; A-02 accepts a recurring prompt to avoid breaking slash-command resolution). Per `specify.md`, logged assumptions satisfy the gate — but they make `/tlc-discuss` the correct next step rather than `/tlc-design`.
