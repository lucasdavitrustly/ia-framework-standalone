---
name: tlc-map-codebase
description: >
  Map an existing codebase with the tlc-spec-driven workflow (brownfield
  analysis). Produces the codebase documents (stack, architecture, conventions,
  structure, testing, integrations, concerns) under .specs/codebase/.
argument-hint: "[area or path to focus]"
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **brownfield mapping** action of the tlc-spec-driven skill for the
current repository (optionally scoped by `$ARGUMENTS`). Produce the codebase
analysis documents.
</objective>

<process>
1. Load the skill reference `references/brownfield-mapping.md` and follow it as
   authoritative. Prefer the `codenavi` skill for exploration if installed;
   otherwise use `references/code-analysis.md` tools.
2. Produce the 7 codebase docs under `.specs/codebase/` (STACK, ARCHITECTURE,
   CONVENTIONS, STRUCTURE, TESTING, INTEGRATIONS, CONCERNS).
3. Verify findings against the actual code (Knowledge Verification Chain); never
   fabricate structure or conventions.
</process>

<constraints>
- Behavior MUST match the natural-language "map codebase / analyze existing code"
  trigger.
- Document only what is verified in the codebase; flag uncertainty explicitly.
</constraints>
