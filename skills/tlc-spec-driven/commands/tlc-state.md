---
name: tlc-state
description: >
  Record persistent memory in the tlc-spec-driven workflow — a decision, blocker,
  todo, lesson, or deferred idea — into STATE.md under .specs/project/.
argument-hint: '"<decision|blocker|todo|lesson|idea> <text>"'
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **state management** action of the tlc-spec-driven skill: record the
item described by `$ARGUMENTS` into the project's persistent memory (STATE.md).
</objective>

<process>
1. **Validate input**: if `$ARGUMENTS` is empty, PROMPT for the item type and text
   and wait — do NOT write an empty entry.
2. Load the skill reference `references/state-management.md` and follow it as
   authoritative.
3. Append the entry to the correct section of `.specs/project/STATE.md`
   (Decisions, Blockers, Todos, Lessons, Deferred Ideas), creating the file if
   needed.
</process>

<constraints>
- Behavior MUST match the natural-language "record decision / log blocker / add
  todo" trigger.
- Keep entries concise and dated; do not restructure unrelated sections.
</constraints>
