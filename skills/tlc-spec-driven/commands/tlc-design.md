---
name: tlc-design
description: >
  Run the Design phase of the tlc-spec-driven workflow for the active feature.
  Loads the skill's design reference and produces architecture and component
  decisions (design.md) for a Large/Complex feature. Skips gracefully for
  small changes that need no architectural decisions.
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
Execute the **Design** phase of the tlc-spec-driven skill for the active feature
(`$ARGUMENTS`, or the current feature if omitted). Define HOW the feature is
built: architecture, components, and code reuse.
</objective>

<process>
1. Load the skill reference `references/design.md` (relative to the tlc-spec-driven
   skill directory) and follow it as the authoritative workflow for this phase.
2. Resolve the active feature:
   - If `$ARGUMENTS` names a feature, use it.
   - Else use the current feature (e.g. `.specs/features/<current>` per the skill's
     structure, or the branch's feature).
3. Read the feature's `spec.md` (and `context.md` if present) before designing.
4. Produce `design.md` in the feature directory per `references/design.md`.
5. Honor the Knowledge Verification Chain (codebase → project docs → Context7 →
   web → flag uncertainty). Never fabricate APIs or patterns.
</process>

<constraints>
- Invoking this command IS the user's authorization to enter the Design phase
  (see SKILL.md → Phase Transition Enforcement); proceed normally.
- Behavior MUST match the natural-language "design feature" trigger — this command
  is a thin entry point over `references/design.md`, not a reimplementation.
- Auto-size: if the change needs no architectural decisions, say so and recommend
  skipping straight to implementation rather than producing an empty design.
- Do not begin implementation here; this phase only designs.
</constraints>
