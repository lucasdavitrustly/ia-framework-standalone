---
name: tlc-quick
description: >
  Run a Quick-mode ad-hoc task with the tlc-spec-driven workflow. Creates a git
  branch for the task, then implements a small (<=3 file) change with the same
  coding principles but without full pipeline ceremony. For bug fixes, config
  changes, and small tweaks.
argument-hint: '"<one-sentence task>"'
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute **Quick mode** of the tlc-spec-driven skill for the ad-hoc task described
by `$ARGUMENTS`. Create a dedicated git branch first, then implement the smallest
correct change.
</objective>

<process>
1. **Validate input**: if `$ARGUMENTS` is empty or vague, PROMPT for a clear
   one-sentence task and wait — do NOT start on an empty/ambiguous task.
2. **Create the branch (FIRST, before any implementation)**:
   - Run the skill's self-contained branch helper from the tlc-spec-driven skill
     directory:
     `sh scripts/new-feature-branch.sh --json --kind quick "<one-sentence task>"`
   - Parse the returned JSON `{BRANCH_NAME, FEATURE_NUM}`. If the branch exists it
     switches (no overwrite); if not a git repo, surface the message and ask how
     to proceed.
3. **Run Quick mode**: load the skill reference `references/quick-mode.md` and
   follow it as authoritative — pre-implementation check (files + approach +
   verify), implement touching only listed files, verify, atomic Conventional
   Commit, and record under `.specs/quick/<FEATURE_NUM>-<slug>/`.
4. If the pre-implementation check reveals the task is bigger than expected
   (>3 files, unclear scope, design decisions), STOP and recommend the full
   pipeline (`tlc-specify`).
</process>

<constraints>
- Behavior MUST match the natural-language "quick fix / quick task" trigger,
  except that a branch is now always created first (a deliberate change to the
  prior commit-only quick-mode flow).
- The branch helper is self-contained and MUST NOT depend on SpecKit / `.specify/`.
- Quick != sloppy: same coding principles, just less ceremony. Max 3 files.
</constraints>
