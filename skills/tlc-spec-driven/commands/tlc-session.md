---
name: tlc-session
description: >
  Pause or resume work with the tlc-spec-driven workflow. On pause, writes a
  session handoff to STATE.md; on resume, reloads context to continue where you
  left off.
argument-hint: '"<pause|resume>"'
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **session handoff** action of the tlc-spec-driven skill. `$ARGUMENTS`
selects `pause` (write handoff) or `resume` (reload and continue).
</objective>

<process>
1. **Validate input**: if `$ARGUMENTS` is neither `pause` nor `resume`, ask which
   one is intended and wait.
2. Load the skill reference `references/session-handoff.md` and follow it as
   authoritative.
3. On `pause`: capture current feature, in-progress task, next steps, and open
   blockers into `.specs/project/STATE.md`.
   On `resume`: read STATE.md + the active feature docs and summarize where work
   left off, then continue.
</process>

<constraints>
- Behavior MUST match the natural-language "pause work / resume work" trigger.
- On resume, follow the skill's Context Loading Strategy; do not over-load context.
</constraints>
