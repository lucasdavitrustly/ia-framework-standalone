---
name: tlc-roadmap
description: >
  Create or update the project roadmap with the tlc-spec-driven workflow. Maps
  features and milestones into ROADMAP.md under .specs/project/.
argument-hint: "[focus or milestone]"
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **roadmap** action of the tlc-spec-driven skill. Create or update the
project's feature/milestone roadmap (`$ARGUMENTS` may scope the focus).
</objective>

<process>
1. Load the skill reference `references/roadmap.md` and follow it as authoritative.
2. Read `.specs/project/PROJECT.md` (if present) for goals before planning.
3. Create/update `.specs/project/ROADMAP.md` with prioritized features/milestones.
</process>

<constraints>
- Behavior MUST match the natural-language "create roadmap / plan features"
  trigger.
- Keep the roadmap outcome-oriented; defer implementation detail to feature specs.
</constraints>
