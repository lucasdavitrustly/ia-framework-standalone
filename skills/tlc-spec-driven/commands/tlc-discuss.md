---
name: tlc-discuss
description: >
  Run the Discuss (gray areas) step of the tlc-spec-driven workflow for the
  active feature. Loads the skill's discuss reference and captures the user's
  vision for ambiguous, user-facing decisions (context.md) that the spec left
  open. Use after Specify when the spec has open questions / gray areas, before
  Design. Skips gracefully when the feature is unambiguous.
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
Execute the **Discuss** step of the tlc-spec-driven skill for the active feature
(`$ARGUMENTS`, or the current feature if omitted). Capture HOW the user envisions
the feature for the ambiguous / gray areas the spec left open, producing
`context.md` that feeds Design and Tasks. This is the in-Specify discuss step,
invoked explicitly.
</objective>

<process>
1. Load the skill reference `references/discuss.md` (relative to the tlc-spec-driven
   skill directory) and follow it as the authoritative workflow for this step.
2. Resolve the active feature:
   - If `$ARGUMENTS` names a feature, use it.
   - Else use the current feature (e.g. `.specs/features/<current>` per the skill's
     structure, or the branch's feature).
3. Read the feature's `spec.md` before discussing. Pay special attention to any
   `## Open Questions` / `[NEEDS CLARIFICATION: ...]` markers — turn each into a
   concrete gray area to resolve with the user.
4. Run the discuss process from `references/discuss.md`: analyze the domain,
   present feature-specific gray areas, deep-dive each with concrete-option
   questions, and enforce the scope guardrail (clarify HOW, never add new scope).
5. Produce `context.md` in the feature directory per `references/discuss.md`.
   Fold the resolved open questions into Implementation Decisions so downstream
   phases no longer see them as ambiguous.
6. When done, remind the user that the next phase is `/tlc-design` (or, for a
   feature that decomposes cleanly, `/tlc-tasks`).
</process>

<constraints>
- Invoking this command IS the user's authorization to run the Discuss step
  (see SKILL.md → Phase Transition Enforcement); proceed normally.
- Behavior MUST match the natural-language "discuss feature / how should this
  work / capture context" trigger — this command is a thin entry point over
  `references/discuss.md`, not a reimplementation.
- Scope is sacred: Discuss clarifies HOW to implement within the spec's fixed
  boundary. Scope-creep ideas go to Deferred Ideas, never into the feature.
- Auto-size: if the spec is clear and unambiguous (no gray areas / open
  questions), say so and recommend skipping straight to `/tlc-design` rather
  than producing an empty context.
- Do not design or implement here; this step only captures user decisions.
</constraints>
