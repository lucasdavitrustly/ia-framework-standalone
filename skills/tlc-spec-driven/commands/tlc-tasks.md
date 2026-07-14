---
name: tlc-tasks
description: >
  Run the Tasks phase of the tlc-spec-driven workflow for the active feature.
  Breaks the design into atomic, dependency-ordered tasks with verification
  criteria (tasks.md). Skips gracefully when there are 3 or fewer obvious steps.
argument-hint: "[feature name or path]"
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **Tasks** phase of the tlc-spec-driven skill for the active feature
(`$ARGUMENTS`, or the current feature if omitted). Produce a granular, atomic
task breakdown with clear dependencies and a parallel-execution plan.
</objective>

<process>
1. Load the skill reference `references/tasks.md` and follow it as the
   authoritative workflow for this phase.
2. Resolve the active feature; read its `spec.md` and `design.md` (if present)
   before decomposing.
3. Produce `tasks.md` in the feature directory: atomic tasks, dependencies,
   "Done when" verification, and test assignments per the skill's TESTING guidance.
</process>

<constraints>
- Invoking this command IS the user's authorization to enter the Tasks phase
  (see SKILL.md → Phase Transition Enforcement); proceed normally.
- Behavior MUST match the natural-language "break into tasks" trigger.
- Safety valve: if listing reveals >5 steps or complex dependencies for a change
  that skipped Design, STOP and recommend the full pipeline (per SKILL.md).
- Each task MUST be specific enough to implement without extra context and MUST
  name concrete file paths.
</constraints>
