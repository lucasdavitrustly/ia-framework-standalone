---
name: tlc-specify
description: >
  Start a new feature specification with the tlc-spec-driven workflow. Creates a
  git branch for the new spec, then captures testable, traceable requirements
  (spec.md). This is the entry point of the 4-phase workflow.
argument-hint: '"<feature description>"'
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **Specify** phase of the tlc-spec-driven skill for a new feature
described by `$ARGUMENTS`. Capture WHAT the feature must do and WHY, as testable
requirements — and create a dedicated git branch for the spec first.
</objective>

<process>
1. **Validate input**: if `$ARGUMENTS` is empty, PROMPT the user for a one-line
   feature description and wait — do NOT produce an empty spec.
2. **Create the branch (FIRST, before writing any spec artifact)**:
   - Run the skill's self-contained branch helper from the tlc-spec-driven skill
     directory:
     `sh scripts/new-feature-branch.sh --json --kind feature "<feature description>"`
   - Parse the returned JSON `{BRANCH_NAME, FEATURE_NUM}`. If the branch already
     exists, the helper switches to it (no overwrite). If the helper reports it is
     not a git repository, surface that message and ask how to proceed.
3. **Run the Specify phase**: load the skill reference `references/specify.md` and
   follow it as authoritative. Create the feature's `spec.md` (and a quality
   checklist) under the skill's `.specs/features/<FEATURE_NUM>-<slug>/` directory,
   using the `FEATURE_NUM` from step 2 so the spec number and branch number match.
</process>

<constraints>
- Behavior MUST match the natural-language "specify feature" trigger, except that
  a branch is now always created first.
- The branch helper is self-contained and MUST NOT depend on SpecKit / `.specify/`.
- Do not design or implement here; this phase only specifies.
</constraints>
