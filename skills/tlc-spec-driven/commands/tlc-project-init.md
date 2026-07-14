---
name: tlc-project-init
description: >
  Initialize a new project with the tlc-spec-driven workflow. Establishes the
  project's vision and goals (PROJECT.md) and initial roadmap (ROADMAP.md) under
  .specs/project/.
argument-hint: "[project name]"
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **project initialization** action of the tlc-spec-driven skill for
`$ARGUMENTS` (or the current repo). Produce PROJECT.md and ROADMAP.md.
</objective>

<process>
1. Load the skill reference `references/project-init.md` and follow it as the
   authoritative workflow.
2. Create `.specs/project/PROJECT.md` (vision & goals) and, per the reference,
   the initial `.specs/project/ROADMAP.md` and `.specs/project/STATE.md`.
3. If this is an existing codebase, recommend running `tlc-map-codebase` first.
</process>

<constraints>
- Behavior MUST match the natural-language "initialize project / setup project"
  trigger — a thin entry point over `references/project-init.md`.
- Do not fabricate goals; ask the user for vision/goals if not provided.
</constraints>
