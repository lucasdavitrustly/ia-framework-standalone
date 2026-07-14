---
name: tlc-execute
description: >
  Run the Execute phase of the tlc-spec-driven workflow. Implements tasks one at
  a time with verification and atomic commits, following the skill's coding
  principles. Always lists atomic steps inline before starting.
argument-hint: "[task id or feature]"
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **Execute** (implementation) phase of the tlc-spec-driven skill for
the active feature or a specific task (`$ARGUMENTS`). Implement with verification
and atomic commits.
</objective>

<process>
1. Load the skill references `references/implement.md` and
   `references/coding-principles.md`; follow them as authoritative.
2. If `tasks.md` exists, execute tasks in dependency order (one at a time; `[P]`
   tasks may be delegated to sub-agents). If no `tasks.md`, FIRST list the atomic
   steps inline (safety valve); if that reveals >5 steps or complex dependencies,
   STOP and recommend running the Tasks phase (`tlc-tasks`).
3. For each task: implement the simplest thing that works, verify per its
   "Done when", then make an atomic Conventional Commit.
4. Mark completed tasks `[X]` in `tasks.md` and update traceability.
</process>

<constraints>
- Invoking this command IS the user's authorization to enter the Execute phase
  (see SKILL.md → Phase Transition Enforcement); proceed normally.
- Behavior MUST match the natural-language "implement task / execute" trigger.
- Never batch verification: a task is done only after its verification passes.
- Touch only files the task specifies; no scope creep.
</constraints>
